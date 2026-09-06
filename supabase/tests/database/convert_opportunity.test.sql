begin;

select plan(28);

insert into auth.users (id, email)
values
  ('88888888-8888-4888-8888-888888888888', 'commercial-owner@example.test'),
  ('99999999-9999-4999-8999-999999999999', 'commercial-outsider@example.test');

insert into public.app_settings (owner_user_id)
values ('88888888-8888-4888-8888-888888888888');

insert into public.customers (id, owner_user_id, name, payment_terms_days)
values
  (
    '11111111-aaaa-4111-8111-111111111111',
    '88888888-8888-4888-8888-888888888888',
    'Client propriétaire',
    45
  ),
  (
    '22222222-bbbb-4222-8222-222222222222',
    '99999999-9999-4999-8999-999999999999',
    'Client extérieur',
    30
  );

insert into public.opportunities (
  id,
  owner_user_id,
  customer_id,
  name,
  status,
  estimated_amount_ht_cents,
  probability_basis_points,
  expected_start_date,
  expected_end_date
)
values
  (
    '33333333-cccc-4333-8333-333333333333',
    '88888888-8888-4888-8888-888888888888',
    '11111111-aaaa-4111-8111-111111111111',
    'Audit SI',
    'proposal',
    600000,
    7500,
    '2026-09-10',
    '2026-10-10'
  ),
  (
    '44444444-dddd-4444-8444-444444444444',
    '88888888-8888-4888-8888-888888888888',
    '11111111-aaaa-4111-8111-111111111111',
    'Opportunité perdue',
    'lost',
    100000,
    0,
    null,
    null
  ),
  (
    '55555555-eeee-4555-8555-555555555555',
    '88888888-8888-4888-8888-888888888888',
    '11111111-aaaa-4111-8111-111111111111',
    'Montant invalide',
    'qualified',
    100000,
    5000,
    null,
    null
  ),
  (
    '66666666-ffff-4666-8666-666666666666',
    '99999999-9999-4999-8999-999999999999',
    '22222222-bbbb-4222-8222-222222222222',
    'Opportunité extérieure',
    'proposal',
    200000,
    5000,
    null,
    null
  );

select has_function(
  'public',
  'convert_opportunity',
  array['uuid', 'text', 'date', 'integer', 'integer'],
  'the conversion RPC exists with the public contract'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.convert_opportunity(uuid,text,date,integer,integer)'::regprocedure
  ),
  false,
  'conversion is SECURITY INVOKER'
);

select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.convert_opportunity(uuid,text,date,integer,integer)'::regprocedure
  ),
  array['search_path=""']::text[],
  'conversion locks its search path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.convert_opportunity(uuid,text,date,integer,integer)',
    'EXECUTE'
  ),
  'authenticated callers may execute conversion'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.convert_opportunity(uuid,text,date,integer,integer)',
    'EXECUTE'
  ),
  'anonymous callers cannot execute conversion'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.convert_opportunity(uuid,text,date,integer,integer)',
    'EXECUTE'
  ),
  'the service role receives no conversion privilege'
);

select set_config(
  'request.jwt.claim.sub',
  '88888888-8888-4888-8888-888888888888',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select public.convert_opportunity(
      '33333333-cccc-4333-8333-333333333333',
      'CMD-2026-001',
      '2026-09-05',
      2000,
      45
    )
  $$,
  'the singleton owner converts an eligible opportunity'
);

select is(
  (select count(*) from public.engagements),
  1::bigint,
  'conversion creates exactly one engagement'
);

select is(
  (select reference from public.engagements),
  'CMD-2026-001',
  'the engagement uses the requested reference'
);

select is(
  (select amount_ht_cents from public.engagements),
  600000::bigint,
  'the engagement copies the opportunity HT amount'
);

select is(
  (select amount_ttc_cents from public.engagements),
  720000::bigint,
  'the engagement stores the validated TTC amount'
);

select is(
  (select signed_at from public.engagements),
  '2026-09-05'::date,
  'the engagement stores the signing date as a business date'
);

select is(
  (select start_date from public.engagements),
  '2026-09-10'::date,
  'the engagement copies the expected start date'
);

select is(
  (select end_date from public.engagements),
  '2026-10-10'::date,
  'the engagement copies the expected end date'
);

select is(
  (
    select status || ':' || (converted_engagement_id is not null)::text
    from public.opportunities
    where id = '33333333-cccc-4333-8333-333333333333'
  ),
  'won:true',
  'conversion marks the opportunity won and links its engagement'
);

