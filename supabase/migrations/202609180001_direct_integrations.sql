-- Direct providers keep separate leases and reuse the existing atomic bank publisher.
alter table public.integrations drop constraint integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check check (provider in ('qonto','tiime','pennylane','revolut','bunq'));

create or replace function public.acquire_direct_banking_sync(p_owner_user_id uuid, p_run_id uuid, p_provider text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.integrations; v_now timestamptz; v_from timestamptz; v_initial date; v_timezone text;
begin
  if p_provider is null or p_provider not in ('revolut','bunq','pennylane') then raise exception 'DATABASE_ERROR'; end if;
  perform public.banking_require_owner(p_owner_user_id);
  insert into public.integrations(owner_user_id,provider) values(p_owner_user_id,p_provider) on conflict(owner_user_id,provider) do nothing;
  select * into strict v from public.integrations where owner_user_id=p_owner_user_id and provider=p_provider for update;
  v_now := clock_timestamp();
  if v.lease_expires_at > v_now then raise exception using errcode='P0001',message='SYNC_LOCKED'; end if;
  if p_run_id is null or exists(select 1 from public.sync_runs where id=p_run_id) then
    raise exception using errcode='P0001',message='DATABASE_ERROR';
  end if;
  if v.lease_run_id is not null then
    update public.sync_runs set status='interrupted',finished_at=v_now where id=v.lease_run_id and owner_user_id=p_owner_user_id and status='running';
    perform public.banking_clear_staging(p_owner_user_id,v.lease_run_id);
  end if;
  select timezone into strict v_timezone from public.app_settings where owner_user_id=p_owner_user_id;
  v_initial := coalesce(v.initial_created_from,((v_now at time zone v_timezone)::date - interval '6 months')::date);
  v_from := coalesce(v.last_published_updated_to - interval '5 minutes', v_initial::timestamp at time zone v_timezone);
  insert into public.sync_runs(id,owner_user_id,integration_id,initial_created_from,updated_from,updated_to)
    values(p_run_id,p_owner_user_id,v.id,v_initial,v_from,v_now);
  update public.integrations set lease_run_id=p_run_id,lease_expires_at=v_now+interval '60 seconds',
    initial_created_from=v_initial,status='syncing',last_error_code=null where id=v.id;
  return jsonb_build_object(
    'integration_id',v.id,
    'run_id',p_run_id,
    'initial_created_from',v_initial,
    'initial_created_from_instant',v_initial::timestamp at time zone v_timezone,
    'updated_from',v_from,
    'updated_to',v_now
  );
exception when sqlstate '42501' or raise_exception then raise;
  when others then raise exception using errcode='P0001',message='DATABASE_ERROR';
end;
$$;

create or replace function public.banking_locked_integration(p_owner_user_id uuid, p_run_id uuid)
returns public.integrations language plpgsql security definer set search_path = '' as $$
declare v public.integrations;
begin
  perform public.banking_require_owner(p_owner_user_id);
  select * into v from public.integrations where owner_user_id=p_owner_user_id and id=(select integration_id from public.sync_runs where id=p_run_id and owner_user_id=p_owner_user_id) for update;
  if not found or v.lease_run_id is distinct from p_run_id or p_run_id is null
    or v.lease_expires_at <= clock_timestamp()
    or not exists (select 1 from public.sync_runs where id=p_run_id and owner_user_id=p_owner_user_id and integration_id=v.id and status='running') then
    raise exception using errcode='P0001', message='SYNC_LOCKED';
  end if;
  return v;
end;
$$;

create or replace function public.publish_banking_sync(p_owner_user_id uuid, p_run_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.integrations; r public.sync_runs; a public.bank_account_staging; t public.bank_transaction_staging;
  v_id uuid; v_account_id uuid; v_created integer:=0; v_updated integer:=0; v_count integer;
begin
  perform public.banking_require_owner(p_owner_user_id);
  -- Lock before inspecting status so concurrent successful publications can replay safely.
  select * into v from public.integrations where owner_user_id=p_owner_user_id and id=(select integration_id from public.sync_runs where id=p_run_id and owner_user_id=p_owner_user_id) for update;
  select * into r from public.sync_runs where owner_user_id=p_owner_user_id and integration_id=v.id and id=p_run_id;
  if r.status='succeeded' then return jsonb_build_object('created',r.created_count,'updated',r.updated_count); end if;
  v := public.banking_locked_integration(p_owner_user_id,p_run_id);
  if not exists(select 1 from public.banking_sync_pages where owner_user_id=p_owner_user_id and run_id=p_run_id and kind='accounts' and next_page is null)
    or exists(select 1 from public.bank_account_staging staged where staged.owner_user_id=p_owner_user_id and staged.run_id=p_run_id and not exists (
      select 1 from public.banking_sync_pages p where p.owner_user_id=p_owner_user_id and p.run_id=p_run_id and p.kind='transactions' and p.account_external_id=staged.external_id and p.next_page is null)) then raise exception 'DATABASE_ERROR'; end if;
  for a in select * from public.bank_account_staging where owner_user_id=p_owner_user_id and run_id=p_run_id loop
    select id into v_id from public.bank_accounts where owner_user_id=p_owner_user_id and integration_id=v.id and external_id=a.external_id;
    if not found then
      insert into public.bank_accounts(owner_user_id,integration_id,external_id,name,iban_masked,currency,current_balance_cents,available_balance_cents,status,updated_at)
      values(p_owner_user_id,v.id,a.external_id,a.name,a.iban_masked,a.currency,a.current_balance_cents,a.available_balance_cents,a.status,a.updated_at) returning id into v_id;
      v_created:=v_created+1;
    else
      update public.bank_accounts b set name=a.name,iban_masked=a.iban_masked,currency=a.currency,current_balance_cents=a.current_balance_cents,available_balance_cents=a.available_balance_cents,status=a.status,updated_at=a.updated_at,is_current=true
      where b.id=v_id and (b.name,b.iban_masked,b.currency,b.current_balance_cents,b.available_balance_cents,b.status,b.updated_at,b.is_current)
        is distinct from (a.name,a.iban_masked,a.currency,a.current_balance_cents,a.available_balance_cents,a.status,a.updated_at,true);
      get diagnostics v_count = row_count; v_updated:=v_updated+v_count;
    end if;
    insert into public.provider_object_mappings(owner_user_id,integration_id,object_kind,external_id,bank_account_id)
    values(p_owner_user_id,v.id,'account',a.external_id,v_id) on conflict(owner_user_id,integration_id,object_kind,external_id) do update set bank_account_id=excluded.bank_account_id;
  end loop;
  for t in select * from public.bank_transaction_staging where owner_user_id=p_owner_user_id and run_id=p_run_id loop
    select id into v_account_id from public.bank_accounts where owner_user_id=p_owner_user_id and integration_id=v.id and external_id=t.account_external_id and currency=t.currency;
    if not found then raise exception 'DATABASE_ERROR'; end if;
    select id into v_id from public.bank_transactions where owner_user_id=p_owner_user_id and integration_id=v.id and external_id=t.external_id;
    if not found then
      insert into public.bank_transactions(owner_user_id,integration_id,bank_account_id,external_id,currency,amount_cents,direction,status,label,counterparty,transaction_date,value_date,updated_at)
      values(p_owner_user_id,v.id,v_account_id,t.external_id,t.currency,t.amount_cents,t.direction,t.status,t.label,t.counterparty,t.transaction_date,t.value_date,t.updated_at) returning id into v_id;
      v_created:=v_created+1;
    else
      if exists(select 1 from public.bank_transactions where id=v_id and bank_account_id<>v_account_id) then raise exception 'DATABASE_ERROR'; end if;
      update public.bank_transactions b set currency=t.currency,amount_cents=t.amount_cents,direction=t.direction,status=t.status,label=t.label,counterparty=t.counterparty,transaction_date=t.transaction_date,value_date=t.value_date,updated_at=t.updated_at
      where b.id=v_id and t.updated_at>=b.updated_at and (b.currency,b.amount_cents,b.direction,b.status,b.label,b.counterparty,b.transaction_date,b.value_date,b.updated_at)
        is distinct from (t.currency,t.amount_cents,t.direction,t.status,t.label,t.counterparty,t.transaction_date,t.value_date,t.updated_at);
      get diagnostics v_count = row_count; v_updated:=v_updated+v_count;
    end if;
    insert into public.provider_object_mappings(owner_user_id,integration_id,object_kind,external_id,bank_transaction_id)
    values(p_owner_user_id,v.id,'transaction',t.external_id,v_id) on conflict(owner_user_id,integration_id,object_kind,external_id) do update set bank_transaction_id=excluded.bank_transaction_id;
  end loop;
  update public.bank_accounts b set is_current=false where b.owner_user_id=p_owner_user_id and b.integration_id=v.id and b.is_current
    and not exists(select 1 from public.bank_account_staging staged where staged.owner_user_id=p_owner_user_id and staged.run_id=p_run_id and staged.external_id=b.external_id);
  get diagnostics v_count = row_count; v_updated:=v_updated+v_count;
  perform public.banking_locked_integration(p_owner_user_id,p_run_id);
  update public.sync_runs set status='succeeded',finished_at=clock_timestamp(),created_count=v_created,updated_count=v_updated where id=p_run_id;
  update public.integrations set status='connected',last_connection_succeeded=true,last_success_at=clock_timestamp(),last_published_updated_to=r.updated_to,last_error_code=null,lease_run_id=null,lease_expires_at=null where id=v.id;
  perform public.banking_clear_staging(p_owner_user_id,p_run_id);
  return jsonb_build_object('created',v_created,'updated',v_updated);
exception when sqlstate '42501' or raise_exception then raise;
  when others then raise exception using errcode='P0001',message='DATABASE_ERROR';
end;
$$;

create or replace function public.fail_banking_sync(p_owner_user_id uuid, p_run_id uuid, p_error_code text, p_connection_succeeded boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.integrations;
begin
  perform public.banking_require_owner(p_owner_user_id);
  -- A lost failure response may be retried even after a newer run acquired the lease.
  -- Lock before reading the outcome; terminal replay is a no-op preserving its first result.
  select * into v from public.integrations where owner_user_id=p_owner_user_id and id=(select integration_id from public.sync_runs where id=p_run_id and owner_user_id=p_owner_user_id) for update;
  if exists (select 1 from public.sync_runs where owner_user_id=p_owner_user_id
    and integration_id=v.id and id=p_run_id and status='failed') then return; end if;
  v := public.banking_locked_integration(p_owner_user_id,p_run_id);
  if p_error_code is null or p_error_code not in ('PROVIDER_AUTH_EXPIRED','PROVIDER_RATE_LIMIT','PROVIDER_UNAVAILABLE','PROVIDER_INVALID_RESPONSE','SYNC_LOCKED','DATABASE_ERROR') or p_connection_succeeded is null then raise exception 'DATABASE_ERROR'; end if;
  update public.sync_runs set status='failed',finished_at=clock_timestamp(),error_code=p_error_code where id=p_run_id;
  update public.integrations set status='error',last_connection_succeeded=p_connection_succeeded,last_error_code=p_error_code,lease_run_id=null,lease_expires_at=null where id=v.id;
  perform public.banking_clear_staging(p_owner_user_id,p_run_id);
end;
$$;
revoke all on function public.acquire_direct_banking_sync(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.acquire_direct_banking_sync(uuid,uuid,text) to service_role;

alter table public.customers add column provider text not null default 'manual' check (provider in ('manual','pennylane'));
alter table public.customers add column external_id text;
create unique index customers_provider_identity on public.customers(owner_user_id,provider,external_id) where external_id is not null;
alter table public.invoices drop constraint invoices_provider_check;
alter table public.invoices add constraint invoices_provider_check check (provider in ('manual','csv','pennylane'));
create unique index invoices_provider_identity on public.invoices(owner_user_id,provider,external_id) where external_id is not null;

-- API snapshots own their amounts. Invoker RPCs and direct table writes cannot override them.
create function public.protect_provider_invoice() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user not in ('postgres','service_role','supabase_admin') then
    if tg_table_name='invoices' then
      if (tg_op<>'INSERT' and old.provider='pennylane') or (tg_op<>'DELETE' and new.provider='pennylane') then
        raise exception 'FC_PROVIDER_MANAGED';
      end if;
    elsif exists(select 1 from public.invoices where id=case when tg_op='DELETE' then old.invoice_id else new.invoice_id end and provider='pennylane')
      or (tg_op='UPDATE' and exists(select 1 from public.invoices where id=old.invoice_id and provider='pennylane')) then
      raise exception 'FC_PROVIDER_MANAGED';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger protect_provider_invoice before insert or update or delete on public.invoices for each row execute function public.protect_provider_invoice();
create trigger protect_provider_payment before insert or update or delete on public.invoice_payments for each row execute function public.protect_provider_invoice();

create function public.publish_pennylane_sync(p_owner_user_id uuid,p_run_id uuid,p_invoices jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.integrations; r public.sync_runs; x jsonb; k text; v_customer uuid; v_invoice uuid;
  v_paid bigint; v_created integer:=0; v_updated integer:=0; v_seen text[]:='{}';
begin
  perform public.banking_require_owner(p_owner_user_id);
  select * into v from public.integrations where owner_user_id=p_owner_user_id and provider='pennylane' for update;
  select * into r from public.sync_runs where owner_user_id=p_owner_user_id and integration_id=v.id and id=p_run_id;
  if r.status='succeeded' then return jsonb_build_object('created',r.created_count,'updated',r.updated_count); end if;
  v:=public.banking_locked_integration(p_owner_user_id,p_run_id);
  if v.provider<>'pennylane' or jsonb_typeof(p_invoices) is distinct from 'array' or jsonb_array_length(p_invoices)>10000 then raise exception 'DATABASE_ERROR'; end if;
  for x in select value from jsonb_array_elements(p_invoices) loop
    if jsonb_typeof(x) is distinct from 'object' or x->>'currency' is distinct from 'EUR'
      or x#>>'{payment,kind}' is distinct from 'known' then raise exception 'DATABASE_ERROR'; end if;
    foreach k in array array['externalId','invoiceNumber','issuedAt','dueAt','status'] loop
      if jsonb_typeof(x->k) is distinct from 'string' or length(trim(x->>k)) not between 1 and 500 then raise exception 'DATABASE_ERROR'; end if;
    end loop;
    foreach k in array array['amountHtCents','amountVatCents','amountTtcCents'] loop
      if jsonb_typeof(x->k) is distinct from 'number' or (x->>k)!~'^[0-9]+$' or (x->>k)::numeric>9007199254740991 then raise exception 'DATABASE_ERROR'; end if;
    end loop;
    if jsonb_typeof(x#>'{customer,externalId}') is distinct from 'string' or length(trim(x#>>'{customer,externalId}')) not between 1 and 500
      or jsonb_typeof(x#>'{customer,name}') is distinct from 'string' or length(trim(x#>>'{customer,name}')) not between 1 and 500
      or jsonb_typeof(x#>'{payment,paidAmountCents}') is distinct from 'number'
      or (x#>>'{payment,paidAmountCents}')!~'^[0-9]+$'
      or (x#>>'{payment,paidAmountCents}')::numeric>9007199254740991
      or x->>'status' not in ('issued','partially_paid','paid','overdue','cancelled')
      or (x->>'issuedAt')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (x->>'dueAt')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or (x->>'externalId')=any(v_seen) then raise exception 'DATABASE_ERROR'; end if;
    v_seen:=array_append(v_seen,x->>'externalId');
    v_paid:=(x#>>'{payment,paidAmountCents}')::bigint;
    insert into public.customers(owner_user_id,provider,external_id,name)
      values(p_owner_user_id,'pennylane',x#>>'{customer,externalId}',x#>>'{customer,name}')
      on conflict(owner_user_id,provider,external_id) where external_id is not null do update set name=excluded.name
      returning id into v_customer;
    select id into v_invoice from public.invoices where owner_user_id=p_owner_user_id and provider='pennylane' and external_id=x->>'externalId';
    if v_invoice is null then
      insert into public.invoices(owner_user_id,customer_id,provider,external_id,invoice_number,issued_at,due_at,expected_payment_date,
        amount_ht_cents,vat_cents,amount_ttc_cents,paid_amount_cents,status,paid_at)
      values(p_owner_user_id,v_customer,'pennylane',x->>'externalId',x->>'invoiceNumber',(x->>'issuedAt')::date,(x->>'dueAt')::date,(x->>'dueAt')::date,
        (x->>'amountHtCents')::bigint,(x->>'amountVatCents')::bigint,(x->>'amountTtcCents')::bigint,v_paid,
        case when x->>'status'='cancelled' then 'cancelled' when v_paid=(x->>'amountTtcCents')::bigint then 'paid' when v_paid>0 then 'partially_paid' else x->>'status' end,null);
      v_created:=v_created+1;
    else
      update public.invoices set customer_id=v_customer,invoice_number=x->>'invoiceNumber',issued_at=(x->>'issuedAt')::date,
        due_at=(x->>'dueAt')::date,expected_payment_date=(x->>'dueAt')::date,amount_ht_cents=(x->>'amountHtCents')::bigint,
        vat_cents=(x->>'amountVatCents')::bigint,amount_ttc_cents=(x->>'amountTtcCents')::bigint,paid_amount_cents=v_paid,
        status=case when x->>'status'='cancelled' then 'cancelled' when v_paid=(x->>'amountTtcCents')::bigint then 'paid' when v_paid>0 then 'partially_paid' else x->>'status' end,
        paid_at=null,updated_at=clock_timestamp() where id=v_invoice;
      v_updated:=v_updated+1;
    end if;
  end loop;
  -- Missing/deleted API objects are retained: absence alone is not a cancellation.
  perform public.banking_locked_integration(p_owner_user_id,p_run_id);
  update public.sync_runs set status='succeeded',finished_at=clock_timestamp(),created_count=v_created,updated_count=v_updated where id=p_run_id;
  update public.integrations set status='connected',last_connection_succeeded=true,last_success_at=clock_timestamp(),last_published_updated_to=r.updated_to,
    last_error_code=null,lease_run_id=null,lease_expires_at=null where id=v.id;
  return jsonb_build_object('created',v_created,'updated',v_updated);
exception when sqlstate '42501' or raise_exception then raise;
  when others then raise exception using errcode='P0001',message='DATABASE_ERROR';
end;
$$;
revoke all on function public.publish_pennylane_sync(uuid,uuid,jsonb), public.protect_provider_invoice() from public,anon,authenticated;
grant execute on function public.publish_pennylane_sync(uuid,uuid,jsonb) to service_role;
