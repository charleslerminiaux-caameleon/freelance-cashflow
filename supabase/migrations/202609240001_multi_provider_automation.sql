-- Extend the established automatic admission and recurring-decision protocol to direct providers.

create or replace function public.acquire_automatic_direct_banking_sync(p_owner_user_id uuid, p_run_id uuid, p_provider text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.integrations; v_now timestamptz; v_result jsonb;
begin
  if p_provider is null or p_provider not in ('qonto','revolut','bunq','pennylane') then raise exception 'DATABASE_ERROR'; end if;
  perform public.banking_require_owner(p_owner_user_id);
  select * into v from public.integrations
    where owner_user_id=p_owner_user_id and provider=p_provider for update;
  if not found then return null; end if;
  -- Read time and the latest row after waiting, including a preceding publication.
  v_now := clock_timestamp();
  if v.last_success_at is null or not isfinite(v.last_success_at)
    or v.last_success_at > v_now-interval '5 minutes'
    or v.lease_expires_at > v_now
    or (v.last_auto_attempt_at > v_now-interval '15 minutes'
      and v.last_success_at <= v.last_auto_attempt_at) then
    return null;
  end if;
  if p_provider='qonto' then
    v_result := public.acquire_banking_sync(p_owner_user_id,p_run_id);
  else
    v_result := public.acquire_direct_banking_sync(p_owner_user_id,p_run_id,p_provider);
  end if;
  update public.integrations set last_auto_attempt_at=v_now where id=v.id;
  return v_result;
exception when sqlstate '42501' or raise_exception then raise;
  when others then raise exception using errcode='P0001',message='DATABASE_ERROR';
end;
$$;

create or replace function public.acquire_automatic_banking_sync(p_owner_user_id uuid,p_run_id uuid) returns jsonb
language sql security definer set search_path='' as $$
  select public.acquire_automatic_direct_banking_sync(p_owner_user_id,p_run_id,'qonto');
$$;

create or replace function public.recurring_locked_direct_integration(p_owner_user_id uuid,p_provider text) returns public.integrations
language plpgsql security definer set search_path = '' as $$
declare v public.integrations;
begin
  perform 1 from public.app_settings where owner_user_id=p_owner_user_id for key share;
  if not found then raise exception using errcode='42501',message='DETECTION_INVALID'; end if;
  if p_provider is null or p_provider not in ('qonto','revolut','bunq') then raise exception 'DETECTION_SOURCE_UNAVAILABLE'; end if;
  select * into v from public.integrations where owner_user_id=p_owner_user_id and provider=p_provider for update;
  if not found or v.last_success_at is null then raise exception 'DETECTION_SOURCE_UNAVAILABLE'; end if;
  return v;
end;
$$;

-- Resolve identity without taking a suggestion/transaction lock first, preserving
-- integration -> analysis -> decision -> charge lock ordering across all banks.
create function public.recurring_locked_decision_integration(p_owner_user_id uuid,p_integration_id uuid) returns public.integrations
language plpgsql security definer set search_path='' as $$
declare v public.integrations;
begin
  perform 1 from public.app_settings where owner_user_id=p_owner_user_id for key share;
  if not found then raise exception using errcode='42501',message='DETECTION_INVALID'; end if;
  select * into v from public.integrations where owner_user_id=p_owner_user_id and id=p_integration_id
    and provider in ('qonto','revolut','bunq') for update;
  if not found then raise exception 'DETECTION_NOT_FOUND'; end if;
  if v.last_success_at is null then raise exception 'DETECTION_SOURCE_UNAVAILABLE'; end if;
  return v;
end;
$$;

create or replace function public.acquire_direct_recurring_analysis(p_owner_user_id uuid,p_run_id uuid,p_provider text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.integrations; r public.recurring_detection_runs; t timestamptz;
begin
  i:=public.recurring_locked_direct_integration(p_owner_user_id,p_provider);
  if p_run_id is null then raise exception 'DETECTION_INVALID'; end if;
  insert into public.recurring_detection_runs(owner_user_id,integration_id) values(p_owner_user_id,i.id) on conflict do nothing;
  select * into strict r from public.recurring_detection_runs where owner_user_id=p_owner_user_id and integration_id=i.id for update;
  t:=clock_timestamp();
  if r.lease_expires_at>t then raise exception 'DETECTION_LOCKED'; end if;
  -- A timed-out worker may never reacquire its expired fencing token.
  if r.lease_run_id=p_run_id then raise exception 'DETECTION_INVALID'; end if;
  update public.recurring_detection_runs set lease_run_id=p_run_id,lease_expires_at=t+interval '60 seconds',last_attempt_at=t,last_error_code=null
    where owner_user_id=p_owner_user_id and integration_id=i.id;
  return jsonb_build_object('integration_id',i.id,'source_publication',i.last_success_at,'lease_expires_at',t+interval '60 seconds');
end;
$$;

create or replace function public.acquire_recurring_analysis(p_owner_user_id uuid,p_run_id uuid) returns jsonb
language sql security definer set search_path='' as $$
  select public.acquire_direct_recurring_analysis(p_owner_user_id,p_run_id,'qonto');
$$;

create or replace function public.publish_direct_recurring_analysis(p_owner_user_id uuid,p_run_id uuid,p_provider text,p_source_publication timestamptz,p_candidates jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.integrations; c jsonb; a uuid; sid uuid; ids uuid[]; n integer; today date; v_currency text; last_date date; next_date date; amount bigint; day integer; key text; seen text[]:='{}';
begin
  i:=public.recurring_locked_direct_integration(p_owner_user_id,p_provider);
  perform public.recurring_require_lease(p_owner_user_id,i.id,p_run_id);
  if p_source_publication is distinct from i.last_success_at then raise exception 'DETECTION_STALE'; end if;
  if jsonb_typeof(p_candidates) is distinct from 'array' or jsonb_array_length(p_candidates)>10000 then raise exception 'DETECTION_INVALID'; end if;
  select (clock_timestamp() at time zone s.timezone)::date,s.currency into strict today,v_currency from public.app_settings s where owner_user_id=p_owner_user_id;
  update public.recurring_suggestions set eligible=false where owner_user_id=p_owner_user_id and integration_id=i.id and state='pending';
  for c in select value from jsonb_array_elements(p_candidates) loop
    perform public.recurring_validate_fields(c,'candidate');
    a:=(c->>'account_id')::uuid; amount:=(c->>'amount_cents')::bigint; day:=(c->>'day_of_month')::integer;
    last_date:=(c->>'last_payment_date')::date; next_date:=(c->>'next_date')::date;
    key:=jsonb_build_array(a,c->>'currency',c->>'normalized_label')::text;
    if key=any(seen) then raise exception 'DETECTION_INVALID'; end if;
    seen:=array_append(seen,key);
    if c->>'currency'<>v_currency or not exists(select 1 from public.bank_accounts where owner_user_id=p_owner_user_id and integration_id=i.id and id=a and status='active' and is_current and bank_accounts.currency=v_currency)
      or last_date>today or next_date<=today or date_trunc('month',next_date)<=date_trunc('month',last_date)
      or extract(day from next_date)<>least(day,extract(day from (date_trunc('month',next_date)+interval '1 month - 1 day'))) then raise exception 'DETECTION_INVALID'; end if;
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(c->'transaction_ids');
    if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'DETECTION_INVALID'; end if;
    select count(*) into n from public.bank_transactions t where t.id=any(ids) and t.owner_user_id=p_owner_user_id and t.integration_id=i.id and t.bank_account_id=a
      and t.currency=v_currency and t.status='completed' and t.direction='outflow' and t.amount_cents>0
      and t.amount_cents::numeric*10 between amount::numeric*9 and amount::numeric*11
      and public.normalize_recurring_label(t.label)=c->>'normalized_label'
      and t.transaction_date between (today-interval '6 months')::date and today
      and abs(extract(day from t.transaction_date)-least(day,extract(day from (date_trunc('month',t.transaction_date)+interval '1 month - 1 day'))))<=3;
    if n<>cardinality(ids) or last_date<>(select max(transaction_date) from public.bank_transactions where id=any(ids))
      or (select count(distinct date_trunc('month',transaction_date)) from public.bank_transactions where id=any(ids))<>n then raise exception 'DETECTION_INVALID'; end if;
    -- SHA256 only bounds the index key; it never authorizes merging unequal labels.
    if exists(select 1 from public.recurring_suggestions where owner_user_id=p_owner_user_id and integration_id=i.id and bank_account_id=a and recurring_suggestions.currency=v_currency
      and normalized_label_hash=extensions.digest(c->>'normalized_label','sha256') and normalized_label<>c->>'normalized_label') then raise exception 'DETECTION_INVALID'; end if;
    insert into public.recurring_suggestions(owner_user_id,integration_id,bank_account_id,currency,normalized_label,label,amount_cents,day_of_month,last_payment_date,next_date,source_publication)
      values(p_owner_user_id,i.id,a,c->>'currency',c->>'normalized_label',btrim(c->>'label'),amount,day,last_date,next_date,p_source_publication)
      on conflict(owner_user_id,integration_id,bank_account_id,currency,normalized_label_hash,frequency) do update
        set eligible=true,label=excluded.label,amount_cents=excluded.amount_cents,day_of_month=excluded.day_of_month,last_payment_date=excluded.last_payment_date,next_date=excluded.next_date,source_publication=excluded.source_publication,rules_version=excluded.rules_version
        where recurring_suggestions.state='pending'
      returning id into sid;
    -- Confirmed/dismissed rows retain their decision, matching estimates, and evidence.
    if sid is not null then
      delete from public.recurring_suggestion_evidence where suggestion_id=sid;
      insert into public.recurring_suggestion_evidence(owner_user_id,integration_id,suggestion_id,transaction_id) select p_owner_user_id,i.id,sid,x from unnest(ids) x;
    end if;
  end loop;
  update public.recurring_detection_runs set lease_run_id=null,lease_expires_at=null,analyzed_publication=p_source_publication,last_success_at=clock_timestamp(),last_error_code=null where owner_user_id=p_owner_user_id and integration_id=i.id;
exception when sqlstate '42501' or raise_exception then raise;
  when others then raise exception 'DETECTION_INVALID';
end;
$$;

create or replace function public.publish_recurring_analysis(p_owner_user_id uuid,p_run_id uuid,p_source_publication timestamptz,p_candidates jsonb) returns void
language sql security definer set search_path='' as $$
  select public.publish_direct_recurring_analysis(p_owner_user_id,p_run_id,'qonto',p_source_publication,p_candidates);
$$;

create or replace function public.fail_direct_recurring_analysis(p_owner_user_id uuid,p_run_id uuid,p_provider text,p_error_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.integrations;
begin
  i:=public.recurring_locked_direct_integration(p_owner_user_id,p_provider);
  perform public.recurring_require_lease(p_owner_user_id,i.id,p_run_id);
  if p_error_code is null or p_error_code not in ('DETECTION_LOCKED','DETECTION_STALE','DETECTION_INVALID','DETECTION_DUPLICATE','DETECTION_NOT_FOUND','DETECTION_SOURCE_UNAVAILABLE','DATABASE_ERROR') then raise exception 'DETECTION_INVALID'; end if;
  update public.recurring_detection_runs set lease_run_id=null,lease_expires_at=null,last_error_code=p_error_code where owner_user_id=p_owner_user_id and integration_id=i.id;
end;
$$;

create or replace function public.fail_recurring_analysis(p_owner_user_id uuid,p_run_id uuid,p_error_code text) returns void
language sql security definer set search_path='' as $$
  select public.fail_direct_recurring_analysis(p_owner_user_id,p_run_id,'qonto',p_error_code);
$$;

create or replace function public.confirm_recurring_from_transaction(
  p_transaction_id uuid, p_source_publication timestamptz, p_command jsonb,
  p_existing_expense_id uuid default null, p_allow_duplicate boolean default false,
  p_allow_recreate boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid(); i public.integrations; t public.bank_transactions;
  s public.recurring_suggestions; existing public.recurring_cashflows;
  today date; v_currency text; normalized text; category uuid; result uuid;
  start_date date; amount bigint; day integer; observed_day integer; v_next_date date;
  display_label text := ''; character text; units integer := 0;
begin
  i := public.recurring_locked_decision_integration(owner_id,(select integration_id from public.bank_transactions where id=p_transaction_id and owner_user_id=owner_id));
  perform 1 from public.recurring_detection_runs where owner_user_id=owner_id and integration_id=i.id for update;
  if p_source_publication is distinct from i.last_success_at then raise exception 'DETECTION_STALE'; end if;
  select * into t from public.bank_transactions where id=p_transaction_id and owner_user_id=owner_id and integration_id=i.id;
  if not found then raise exception 'DETECTION_NOT_FOUND'; end if;
  select (clock_timestamp() at time zone a.timezone)::date,a.currency into strict today,v_currency
    from public.app_settings a where owner_user_id=owner_id;
  if t.amount_cents not between 1 and 9007199254740991 or t.direction<>'outflow' or t.status<>'completed'
    or t.currency<>v_currency or t.transaction_date>today
    or not exists(select 1 from public.bank_accounts a where a.id=t.bank_account_id and a.owner_user_id=owner_id
      and a.integration_id=i.id and a.status='active' and a.is_current and a.currency=v_currency)
    then raise exception 'DETECTION_INVALID'; end if;
  normalized := public.normalize_recurring_label(t.label);
  if normalized='' then raise exception 'DETECTION_INVALID'; end if;
  -- SHA bounds the index, but never authorizes merging unequal full identities.
  select * into s from public.recurring_suggestions r where r.owner_user_id=owner_id and r.integration_id=i.id
    and r.bank_account_id=t.bank_account_id and r.currency=v_currency and r.frequency='monthly'
    and r.normalized_label_hash=extensions.digest(normalized,'sha256') for update;
  if found and s.normalized_label<>normalized then raise exception 'DETECTION_INVALID'; end if;
  if s.state='confirmed' then return s.recurring_cashflow_id; end if;
  if s.state='dismissed' and not coalesce(p_allow_recreate,false) then raise exception 'DETECTION_INVALID'; end if;
  perform public.recurring_validate_fields(p_command,'command');
  if exists(select 1 from jsonb_object_keys(p_command) k where k not in
    ('label','amount_cents','day_of_month','start_date','category_id','cashflow_kind','certainty','probability_basis_points')) then raise exception 'DETECTION_INVALID'; end if;
  start_date := (p_command->>'start_date')::date; amount := (p_command->>'amount_cents')::bigint;
  day := (p_command->>'day_of_month')::integer; category := (p_command->>'category_id')::uuid;
  if start_date<=today or date_trunc('month',start_date)<=date_trunc('month',t.transaction_date) then raise exception 'DETECTION_INVALID'; end if;
  if category is not null and not exists(select 1 from public.cashflow_categories c where c.id=category and c.owner_user_id=owner_id and c.type in ('outflow','both')) then raise exception 'DETECTION_INVALID'; end if;
  if p_existing_expense_id is not null then
    select * into existing from public.recurring_cashflows r where r.id=p_existing_expense_id and r.owner_user_id=owner_id for update;
    if not found or existing.direction<>'outflow' or existing.cashflow_kind<>'expense' or existing.frequency<>'monthly' then raise exception 'DETECTION_INVALID'; end if;
    if exists(select 1 from public.recurring_suggestions r where r.recurring_cashflow_id=existing.id) then raise exception 'DETECTION_DUPLICATE'; end if;
    result := existing.id;
  elsif not coalesce(p_allow_duplicate,false) and exists(select 1 from public.recurring_cashflows r
    where r.owner_user_id=owner_id and r.direction='outflow' and r.cashflow_kind='expense' and r.frequency='monthly'
      and not exists(select 1 from public.recurring_suggestions linked where linked.recurring_cashflow_id=r.id)
      and public.normalize_recurring_label(r.label)=normalized
      and r.amount_cents::numeric*10 between t.amount_cents::numeric*9 and t.amount_cents::numeric*11)
    then raise exception 'DETECTION_DUPLICATE';
  end if;
  observed_day := extract(day from t.transaction_date);
  v_next_date := (date_trunc('month',greatest(today,t.transaction_date))+interval '1 month')::date;
  -- If a later month has already begun, its scheduled day may still be future.
  if date_trunc('month',today)>date_trunc('month',t.transaction_date) then
    v_next_date := date_trunc('month',today)::date;
  end if;
  v_next_date := v_next_date + (least(observed_day,extract(day from (v_next_date+interval '1 month - 1 day')))::integer-1);
  if v_next_date<=today then
    v_next_date := (date_trunc('month',v_next_date)+interval '1 month')::date;
    v_next_date := v_next_date + (least(observed_day,extract(day from (v_next_date+interval '1 month - 1 day')))::integer-1);
  end if;
  -- Same UTF-16 display budget as the domain helper; never split an astral scalar.
  for character in select regexp_split_to_table(btrim(t.label,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),'') loop
    units := units + case when ascii(character)>65535 then 2 else 1 end;
    exit when units>160;
    display_label := display_label || character;
  end loop;
  if result is null then
    insert into public.recurring_cashflows(owner_user_id,direction,cashflow_kind,label,category_id,amount_cents,frequency,day_of_month,start_date,certainty,probability_basis_points,active)
      values(owner_id,'outflow','expense',btrim(p_command->>'label'),category,amount,'monthly',day,start_date,p_command->>'certainty',(p_command->>'probability_basis_points')::integer,true) returning id into result;
  end if;
  -- All validation precedes persistence. Baseline comes exclusively from the
  -- selected transaction, while edited fields belong exclusively to the charge.
  if s.id is null then
    insert into public.recurring_suggestions(owner_user_id,integration_id,bank_account_id,currency,normalized_label,label,amount_cents,day_of_month,last_payment_date,next_date,source_publication,state,recurring_cashflow_id,creation_source)
      values(owner_id,i.id,t.bank_account_id,v_currency,normalized,display_label,t.amount_cents,observed_day,t.transaction_date,v_next_date,p_source_publication,'confirmed',result,'history') returning * into s;
  else
    update public.recurring_suggestions r set state='confirmed',eligible=true,recurring_cashflow_id=result,creation_source='history',
      label=display_label,amount_cents=t.amount_cents,day_of_month=observed_day,last_payment_date=t.transaction_date,
      next_date=v_next_date,source_publication=p_source_publication where r.id=s.id;
  end if;
  delete from public.recurring_suggestion_evidence where suggestion_id=s.id;
  insert into public.recurring_suggestion_evidence(owner_user_id,integration_id,suggestion_id,transaction_id) values(owner_id,i.id,s.id,t.id);
  return result;
exception when sqlstate '42501' or raise_exception then raise;
  when others then raise exception 'DETECTION_INVALID';
end;
$$;

create or replace function public.confirm_recurring_suggestion(p_suggestion_id uuid,p_source_publication timestamptz,p_command jsonb,p_existing_expense_id uuid default null,p_allow_duplicate boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid:=auth.uid(); i public.integrations; s public.recurring_suggestions; v_existing public.recurring_cashflows; today date; category uuid; start_date date; amount bigint; day integer; result uuid;
begin
  i:=public.recurring_locked_decision_integration(owner_id,(select integration_id from public.recurring_suggestions where id=p_suggestion_id and owner_user_id=owner_id));
  perform 1 from public.recurring_detection_runs where owner_user_id=owner_id and integration_id=i.id for update;
  select * into s from public.recurring_suggestions where id=p_suggestion_id and owner_user_id=owner_id and integration_id=i.id for update;
  if not found then raise exception 'DETECTION_NOT_FOUND'; end if;
  if s.state='confirmed' then return s.recurring_cashflow_id; end if;
  if s.state<>'pending' or not s.eligible or s.source_publication is distinct from p_source_publication or i.last_success_at is distinct from p_source_publication then raise exception 'DETECTION_STALE'; end if;
  perform public.recurring_validate_fields(p_command,'command');
  select (clock_timestamp() at time zone timezone)::date into strict today from public.app_settings where owner_user_id=owner_id;
  start_date:=(p_command->>'start_date')::date; amount:=(p_command->>'amount_cents')::bigint; day:=(p_command->>'day_of_month')::integer;
  if start_date<=today or date_trunc('month',start_date)<=date_trunc('month',s.last_payment_date) then raise exception 'DETECTION_INVALID'; end if;
  category:=(p_command->>'category_id')::uuid;
  if category is not null and not exists(select 1 from public.cashflow_categories where id=category and owner_user_id=owner_id and type in ('outflow','both')) then raise exception 'DETECTION_INVALID'; end if;
  if p_existing_expense_id is not null then
    select * into v_existing from public.recurring_cashflows where id=p_existing_expense_id and owner_user_id=owner_id for update;
    if not found or v_existing.direction<>'outflow' or v_existing.cashflow_kind<>'expense' or v_existing.frequency<>'monthly' then raise exception 'DETECTION_INVALID'; end if;
    if exists(select 1 from public.recurring_suggestions where recurring_cashflow_id=v_existing.id) then raise exception 'DETECTION_DUPLICATE'; end if;
    result:=v_existing.id;
  else
    if not coalesce(p_allow_duplicate,false) and exists(select 1 from public.recurring_cashflows r where r.owner_user_id=owner_id and r.direction='outflow' and r.cashflow_kind='expense' and r.frequency='monthly'
      and not exists(select 1 from public.recurring_suggestions linked where linked.recurring_cashflow_id=r.id)
      and public.normalize_recurring_label(r.label)=s.normalized_label and r.amount_cents::numeric*10 between s.amount_cents::numeric*9 and s.amount_cents::numeric*11) then raise exception 'DETECTION_DUPLICATE'; end if;
    insert into public.recurring_cashflows(owner_user_id,direction,cashflow_kind,label,category_id,amount_cents,frequency,day_of_month,start_date,certainty,probability_basis_points,active)
      values(owner_id,'outflow','expense',btrim(p_command->>'label'),category,amount,'monthly',day,start_date,p_command->>'certainty',(p_command->>'probability_basis_points')::integer,true) returning id into result;
  end if;
  update public.recurring_suggestions set state='confirmed',recurring_cashflow_id=result,creation_source='detected' where id=s.id;
  return result;
exception when sqlstate '42501' or raise_exception then raise;
  when others then raise exception 'DETECTION_INVALID';
end;
$$;

create or replace function public.set_recurring_suggestion_state(p_suggestion_id uuid,p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid:=auth.uid(); i public.integrations; s public.recurring_suggestions;
begin
  i:=public.recurring_locked_decision_integration(owner_id,(select integration_id from public.recurring_suggestions where id=p_suggestion_id and owner_user_id=owner_id));
  perform 1 from public.recurring_detection_runs where owner_user_id=owner_id and integration_id=i.id for update;
  select * into s from public.recurring_suggestions where id=p_suggestion_id and owner_user_id=owner_id and integration_id=i.id for update;
  if not found then raise exception 'DETECTION_NOT_FOUND'; end if;
  if p_action='dismiss' and s.state in ('pending','dismissed') then
    update public.recurring_suggestions set state='dismissed',eligible=false where id=s.id;
  elsif p_action='reexamine' and s.state='dismissed' then
    update public.recurring_suggestions set state='pending',eligible=false where id=s.id;
  elsif p_action='reexamine' and s.state='pending' then
    return; -- Replay must not invalidate a subsequently completed analysis.
  else raise exception 'DETECTION_INVALID'; end if;
end;
$$;

-- The existing statement-level deletion prelock already locks every provider
-- in owner/id order; retain it to serialize suppression with all bank decisions.

revoke all on function public.recurring_locked_direct_integration(uuid,text),public.recurring_locked_decision_integration(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.acquire_automatic_direct_banking_sync(uuid,uuid,text),public.acquire_direct_recurring_analysis(uuid,uuid,text),public.publish_direct_recurring_analysis(uuid,uuid,text,timestamptz,jsonb),public.fail_direct_recurring_analysis(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.acquire_automatic_direct_banking_sync(uuid,uuid,text),public.acquire_direct_recurring_analysis(uuid,uuid,text),public.publish_direct_recurring_analysis(uuid,uuid,text,timestamptz,jsonb),public.fail_direct_recurring_analysis(uuid,uuid,text,text) to service_role;