select throws_ok(
  $$
    select public.convert_opportunity(
      '33333333-cccc-4333-8333-333333333333',
      'CMD-2026-001-BIS',
      '2026-09-06',
      2000,
      45
    )
  $$,
  'P0001',
  'FC_OPPORTUNITY_ALREADY_CONVERTED',
  'a retry is refused with a stable error'
);

select is(
  (select count(*) from public.engagements),
  1::bigint,
  'a refused retry cannot create a second engagement'
);

select throws_ok(
  $$
    select public.convert_opportunity(
      '44444444-dddd-4444-8444-444444444444',
      'CMD-PERDUE',
      '2026-09-05',
      2000,
      30
    )
  $$,
  'P0001',
  'FC_OPPORTUNITY_NOT_CONVERTIBLE',
  'a lost opportunity cannot be converted'
);

select throws_ok(
  $$
    select public.convert_opportunity(
      '55555555-eeee-4555-8555-555555555555',
      'CMD-INVALIDE',
      '2026-09-05',
      10001,
      30
    )
  $$,
  '22023',
  'FC_INVALID_CONVERSION_INPUT',
  'an invalid VAT rate is rejected as invalid input'
);

select is(
  (
    select status || ':' || (converted_engagement_id is null)::text
    from public.opportunities
    where id = '55555555-eeee-4555-8555-555555555555'
  ),
  'qualified:true',
  'invalid input rolls back without changing the opportunity'
);

select is(
  (select count(*) from public.engagements),
  1::bigint,
  'invalid input creates no partial engagement'
);

select lives_ok(
  $$
    insert into public.billing_schedule_items (
      owner_user_id,
      engagement_id,
      label,
      planned_invoice_date,
      amount_ht_cents,
      vat_cents,
      amount_ttc_cents,
      payment_terms_days,
      expected_payment_date
    )
    select
      owner_user_id,
      id,
      'Acompte',
      '2026-09-15',
      333333,
      66667,
      400000,
      45,
      '2026-10-30'
    from public.engagements
  $$,
  'a schedule item within the engagement total is accepted'
);

select lives_ok(
  $$
    insert into public.billing_schedule_items (
      owner_user_id,
      engagement_id,
      label,
      planned_invoice_date,
      amount_ht_cents,
      vat_cents,
      amount_ttc_cents,
      payment_terms_days,
      expected_payment_date
    )
    select
      owner_user_id,
      id,
      'Solde',
      '2026-10-15',
      266667,
      53333,
      320000,
      45,
      '2026-11-29'
    from public.engagements
  $$,
  'multiple schedule items may exactly allocate the engagement total'
);

select throws_ok(
  $$
    insert into public.billing_schedule_items (
      owner_user_id,
      engagement_id,
      label,
      planned_invoice_date,
      amount_ht_cents,
      vat_cents,
      amount_ttc_cents,
      payment_terms_days,
      expected_payment_date
    )
    select
      owner_user_id,
      id,
      'Dépassement',
      '2026-11-15',
      1,
      0,
      1,
      45,
      '2026-12-30'
    from public.engagements
  $$,
  '23514',
  'FC_BILLING_SCHEDULE_EXCEEDS_ENGAGEMENT',
  'the database rejects a schedule total above the engagement TTC amount'
);

select is(
  (select count(*) from public.billing_schedule_items),
  2::bigint,
  'a rejected schedule item leaves no partial row'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '99999999-9999-4999-8999-999999999999',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select public.convert_opportunity(
      '44444444-dddd-4444-8444-444444444444',
      'FUITE-INTERDITE',
      '2026-09-05',
      2000,
      30
    )
  $$,
  'P0001',
  'FC_OWNER_REQUIRED',
  'a non-owner cannot convert the singleton owner opportunity'
);

select throws_ok(
  $$
    select public.convert_opportunity(
      '66666666-ffff-4666-8666-666666666666',
      'COMMANDE-EXTERIEURE',
      '2026-09-05',
      2000,
      30
    )
  $$,
  'P0001',
  'FC_OWNER_REQUIRED',
  'a non-owner cannot convert even an opportunity carrying their uid'
);

reset role;

select is(
  (
    select status || ':' || (converted_engagement_id is null)::text
    from public.opportunities
    where id = '66666666-ffff-4666-8666-666666666666'
  ),
  'proposal:true',
  'rejected non-owner conversion leaves its source row unchanged'
);

select * from finish();
rollback;
