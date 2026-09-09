create or replace function public.convert_opportunity(
  p_opportunity_id uuid,
  p_reference text,
  p_signed_at date,
  p_amount_ttc_cents bigint,
  p_payment_terms_days integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_user_id uuid := auth.uid();
  v_opportunity public.opportunities%rowtype;
  v_engagement_id uuid;
begin
  if v_owner_user_id is null or not exists (
    select 1
    from public.app_settings
    where owner_user_id = v_owner_user_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'FC_OWNER_REQUIRED';
  end if;

  if
    p_opportunity_id is null
    or p_reference is null
    or length(trim(p_reference)) = 0
    or p_signed_at is null
    or p_amount_ttc_cents is null
    or p_payment_terms_days is null
    or p_payment_terms_days not between 0 and 365
  then
    raise exception using
      errcode = '22023',
      message = 'FC_INVALID_CONVERSION_INPUT';
  end if;

  select *
  into v_opportunity
  from public.opportunities
  where id = p_opportunity_id
    and owner_user_id = v_owner_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'FC_OPPORTUNITY_NOT_CONVERTIBLE';
  end if;

  if v_opportunity.converted_engagement_id is not null or v_opportunity.status = 'won' then
    raise exception using
      errcode = 'P0001',
      message = 'FC_OPPORTUNITY_ALREADY_CONVERTED';
  end if;

  if v_opportunity.status = 'lost' then
    raise exception using
      errcode = 'P0001',
      message = 'FC_OPPORTUNITY_NOT_CONVERTIBLE';
  end if;

  if p_amount_ttc_cents < v_opportunity.estimated_amount_ht_cents then
    raise exception using
      errcode = '22023',
      message = 'FC_INVALID_CONVERSION_INPUT';
  end if;

  insert into public.engagements (
    owner_user_id,
    customer_id,
    opportunity_id,
    reference,
    signed_at,
    start_date,
    end_date,
    amount_ht_cents,
    amount_ttc_cents,
    status,
    payment_terms_days
  )
  values (
    v_owner_user_id,
    v_opportunity.customer_id,
    v_opportunity.id,
    trim(p_reference),
    p_signed_at,
    v_opportunity.expected_start_date,
    v_opportunity.expected_end_date,
    v_opportunity.estimated_amount_ht_cents,
    p_amount_ttc_cents,
    'active',
    p_payment_terms_days
  )
  returning id into v_engagement_id;

  update public.opportunities
  set
    status = 'won',
    converted_engagement_id = v_engagement_id
  where id = v_opportunity.id
    and owner_user_id = v_owner_user_id;

  return v_engagement_id;
end;
$$;

revoke all on function public.convert_opportunity(uuid, text, date, bigint, integer)
from public, anon, authenticated, service_role;

grant execute on function public.convert_opportunity(uuid, text, date, bigint, integer)
to authenticated;

create or replace function public.enforce_billing_schedule_total()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_engagement_ttc_cents bigint;
  v_scheduled_ttc_cents bigint;
begin
  select amount_ttc_cents
  into v_engagement_ttc_cents
  from public.engagements
  where id = new.engagement_id
    and owner_user_id = new.owner_user_id
  for update;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'FC_ENGAGEMENT_NOT_FOUND';
  end if;

  if new.status = 'cancelled' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(sum(amount_ttc_cents), 0)
    into v_scheduled_ttc_cents
    from public.billing_schedule_items
    where engagement_id = new.engagement_id
      and owner_user_id = new.owner_user_id
      and status <> 'cancelled'
      and id <> old.id;
  else
    select coalesce(sum(amount_ttc_cents), 0)
    into v_scheduled_ttc_cents
    from public.billing_schedule_items
    where engagement_id = new.engagement_id
      and owner_user_id = new.owner_user_id
      and status <> 'cancelled';
  end if;

  if v_scheduled_ttc_cents + new.amount_ttc_cents > v_engagement_ttc_cents then
    raise exception using
      errcode = '23514',
      message = 'FC_BILLING_SCHEDULE_EXCEEDS_ENGAGEMENT';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_billing_schedule_total()
from public, anon, authenticated, service_role;

create trigger billing_schedule_total_check
before insert or update of engagement_id, owner_user_id, amount_ttc_cents, status
on public.billing_schedule_items
for each row execute function public.enforce_billing_schedule_total();
