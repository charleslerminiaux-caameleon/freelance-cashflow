create unique index if not exists invoices_owner_billing_schedule_item_uidx
  on public.invoices (owner_user_id, billing_schedule_item_id)
  where billing_schedule_item_id is not null;

create function public.validate_invoice_schedule_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_schedule public.billing_schedule_items%rowtype;
  v_customer_id uuid;
begin
  if new.billing_schedule_item_id is null then
    return new;
  end if;

  select schedule.*
  into v_schedule
  from public.billing_schedule_items as schedule
  where schedule.id = new.billing_schedule_item_id
    and schedule.owner_user_id = new.owner_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'FC_SCHEDULE_NOT_INVOICEABLE';
  end if;

  select customer_id
  into v_customer_id
  from public.engagements
  where id = v_schedule.engagement_id
    and owner_user_id = v_schedule.owner_user_id;

  if
    v_customer_id is distinct from new.customer_id
    or v_schedule.amount_ht_cents is distinct from new.amount_ht_cents
    or v_schedule.vat_cents is distinct from new.vat_cents
    or v_schedule.amount_ttc_cents is distinct from new.amount_ttc_cents
  then
    raise exception using
      errcode = 'P0001',
      message = 'FC_SCHEDULE_INVOICE_MISMATCH';
  end if;

  if exists (
    select 1
    from public.invoices
    where owner_user_id = new.owner_user_id
      and billing_schedule_item_id = new.billing_schedule_item_id
      and id is distinct from new.id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'FC_SCHEDULE_ALREADY_INVOICED';
  end if;

  if
    (tg_op = 'INSERT' or new.billing_schedule_item_id is distinct from old.billing_schedule_item_id)
    and v_schedule.status <> 'planned'
  then
    raise exception using
      errcode = 'P0001',
      message = 'FC_SCHEDULE_ALREADY_INVOICED';
  end if;

  if
    tg_op = 'UPDATE'
    and new.billing_schedule_item_id is not distinct from old.billing_schedule_item_id
    and v_schedule.status <> 'invoiced'
  then
    raise exception using
      errcode = 'P0001',
      message = 'FC_LINKED_SCHEDULE_MUST_REMAIN_INVOICED';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_invoice_schedule_link()
from public, anon, authenticated, service_role;

create trigger validate_invoice_schedule_link
before insert or update of owner_user_id, customer_id, billing_schedule_item_id,
  amount_ht_cents, vat_cents, amount_ttc_cents
on public.invoices
for each row execute function public.validate_invoice_schedule_link();

create function public.synchronize_invoice_schedule_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
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

create trigger synchronize_invoice_schedule_status
after insert or update of owner_user_id, billing_schedule_item_id or delete
on public.invoices
for each row execute function public.synchronize_invoice_schedule_status();

create function public.enforce_linked_schedule_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_has_invoice boolean;
begin
  select exists (
    select 1
    from public.invoices
    where owner_user_id = new.owner_user_id
      and billing_schedule_item_id = new.id
  )
  into v_has_invoice;

  if v_has_invoice and new.status <> 'invoiced' then
    raise exception using
      errcode = 'P0001',
      message = 'FC_LINKED_SCHEDULE_MUST_REMAIN_INVOICED';
  end if;

  if not v_has_invoice and new.status = 'invoiced' then
    raise exception using
      errcode = 'P0001',
      message = 'FC_SCHEDULE_INVOICE_REQUIRED';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_linked_schedule_status()
from public, anon, authenticated, service_role;

create trigger enforce_linked_schedule_status
before update of status
on public.billing_schedule_items
for each row execute function public.enforce_linked_schedule_status();

create function public.create_invoice(
  p_customer_id uuid,
  p_billing_schedule_item_id uuid,
  p_provider text,
  p_invoice_number text,
  p_issued_at date,
  p_due_at date,
  p_expected_payment_date date,
  p_amount_ht_cents bigint,
  p_vat_cents bigint,
  p_amount_ttc_cents bigint,
  p_raw_payload_hash text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_user_id uuid := auth.uid();
  v_existing public.invoices%rowtype;
  v_invoice_id uuid;
begin
  if v_owner_user_id is null or not exists (
    select 1 from public.app_settings where owner_user_id = v_owner_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'FC_OWNER_REQUIRED';
  end if;

  if
    p_customer_id is null
    or p_provider is null
    or p_provider not in ('manual', 'csv')
    or p_invoice_number is null
    or length(trim(p_invoice_number)) = 0
    or length(trim(p_invoice_number)) > 160
    or p_issued_at is null
    or p_due_at is null
    or p_due_at < p_issued_at
    or p_expected_payment_date is null
    or p_amount_ht_cents is null
    or p_vat_cents is null
    or p_amount_ttc_cents is null
    or p_amount_ht_cents < 0
    or p_vat_cents < 0
    or p_amount_ttc_cents::numeric <> p_amount_ht_cents::numeric + p_vat_cents::numeric
    or (p_provider = 'manual' and p_raw_payload_hash is not null)
    or (p_provider = 'csv' and (p_raw_payload_hash is null or p_raw_payload_hash !~ '^[0-9a-f]{64}$'))
  then
    raise exception using errcode = '22023', message = 'FC_INVALID_INVOICE_INPUT';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner_user_id::text || ':' || trim(p_invoice_number), 0)
  );

  select *
  into v_existing
  from public.invoices
  where owner_user_id = v_owner_user_id
    and invoice_number = trim(p_invoice_number)
  for update;

  if found then
    if
      v_existing.customer_id is not distinct from p_customer_id
      and v_existing.billing_schedule_item_id is not distinct from p_billing_schedule_item_id
      and v_existing.provider is not distinct from p_provider
      and v_existing.issued_at is not distinct from p_issued_at
      and v_existing.due_at is not distinct from p_due_at
      and v_existing.expected_payment_date is not distinct from p_expected_payment_date
      and v_existing.amount_ht_cents is not distinct from p_amount_ht_cents
      and v_existing.vat_cents is not distinct from p_vat_cents
      and v_existing.amount_ttc_cents is not distinct from p_amount_ttc_cents
      and v_existing.raw_payload_hash is not distinct from p_raw_payload_hash
    then
      return v_existing.id;
    end if;

    raise exception using errcode = 'P0001', message = 'FC_INVOICE_NUMBER_CONFLICT';
  end if;

  if not exists (
    select 1 from public.customers
    where id = p_customer_id and owner_user_id = v_owner_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'FC_CUSTOMER_NOT_FOUND';
  end if;

  insert into public.invoices (
    owner_user_id,
    customer_id,
    billing_schedule_item_id,
    provider,
    invoice_number,
    issued_at,
    due_at,
    expected_payment_date,
    amount_ht_cents,
    vat_cents,
    amount_ttc_cents,
    paid_amount_cents,
    status,
    paid_at,
    raw_payload_hash
  )
  values (
    v_owner_user_id,
    p_customer_id,
    p_billing_schedule_item_id,
    p_provider,
    trim(p_invoice_number),
    p_issued_at,
    p_due_at,
    p_expected_payment_date,
    p_amount_ht_cents,
    p_vat_cents,
    p_amount_ttc_cents,
    0,
    'issued',
    null,
    p_raw_payload_hash
  )
  returning id into v_invoice_id;

  return v_invoice_id;
end;
$$;

revoke all on function public.create_invoice(uuid, uuid, text, text, date, date, date, bigint, bigint, bigint, text)
from public, anon, authenticated, service_role;

grant execute on function public.create_invoice(uuid, uuid, text, text, date, date, date, bigint, bigint, bigint, text)
to authenticated;

create function public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount_cents bigint,
  p_paid_at date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_user_id uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_new_paid_amount_cents bigint;
  v_payment_id uuid;
begin
  if v_owner_user_id is null or not exists (
    select 1 from public.app_settings where owner_user_id = v_owner_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'FC_OWNER_REQUIRED';
  end if;

  if p_invoice_id is null or p_amount_cents is null or p_paid_at is null then
    raise exception using errcode = '22023', message = 'FC_INVALID_PAYMENT_INPUT';
  end if;

  if p_amount_cents <= 0 then
    raise exception using errcode = '22023', message = 'FC_PAYMENT_MUST_BE_POSITIVE';
  end if;

  select *
  into v_invoice
  from public.invoices
  where id = p_invoice_id
    and owner_user_id = v_owner_user_id
  for update;

  if not found or v_invoice.status in ('draft', 'paid', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'FC_INVOICE_NOT_PAYABLE';
  end if;

  if p_amount_cents > v_invoice.amount_ttc_cents - v_invoice.paid_amount_cents then
    raise exception using errcode = '22023', message = 'FC_PAYMENT_EXCEEDS_BALANCE';
  end if;

  v_new_paid_amount_cents := v_invoice.paid_amount_cents + p_amount_cents;

  insert into public.invoice_payments (
    owner_user_id,
    invoice_id,
    amount_cents,
    paid_at,
    match_type,
    match_confidence_basis_points
  )
  values (
    v_owner_user_id,
    v_invoice.id,
    p_amount_cents,
    p_paid_at,
    'manual',
    10000
  )
  returning id into v_payment_id;

  update public.invoices
  set
    paid_amount_cents = v_new_paid_amount_cents,
    paid_at = case
      when v_new_paid_amount_cents = amount_ttc_cents then p_paid_at
      else null
    end,
    status = case
      when v_new_paid_amount_cents = amount_ttc_cents then 'paid'
      else 'partially_paid'
    end
  where id = v_invoice.id
    and owner_user_id = v_owner_user_id;

  return v_payment_id;
end;
$$;

revoke all on function public.record_invoice_payment(uuid, bigint, date)
from public, anon, authenticated, service_role;

grant execute on function public.record_invoice_payment(uuid, bigint, date)
to authenticated;
