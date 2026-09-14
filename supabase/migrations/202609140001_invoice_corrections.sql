create function public.update_invoice(
  p_invoice_id uuid,
  p_customer_id uuid,
  p_invoice_number text,
  p_issued_at date,
  p_due_at date,
  p_expected_payment_date date,
  p_amount_ht_cents bigint,
  p_vat_cents bigint,
  p_amount_ttc_cents bigint
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_user_id uuid := auth.uid();
  v_invoice public.invoices%rowtype;
begin
  if v_owner_user_id is null or not exists (
    select 1 from public.app_settings where owner_user_id = v_owner_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'FC_OWNER_REQUIRED';
  end if;

  if
    p_invoice_id is null
    or p_customer_id is null
    or p_invoice_number is null
    or length(trim(p_invoice_number)) = 0
    or length(trim(p_invoice_number)) > 160
    or p_issued_at is null
    or p_due_at is null
    or p_due_at < p_issued_at
    or p_expected_payment_date is null
    or p_expected_payment_date < p_issued_at
    or p_amount_ht_cents is null
    or p_vat_cents is null
    or p_amount_ttc_cents is null
    or p_amount_ht_cents < 0
    or p_vat_cents < 0
    or p_amount_ttc_cents::numeric <> p_amount_ht_cents::numeric + p_vat_cents::numeric
  then
    raise exception using errcode = '22023', message = 'FC_INVALID_INVOICE_INPUT';
  end if;

  select *
  into v_invoice
  from public.invoices
  where id = p_invoice_id
    and owner_user_id = v_owner_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'FC_INVOICE_NOT_FOUND';
  end if;

  if not exists (
    select 1 from public.customers
    where id = p_customer_id and owner_user_id = v_owner_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'FC_CUSTOMER_NOT_FOUND';
  end if;

  if p_amount_ttc_cents < v_invoice.paid_amount_cents then
    raise exception using errcode = '22023', message = 'FC_INVOICE_TOTAL_BELOW_PAYMENTS';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner_user_id::text || ':' || trim(p_invoice_number), 0)
  );

  if exists (
    select 1
    from public.invoices
    where owner_user_id = v_owner_user_id
      and invoice_number = trim(p_invoice_number)
      and id <> p_invoice_id
  ) then
    raise exception using errcode = 'P0001', message = 'FC_INVOICE_NUMBER_CONFLICT';
  end if;

  update public.invoices
  set
    customer_id = p_customer_id,
    invoice_number = trim(p_invoice_number),
    issued_at = p_issued_at,
    due_at = p_due_at,
    expected_payment_date = p_expected_payment_date,
    amount_ht_cents = p_amount_ht_cents,
    vat_cents = p_vat_cents,
    amount_ttc_cents = p_amount_ttc_cents,
    status = case
      when status in ('draft', 'cancelled') then status
      when paid_amount_cents = p_amount_ttc_cents then 'paid'
      when paid_amount_cents > 0 then 'partially_paid'
      else 'issued'
    end,
    paid_at = case
      when paid_amount_cents = p_amount_ttc_cents then paid_at
      else null
    end
  where id = p_invoice_id
    and owner_user_id = v_owner_user_id;

  return p_invoice_id;
end;
$$;

revoke all on function public.update_invoice(
  uuid, uuid, text, date, date, date, bigint, bigint, bigint
)
from public, anon, authenticated, service_role;

grant execute on function public.update_invoice(
  uuid, uuid, text, date, date, date, bigint, bigint, bigint
)
to authenticated;

create function public.delete_invoice_payment(
  p_invoice_id uuid,
  p_payment_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_user_id uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_payment public.invoice_payments%rowtype;
  v_paid_amount_cents bigint;
  v_paid_at date;
begin
  if v_owner_user_id is null or not exists (
    select 1 from public.app_settings where owner_user_id = v_owner_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'FC_OWNER_REQUIRED';
  end if;

  if p_invoice_id is null or p_payment_id is null then
    raise exception using errcode = '22023', message = 'FC_INVALID_PAYMENT_INPUT';
  end if;

  select *
  into v_invoice
  from public.invoices
  where id = p_invoice_id
    and owner_user_id = v_owner_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'FC_INVOICE_NOT_FOUND';
  end if;

  select *
  into v_payment
  from public.invoice_payments
  where id = p_payment_id
    and invoice_id = p_invoice_id
    and owner_user_id = v_owner_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'FC_PAYMENT_NOT_FOUND';
  end if;

  delete from public.invoice_payments
  where id = v_payment.id
    and owner_user_id = v_owner_user_id;

  select coalesce(sum(amount_cents), 0)::bigint, max(paid_at)
  into v_paid_amount_cents, v_paid_at
  from public.invoice_payments
  where invoice_id = p_invoice_id
    and owner_user_id = v_owner_user_id;

  update public.invoices
  set
    paid_amount_cents = v_paid_amount_cents,
    status = case
      when status in ('draft', 'cancelled') then status
      when v_paid_amount_cents = amount_ttc_cents then 'paid'
      when v_paid_amount_cents > 0 then 'partially_paid'
      else 'issued'
    end,
    paid_at = case
      when v_paid_amount_cents = amount_ttc_cents then v_paid_at
      else null
    end
  where id = p_invoice_id
    and owner_user_id = v_owner_user_id;

  return v_payment.id;
end;
$$;

revoke all on function public.delete_invoice_payment(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.delete_invoice_payment(uuid, uuid)
to authenticated;
