-- Every entry point uses a single integration row lock, database time and a fenced run ID.
create or replace function public.banking_require_owner(p_owner_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.app_settings where owner_user_id = p_owner_user_id for key share;
  if not found then raise exception using errcode='42501', message='DATABASE_ERROR'; end if;
end;
$$;

create or replace function public.banking_locked_integration(p_owner_user_id uuid, p_run_id uuid)
returns public.integrations language plpgsql security definer set search_path = '' as $$
declare v public.integrations;
begin
  perform public.banking_require_owner(p_owner_user_id);
  select * into v from public.integrations where owner_user_id=p_owner_user_id and provider='qonto' for update;
  if not found or v.lease_run_id is distinct from p_run_id or p_run_id is null
    or v.lease_expires_at <= clock_timestamp()
    or not exists (select 1 from public.sync_runs where id=p_run_id and owner_user_id=p_owner_user_id and integration_id=v.id and status='running') then
    raise exception using errcode='P0001', message='SYNC_LOCKED';
  end if;
  return v;
end;
$$;

create or replace function public.banking_clear_staging(p_owner_user_id uuid, p_run_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.bank_transaction_staging where owner_user_id=p_owner_user_id and run_id=p_run_id;
  delete from public.bank_account_staging where owner_user_id=p_owner_user_id and run_id=p_run_id;
  delete from public.banking_sync_pages where owner_user_id=p_owner_user_id and run_id=p_run_id;
$$;

create or replace function public.acquire_banking_sync(p_owner_user_id uuid, p_run_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.integrations; v_now timestamptz; v_from timestamptz; v_initial date; v_timezone text;
begin
  perform public.banking_require_owner(p_owner_user_id);
  insert into public.integrations(owner_user_id,provider) values(p_owner_user_id,'qonto') on conflict(owner_user_id,provider) do nothing;
  select * into strict v from public.integrations where owner_user_id=p_owner_user_id and provider='qonto' for update;
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

create or replace function public.renew_banking_sync(p_owner_user_id uuid, p_run_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.integrations;
begin
  v := public.banking_locked_integration(p_owner_user_id,p_run_id);
  update public.integrations set lease_expires_at=clock_timestamp()+interval '60 seconds' where id=v.id;
end;
$$;

-- Validate JSON scalars before PostgreSQL casts. Raw provider JSON is never retained.
create or replace function public.banking_validate_item(p_item jsonb, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if jsonb_typeof(p_item) is distinct from 'object' then raise exception 'DATABASE_ERROR'; end if;
  foreach k in array case when p_kind='accounts' then array['external_id','name','currency','status','updated_at']
    else array['external_id','account_external_id','currency','direction','status','label','transaction_date','updated_at'] end loop
    if jsonb_typeof(p_item->k) is distinct from 'string' then raise exception 'DATABASE_ERROR'; end if;
  end loop;
  foreach k in array case when p_kind='accounts' then array['current_balance_cents'] else array['amount_cents'] end loop
    if jsonb_typeof(p_item->k) is distinct from 'number' or (p_item->>k) !~ '^-?[0-9]+$' then raise exception 'DATABASE_ERROR'; end if;
  end loop;
  if p_kind='accounts' then
    if p_item->'available_balance_cents' is not null and p_item->'available_balance_cents'<>'null'::jsonb and
      (jsonb_typeof(p_item->'available_balance_cents')<>'number' or (p_item->>'available_balance_cents') !~ '^-?[0-9]+$') then raise exception 'DATABASE_ERROR'; end if;
    if p_item->'iban_masked' is not null and p_item->'iban_masked'<>'null'::jsonb and jsonb_typeof(p_item->'iban_masked')<>'string' then raise exception 'DATABASE_ERROR'; end if;
  else
    foreach k in array array['counterparty','value_date'] loop
      if p_item->k is not null and p_item->k<>'null'::jsonb and jsonb_typeof(p_item->k)<>'string' then raise exception 'DATABASE_ERROR'; end if;
    end loop;
    if (p_item->>'transaction_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or (p_item->>'value_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'DATABASE_ERROR'; end if;
  end if;
  if (p_item->>'updated_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'DATABASE_ERROR'; end if;
end;
$$;

create or replace function public.stage_banking_page(p_owner_user_id uuid, p_run_id uuid, p_kind text,
  p_account_external_id text, p_page integer, p_next_page integer, p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.integrations; v_stream text; v_receipt public.banking_sync_pages; v_expected integer; x jsonb; v_fingerprint text;
begin
  v := public.banking_locked_integration(p_owner_user_id,p_run_id);
  if p_kind is null or p_kind not in ('accounts','transactions') or p_page is null or p_page<1
    or (p_next_page is not null and p_next_page<>p_page+1)
    or jsonb_typeof(p_items) is distinct from 'array'
    or (p_kind='accounts' and p_account_external_id is not null)
    or (p_kind='transactions' and (p_account_external_id is null or not exists (
      select 1 from public.bank_account_staging where owner_user_id=p_owner_user_id and run_id=p_run_id and external_id=p_account_external_id))) then
    raise exception 'DATABASE_ERROR';
  end if;
  v_stream := coalesce(p_account_external_id,'');
  v_fingerprint := encode(extensions.digest(p_items::text,'sha256'),'hex');
  select * into v_receipt from public.banking_sync_pages where owner_user_id=p_owner_user_id and run_id=p_run_id and kind=p_kind and account_external_id=v_stream and page=p_page;
  if found then
    if v_receipt.next_page is distinct from p_next_page or v_receipt.fingerprint<>v_fingerprint then raise exception 'DATABASE_ERROR'; end if;
    return;
  end if;
  select next_page into v_expected from public.banking_sync_pages where owner_user_id=p_owner_user_id and run_id=p_run_id and kind=p_kind and account_external_id=v_stream order by page desc limit 1;
  if not found then v_expected:=1; end if;
  if p_page is distinct from v_expected then raise exception 'DATABASE_ERROR'; end if;
  for x in select value from jsonb_array_elements(p_items) loop
    perform public.banking_validate_item(x,p_kind);
    if p_kind='accounts' then
      insert into public.bank_account_staging(owner_user_id,integration_id,run_id,external_id,name,iban_masked,currency,current_balance_cents,available_balance_cents,status,updated_at)
      values(p_owner_user_id,v.id,p_run_id,x->>'external_id',x->>'name',x->>'iban_masked',x->>'currency',(x->>'current_balance_cents')::bigint,(x->>'available_balance_cents')::bigint,x->>'status',(x->>'updated_at')::timestamptz)
      on conflict(owner_user_id,run_id,external_id) do update set name=excluded.name,iban_masked=excluded.iban_masked,currency=excluded.currency,current_balance_cents=excluded.current_balance_cents,available_balance_cents=excluded.available_balance_cents,status=excluded.status,updated_at=excluded.updated_at
      where excluded.updated_at >= bank_account_staging.updated_at;
    else
      if x->>'account_external_id' is distinct from p_account_external_id or exists (
        select 1 from public.bank_transaction_staging where owner_user_id=p_owner_user_id and run_id=p_run_id and external_id=x->>'external_id' and account_external_id<>p_account_external_id
      ) then raise exception 'DATABASE_ERROR'; end if;
      insert into public.bank_transaction_staging(owner_user_id,integration_id,run_id,external_id,account_external_id,currency,amount_cents,direction,status,label,counterparty,transaction_date,value_date,updated_at)
      values(p_owner_user_id,v.id,p_run_id,x->>'external_id',p_account_external_id,x->>'currency',(x->>'amount_cents')::bigint,x->>'direction',x->>'status',x->>'label',x->>'counterparty',(x->>'transaction_date')::date,(x->>'value_date')::date,(x->>'updated_at')::timestamptz)
      on conflict(owner_user_id,run_id,external_id) do update set currency=excluded.currency,amount_cents=excluded.amount_cents,direction=excluded.direction,status=excluded.status,label=excluded.label,counterparty=excluded.counterparty,transaction_date=excluded.transaction_date,value_date=excluded.value_date,updated_at=excluded.updated_at
      where excluded.updated_at >= bank_transaction_staging.updated_at;
    end if;
  end loop;
  insert into public.banking_sync_pages(owner_user_id,integration_id,run_id,kind,account_external_id,page,next_page,fingerprint)
    values(p_owner_user_id,v.id,p_run_id,p_kind,v_stream,p_page,p_next_page,v_fingerprint);
  -- Abort the whole page if the lease elapsed during persistence.
  perform public.banking_locked_integration(p_owner_user_id,p_run_id);
  update public.integrations set lease_expires_at=clock_timestamp()+interval '60 seconds' where id=v.id;
exception when sqlstate '42501' or raise_exception then raise;
  when others then raise exception using errcode='P0001',message='DATABASE_ERROR';
end;
$$;

create or replace function public.publish_banking_sync(p_owner_user_id uuid, p_run_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.integrations; r public.sync_runs; a public.bank_account_staging; t public.bank_transaction_staging;
  v_id uuid; v_account_id uuid; v_created integer:=0; v_updated integer:=0; v_count integer;
begin
  perform public.banking_require_owner(p_owner_user_id);
  -- Lock before inspecting status so concurrent successful publications can replay safely.
  select * into v from public.integrations where owner_user_id=p_owner_user_id and provider='qonto' for update;
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
  select * into v from public.integrations where owner_user_id=p_owner_user_id and provider='qonto' for update;
  if exists (select 1 from public.sync_runs where owner_user_id=p_owner_user_id
    and integration_id=v.id and id=p_run_id and status='failed') then return; end if;
  v := public.banking_locked_integration(p_owner_user_id,p_run_id);
  if p_error_code is null or p_error_code not in ('PROVIDER_AUTH_EXPIRED','PROVIDER_RATE_LIMIT','PROVIDER_UNAVAILABLE','PROVIDER_INVALID_RESPONSE','SYNC_LOCKED','DATABASE_ERROR') or p_connection_succeeded is null then raise exception 'DATABASE_ERROR'; end if;
  update public.sync_runs set status='failed',finished_at=clock_timestamp(),error_code=p_error_code where id=p_run_id;
  update public.integrations set status='error',last_connection_succeeded=p_connection_succeeded,last_error_code=p_error_code,lease_run_id=null,lease_expires_at=null where id=v.id;
  perform public.banking_clear_staging(p_owner_user_id,p_run_id);
end;
$$;

revoke all on function public.banking_require_owner(uuid), public.banking_locked_integration(uuid,uuid), public.banking_clear_staging(uuid,uuid), public.banking_validate_item(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.acquire_banking_sync(uuid,uuid), public.renew_banking_sync(uuid,uuid), public.stage_banking_page(uuid,uuid,text,text,integer,integer,jsonb), public.publish_banking_sync(uuid,uuid), public.fail_banking_sync(uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.acquire_banking_sync(uuid,uuid), public.renew_banking_sync(uuid,uuid), public.stage_banking_page(uuid,uuid,text,text,integer,integer,jsonb), public.publish_banking_sync(uuid,uuid), public.fail_banking_sync(uuid,uuid,text,boolean) to service_role;
