create or replace function public.preserve_converted_opportunity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (
      select 1
      from auth.users
      where id = old.owner_user_id
    ) then
      return old;
    end if;

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

create or replace function public.preserve_engagement_conversion_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_reciprocal_link boolean;
begin
  if tg_op = 'DELETE' and not exists (
    select 1
    from auth.users
    where id = old.owner_user_id
  ) then
    return old;
  end if;

  select exists (
    select 1
    from public.opportunities
    where id = old.opportunity_id
      and owner_user_id = old.owner_user_id
      and converted_engagement_id = old.id
  )
  into v_has_reciprocal_link;

  if not v_has_reciprocal_link then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception using
      errcode = 'P0001',
      message = 'FC_CONVERSION_LINK_IMMUTABLE';
  end if;

  if
    new.id is distinct from old.id
    or new.owner_user_id is distinct from old.owner_user_id
    or new.opportunity_id is distinct from old.opportunity_id
  then
    raise exception using
      errcode = 'P0001',
      message = 'FC_CONVERSION_LINK_IMMUTABLE';
  end if;

  return new;
end;
$$;

revoke all on function public.preserve_engagement_conversion_link()
from public, anon, authenticated, service_role;

create or replace function public.protect_invoiced_schedule_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (
    select 1
    from auth.users
    where id = old.owner_user_id
  ) then
    return old;
  end if;

  if not exists (
    select 1
    from public.invoices
    where owner_user_id = old.owner_user_id
      and billing_schedule_item_id = old.id
  ) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' or (
    new.owner_user_id is distinct from old.owner_user_id
    or new.engagement_id is distinct from old.engagement_id
    or new.amount_ht_cents is distinct from old.amount_ht_cents
    or new.vat_cents is distinct from old.vat_cents
    or new.amount_ttc_cents is distinct from old.amount_ttc_cents
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'FC_INVOICED_SCHEDULE_IMMUTABLE';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_invoiced_schedule_identity()
from public, anon, authenticated, service_role;

create or replace function public.synchronize_invoice_schedule_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (
    select 1
    from auth.users
    where id = old.owner_user_id
  ) then
    return null;
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.billing_schedule_item_id is not null then
    if tg_op = 'DELETE' or old.billing_schedule_item_id is distinct from new.billing_schedule_item_id then
      update public.billing_schedule_items
      set status = 'planned'
      where id = old.billing_schedule_item_id
        and owner_user_id = old.owner_user_id;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.billing_schedule_item_id is not null then
    update public.billing_schedule_items
    set status = 'invoiced'
    where id = new.billing_schedule_item_id
      and owner_user_id = new.owner_user_id;
  end if;

  return null;
end;
$$;

revoke all on function public.synchronize_invoice_schedule_status()
from public, anon, authenticated, service_role;
