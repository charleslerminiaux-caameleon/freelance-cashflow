begin;

select plan(9);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner-one@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'owner-two@example.test');

insert into public.app_settings (owner_user_id)
values ('11111111-1111-4111-8111-111111111111');

insert into public.customers (id, owner_user_id, name)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'Client propriétaire un'
);

select is(
  (
    select count(*)
    from pg_class
    where oid in (
      'public.app_settings'::regclass,
      'public.customers'::regclass,
      'public.opportunities'::regclass,
      'public.engagements'::regclass,
      'public.billing_schedule_items'::regclass,
      'public.invoices'::regclass,
      'public.invoice_payments'::regclass,
      'public.recurring_cashflows'::regclass,
      'public.planned_cashflows'::regclass,
      'public.cashflow_categories'::regclass
    )
      and relrowsecurity
  ),
  10::bigint,
  'all owner-scoped tables have RLS enabled'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'app_settings',
        'customers',
        'opportunities',
        'engagements',
        'billing_schedule_items',
        'invoices',
        'invoice_payments',
        'recurring_cashflows',
        'planned_cashflows',
        'cashflow_categories'
      )
      and cmd = 'ALL'
      and roles = array['authenticated']::name[]
      and qual is not null
      and with_check is not null
  ),
  10::bigint,
  'every table has one authenticated policy with USING and WITH CHECK'
);

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.customers),
  1::bigint,
  'owner one sees their customer'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.customers),
  0::bigint,
  'owner two cannot see owner one data'
);

select is_empty(
  $$
    update public.customers
    set name = 'Modification interdite'
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    returning id
  $$,
  'owner two cannot update owner one data'
);

select throws_ok(
  $$
    insert into public.customers (owner_user_id, name)
    values ('11111111-1111-4111-8111-111111111111', 'Insertion interdite')
  $$,
  '42501',
  null,
  'WITH CHECK prevents owner two from inserting for owner one'
);

reset role;

select is(
  (
    select name
    from public.customers
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  'Client propriétaire un',
  'the rejected cross-owner update changed nothing'
);

select throws_ok(
  $$
    insert into public.app_settings (owner_user_id)
    values ('22222222-2222-4222-8222-222222222222')
  $$,
  '23505',
  null,
  'app_settings remains a single installation-wide row'
);

select throws_ok(
  $$
    insert into public.opportunities (
      owner_user_id,
      customer_id,
      name,
      estimated_amount_ht_cents
    )
    values (
      '22222222-2222-4222-8222-222222222222',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Référence inter-propriétaire interdite',
      10000
    )
  $$,
  '23503',
  null,
  'foreign keys cannot connect rows owned by different users'
);

select * from finish();
rollback;
