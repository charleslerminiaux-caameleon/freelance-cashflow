begin;

select plan(13);

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

select * from finish();
rollback;
