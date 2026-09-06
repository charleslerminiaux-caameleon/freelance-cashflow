drop function public.convert_opportunity(uuid, text, date, bigint, integer);

create function public.convert_opportunity(
  p_opportunity_id uuid,
  p_reference text,
  p_signed_at date,
  p_vat_rate_basis_points integer,
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
  v_vat_cents numeric;
  v_amount_ttc_cents numeric;
  v_engagement_id uuid;
  v_updated_rows integer;
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
    or p_vat_rate_basis_points is null
    or p_vat_rate_basis_points not between 0 and 10000
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

  v_vat_cents := floor(
    (
      v_opportunity.estimated_amount_ht_cents::numeric
      * p_vat_rate_basis_points::numeric
      + 5000
    ) / 10000
  );
  v_amount_ttc_cents := v_opportunity.estimated_amount_ht_cents::numeric + v_vat_cents;

  if v_amount_ttc_cents > 9223372036854775807::numeric then
    raise exception using
      errcode = '22003',
      message = 'FC_CONVERSION_AMOUNT_OVERFLOW';
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
    v_amount_ttc_cents::bigint,
    'active',
    p_payment_terms_days
  )
  returning id into v_engagement_id;

  update public.opportunities
  set
    status = 'won',
    converted_engagement_id = v_engagement_id
  where id = v_opportunity.id
    and owner_user_id = v_owner_user_id
    and converted_engagement_id is null;

  get diagnostics v_updated_rows = row_count;

  if v_updated_rows <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'FC_OPPORTUNITY_ALREADY_CONVERTED';
  end if;

  return v_engagement_id;
end;
$$;

revoke all on function public.convert_opportunity(uuid, text, date, integer, integer)
from public, anon, authenticated, service_role;

grant execute on function public.convert_opportunity(uuid, text, date, integer, integer)
to authenticated;

create function public.enforce_engagement_schedule_floor()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_scheduled_ttc_cents numeric;
begin
  select coalesce(sum(amount_ttc_cents), 0)
  into v_scheduled_ttc_cents
  from public.billing_schedule_items
  where engagement_id = new.id
    and owner_user_id = new.owner_user_id
    and status <> 'cancelled';

  if new.amount_ttc_cents::numeric < v_scheduled_ttc_cents then
    raise exception using
      errcode = '23514',
      message = 'FC_ENGAGEMENT_BELOW_SCHEDULE_TOTAL';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_engagement_schedule_floor()
from public, anon, authenticated, service_role;

create trigger engagement_schedule_floor_check
before update of amount_ttc_cents
on public.engagements
for each row execute function public.enforce_engagement_schedule_floor();

create function public.preserve_converted_opportunity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'won' or old.converted_engagement_id is not null then
      raise exception using
        errcode = 'P0001',
        message = 'FC_CONVERTED_OPPORTUNITY_IMMUTABLE';
    end if;

    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'won' or new.converted_engagement_id is not null then
      raise exception using
        errcode = 'P0001',
        message = 'FC_WON_OPPORTUNITY_REQUIRES_ENGAGEMENT';
    end if;

    return new;
  end if;

  if old.status = 'won' or old.converted_engagement_id is not null then
    if
      new.owner_user_id is distinct from old.owner_user_id
      or new.customer_id is distinct from old.customer_id
      or new.name is distinct from old.name
      or new.status is distinct from old.status
      or new.estimated_amount_ht_cents is distinct from old.estimated_amount_ht_cents
      or new.probability_basis_points is distinct from old.probability_basis_points
      or new.expected_close_date is distinct from old.expected_close_date
      or new.expected_start_date is distinct from old.expected_start_date
      or new.expected_end_date is distinct from old.expected_end_date
      or new.converted_engagement_id is distinct from old.converted_engagement_id
      or new.created_at is distinct from old.created_at
    then
      raise exception using
        errcode = 'P0001',
        message = 'FC_CONVERTED_OPPORTUNITY_IMMUTABLE';
    end if;

    return new;
  end if;

  if (new.status = 'won') <> (new.converted_engagement_id is not null) then
    raise exception using
      errcode = 'P0001',
      message = 'FC_WON_OPPORTUNITY_REQUIRES_ENGAGEMENT';
  end if;

  if new.converted_engagement_id is not null and not exists (
    select 1
    from public.engagements
    where id = new.converted_engagement_id
      and owner_user_id = new.owner_user_id
      and opportunity_id = new.id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'FC_WON_OPPORTUNITY_REQUIRES_ENGAGEMENT';
  end if;

  return new;
end;
$$;

revoke all on function public.preserve_converted_opportunity()
from public, anon, authenticated, service_role;

create trigger preserve_converted_opportunity
before insert or update or delete
on public.opportunities
for each row execute function public.preserve_converted_opportunity();
