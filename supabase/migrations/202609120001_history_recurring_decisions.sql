alter table public.recurring_suggestions add column creation_source text not null default 'detected'
  check (creation_source in ('detected','history'));

-- Owner decisions share the integration lock with publication and charge deletion.
-- Automatic publication and its three-proof validation remain unchanged.
create function public.confirm_recurring_from_transaction(
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
  i := public.recurring_locked_integration(owner_id);
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
revoke all on function public.confirm_recurring_from_transaction(uuid,timestamptz,jsonb,uuid,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function public.confirm_recurring_from_transaction(uuid,timestamptz,jsonb,uuid,boolean,boolean) to authenticated;

-- Provenance records the latest effective confirmation route. The early return
-- for an already-confirmed identity deliberately retains its prior provenance.
create or replace function public.confirm_recurring_suggestion(p_suggestion_id uuid,p_source_publication timestamptz,p_command jsonb,p_existing_expense_id uuid default null,p_allow_duplicate boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid:=auth.uid(); i public.integrations; s public.recurring_suggestions; v_existing public.recurring_cashflows; today date; category uuid; start_date date; amount bigint; day integer; result uuid;
begin
  i:=public.recurring_locked_integration(owner_id);
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

