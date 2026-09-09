alter table public.invoice_payments
  add column idempotency_key uuid;

update public.invoice_payments
set idempotency_key = gen_random_uuid()
where idempotency_key is null;

alter table public.invoice_payments
  alter column idempotency_key set default gen_random_uuid(),
  alter column idempotency_key set not null;

create unique index invoice_payments_owner_idempotency_key_uidx
  on public.invoice_payments (owner_user_id, idempotency_key);

drop function public.create_invoice(
  uuid, uuid, text, text, date, date, date, bigint, bigint, bigint, text
);

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
returns jsonb
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
      return pg_catalog.jsonb_build_object(
        'invoice_id', v_existing.id,
        'created', false
      );
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

  return pg_catalog.jsonb_build_object(
    'invoice_id', v_invoice_id,
    'created', true
  );
end;
$$;

revoke all on function public.create_invoice(
  uuid, uuid, text, text, date, date, date, bigint, bigint, bigint, text
)
from public, anon, authenticated, service_role;

grant execute on function public.create_invoice(
  uuid, uuid, text, text, date, date, date, bigint, bigint, bigint, text
)
to authenticated;

drop function public.record_invoice_payment(uuid, bigint, date);

create function public.record_invoice_payment(
  p_invoice_id uuid,
  p_idempotency_key uuid,
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
  v_existing_payment public.invoice_payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_new_paid_amount_cents bigint;
  v_payment_id uuid;
begin
  if v_owner_user_id is null or not exists (
    select 1 from public.app_settings where owner_user_id = v_owner_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'FC_OWNER_REQUIRED';
  end if;

  if
    p_invoice_id is null
    or p_idempotency_key is null
    or p_amount_cents is null
    or p_paid_at is null
  then
    raise exception using errcode = '22023', message = 'FC_INVALID_PAYMENT_INPUT';
  end if;

  if p_amount_cents <= 0 then
    raise exception using errcode = '22023', message = 'FC_PAYMENT_MUST_BE_POSITIVE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_owner_user_id::text || ':' || p_idempotency_key::text,
      0
    )
  );

  select *
  into v_existing_payment
  from public.invoice_payments
  where owner_user_id = v_owner_user_id
    and idempotency_key = p_idempotency_key
  for update;

  if found then
    if
      v_existing_payment.invoice_id is not distinct from p_invoice_id
      and v_existing_payment.amount_cents is not distinct from p_amount_cents
      and v_existing_payment.paid_at is not distinct from p_paid_at
      and v_existing_payment.match_type = 'manual'
      and v_existing_payment.match_confidence_basis_points = 10000
    then
      return v_existing_payment.id;
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'FC_PAYMENT_IDEMPOTENCY_CONFLICT';
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
    idempotency_key,
    amount_cents,
    paid_at,
    match_type,
    match_confidence_basis_points
  )
  values (
    v_owner_user_id,
    v_invoice.id,
    p_idempotency_key,
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

revoke all on function public.record_invoice_payment(uuid, uuid, bigint, date)
from public, anon, authenticated, service_role;

grant execute on function public.record_invoice_payment(uuid, uuid, bigint, date)
to authenticated;

create function public.protect_invoiced_schedule_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
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

create trigger billing_schedule_invoice_identity_check
before update of owner_user_id, engagement_id, amount_ht_cents, vat_cents,
  amount_ttc_cents or delete
on public.billing_schedule_items
for each row execute function public.protect_invoiced_schedule_identity();

create function public.protect_invoiced_engagement_customer()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.customer_id is not distinct from old.customer_id then
    return new;
  end if;

  if exists (
    select 1
    from public.billing_schedule_items as schedule
    join public.invoices as invoice
      on invoice.owner_user_id = schedule.owner_user_id
      and invoice.billing_schedule_item_id = schedule.id
    where schedule.owner_user_id = old.owner_user_id
      and schedule.engagement_id = old.id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'FC_INVOICED_ENGAGEMENT_CUSTOMER_IMMUTABLE';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_invoiced_engagement_customer()
from public, anon, authenticated, service_role;

create trigger engagement_customer_invoice_check
before update of customer_id
on public.engagements
for each row execute function public.protect_invoiced_engagement_customer();
