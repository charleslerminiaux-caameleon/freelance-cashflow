begin;

select plan(10);

insert into auth.users (id, email)
values
  ('44444444-4444-4444-8444-444444444444', 'first-owner@example.test'),
  ('55555555-5555-4555-8555-555555555555', 'late-account@example.test');

insert into public.cashflow_categories (owner_user_id, name, type)
values ('44444444-4444-4444-8444-444444444444', 'Clients', 'inflow');

select set_config(
  'request.jwt.claim.sub',
  '44444444-4444-4444-8444-444444444444',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select public.onboard_owner('EUR', 'Europe/Paris', 'FR', 'EI', 423850, 200000)
  $$,
  '23505',
  null,
  'a category failure aborts onboarding'
);

reset role;

select is(
  (select count(*) from public.app_settings),
  0::bigint,
  'a failed category insert rolls back settings atomically'
);

delete from public.cashflow_categories
where owner_user_id = '44444444-4444-4444-8444-444444444444';

set local role authenticated;

select lives_ok(
  $$
    select public.onboard_owner('EUR', 'Europe/Paris', 'FR', 'EI', 423850, 200000)
  $$,
  'the first verified account can onboard atomically'
);

reset role;

select is(
  (
    select row(currency, timezone, country, legal_form, manual_current_balance_cents, safety_cash_threshold_cents)::text
    from public.app_settings
  ),
  '(EUR,Europe/Paris,FR,EI,423850,200000)',
  'onboarding persists the validated owner settings'
);

select is(
  (select manual_balance_as_of from public.app_settings),
  (current_timestamp at time zone 'Europe/Paris')::date,
  'the manual balance uses the current local business date'
);

select is(
  (
    select jsonb_agg(jsonb_build_array(name, type) order by name)
    from public.cashflow_categories
    where owner_user_id = '44444444-4444-4444-8444-444444444444'
  ),
  jsonb_build_array(
    jsonb_build_array('Clients', 'inflow'),
    jsonb_build_array('Fiscal et social', 'outflow'),
    jsonb_build_array('Logiciels', 'outflow'),
    jsonb_build_array('Rémunération', 'outflow')
  ),
  'onboarding creates exactly the four initial categories'
);

select set_config(
  'request.jwt.claim.sub',
  '55555555-5555-4555-8555-555555555555',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select public.onboard_owner('EUR', 'Europe/Paris', 'FR', null, 0, 0)
  $$,
  '23505',
  'OWNER_ALREADY_EXISTS',
  'a second account cannot replace the singleton owner'
);

reset role;

select is(
  (select owner_user_id from public.app_settings),
  '44444444-4444-4444-8444-444444444444'::uuid,
  'a conflicting onboarding never replaces the owner'
);

select is(
  (
    select count(*)
    from public.cashflow_categories
    where owner_user_id = '55555555-5555-4555-8555-555555555555'
  ),
  0::bigint,
  'a conflicting onboarding creates no categories'
);

set local role anon;

select throws_ok(
  $$
    select public.onboard_owner('EUR', 'Europe/Paris', 'FR', null, 0, 0)
  $$,
  '42501',
  null,
  'an unverified caller cannot onboard'
);

reset role;

select * from finish();
rollback;
