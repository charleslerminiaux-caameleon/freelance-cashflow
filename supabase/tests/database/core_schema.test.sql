begin;

select plan(15);

select has_table('public', 'app_settings', 'public.app_settings exists');
select has_table('public', 'customers', 'public.customers exists');
select has_table('public', 'opportunities', 'public.opportunities exists');
select has_table('public', 'engagements', 'public.engagements exists');
select has_table(
  'public',
  'billing_schedule_items',
  'public.billing_schedule_items exists'
);
select has_table('public', 'invoices', 'public.invoices exists');
select has_table('public', 'invoice_payments', 'public.invoice_payments exists');
select has_table(
  'public',
  'recurring_cashflows',
  'public.recurring_cashflows exists'
);
select has_table('public', 'planned_cashflows', 'public.planned_cashflows exists');
select has_table('public', 'cashflow_categories', 'public.cashflow_categories exists');
select col_type_is(
  'public',
  'invoices',
  'amount_ttc_cents',
  'bigint',
  'invoice total uses bigint cents'
);
select col_type_is(
  'public',
  'billing_schedule_items',
  'planned_invoice_date',
  'date',
  'planned invoice date is a business date'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.invoices'::regclass),
  true,
  'invoices has RLS'
);

insert into auth.users (id, email)
values ('33333333-3333-4333-8333-333333333333', 'invoice-owner@example.test');

insert into public.customers (id, owner_user_id, name)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '33333333-3333-4333-8333-333333333333',
  'Client facturation'
);

insert into public.invoices (
  owner_user_id,
  customer_id,
  invoice_number,
  issued_at,
  due_at,
  expected_payment_date,
  amount_ht_cents,
  vat_cents,
  amount_ttc_cents,
  status
)
values (
  '33333333-3333-4333-8333-333333333333',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'FC-001',
  '2026-09-01',
  '2026-10-01',
  '2026-10-01',
  10000,
  2000,
  12000,
  'issued'
);

select lives_ok(
  $$
    insert into public.invoices (
      owner_user_id,
      customer_id,
      invoice_number,
      issued_at,
      due_at,
      expected_payment_date,
      amount_ht_cents,
      vat_cents,
      amount_ttc_cents,
      status
    )
    values (
      '33333333-3333-4333-8333-333333333333',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'FC-002',
      '2026-09-02',
      '2026-10-02',
      '2026-10-02',
      20000,
      4000,
      24000,
      'issued'
    )
  $$,
  'an owner can create multiple manual invoices without external ids'
);

insert into public.invoices (
  owner_user_id,
  customer_id,
  provider,
  external_id,
  invoice_number,
  issued_at,
  due_at,
  expected_payment_date,
  amount_ht_cents,
  vat_cents,
  amount_ttc_cents,
  status
)
values (
  '33333333-3333-4333-8333-333333333333',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'csv',
  'csv-invoice-42',
  'FC-CSV-001',
  '2026-09-03',
  '2026-10-03',
  '2026-10-03',
  30000,
  6000,
  36000,
  'issued'
);

select throws_ok(
  $$
    insert into public.invoices (
      owner_user_id,
      customer_id,
      provider,
      external_id,
      invoice_number,
      issued_at,
      due_at,
      expected_payment_date,
      amount_ht_cents,
      vat_cents,
      amount_ttc_cents,
      status
    )
    values (
      '33333333-3333-4333-8333-333333333333',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'csv',
      'csv-invoice-42',
      'FC-CSV-002',
      '2026-09-04',
      '2026-10-04',
      '2026-10-04',
      40000,
      8000,
      48000,
      'issued'
    )
  $$,
  '23505',
  null,
  'non-null external invoice ids remain idempotent per owner and provider'
);

select * from finish();
rollback;
