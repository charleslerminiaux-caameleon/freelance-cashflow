begin;

select plan(24);

insert into auth.users (id, email)
values
  ('66666666-6666-4666-8666-666666666666', 'singleton-owner@example.test'),
  ('77777777-7777-4777-8777-777777777777', 'singleton-outsider@example.test');

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.onboard_owner(text,text,text,text,bigint,bigint)'::regprocedure
  ),
  true,
  'onboarding executes with its owner privileges'
);

select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.onboard_owner(text,text,text,text,bigint,bigint)'::regprocedure
  ),
  array['search_path=""']::text[],
  'onboarding locks its search path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.onboard_owner(text,text,text,text,bigint,bigint)',
    'EXECUTE'
  ),
  'authenticated callers may execute onboarding'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.onboard_owner(text,text,text,text,bigint,bigint)',
    'EXECUTE'
  ),
  'anonymous callers have no onboarding execute privilege'
);

select is(
  (
    select count(*)
    from pg_proc as p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as privilege
    where p.oid = 'public.onboard_owner(text,text,text,text,bigint,bigint)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  0::bigint,
  'PUBLIC has no onboarding execute privilege'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.onboard_owner(text,text,text,text,bigint,bigint)',
    'EXECUTE'
  ),
  'the service role receives no unnecessary onboarding execute privilege'
);

select ok(
  not has_table_privilege('authenticated', 'public.app_settings', 'INSERT'),
  'authenticated callers have no direct settings insert privilege'
);

select ok(
  not has_table_privilege('anon', 'public.app_settings', 'INSERT'),
  'anonymous callers have no direct settings insert privilege'
);

select set_config(
  'request.jwt.claim.sub',
  '66666666-6666-4666-8666-666666666666',
  true
);
set local role authenticated;

select throws_ok(
  $$
    insert into public.app_settings (
      owner_user_id,
      currency,
      country,
      manual_current_balance_cents
    )
    values (
      '66666666-6666-4666-8666-666666666666',
      'USD',
      'US',
      0
    )
  $$,
  '42501',
  null,
  'authenticated callers cannot bypass onboarding with a direct settings insert'
);

reset role;
delete from public.app_settings;
set local role authenticated;

select lives_ok(
  $$
    select public.onboard_owner('EUR', 'Europe/Paris', 'FR', 'EI', 100000, 25000)
  $$,
  'the authenticated first owner can still use the onboarding RPC'
);

reset role;

select is(
  (select owner_user_id from public.app_settings),
  '66666666-6666-4666-8666-666666666666'::uuid,
  'the RPC creates exactly the authenticated singleton owner'
);

insert into public.customers (id, owner_user_id, name)
values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '77777777-7777-4777-8777-777777777777',
  'Outsider pre-existing row'
);

select set_config(
  'request.jwt.claim.sub',
  '77777777-7777-4777-8777-777777777777',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.customers),
  0::bigint,
  'a non-owner cannot select financial rows even when they carry that uid'
);

select throws_ok(
  $$
    insert into public.customers (owner_user_id, name)
    values ('77777777-7777-4777-8777-777777777777', 'Forbidden outsider insert')
  $$,
  '42501',
  null,
  'a non-owner cannot insert a financial row under their own uid'
);

select is_empty(
  $$
    update public.customers
    set name = 'Forbidden outsider update'
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    returning id
  $$,
  'a non-owner cannot update a financial row under their own uid'
);

select is_empty(
  $$
    delete from public.customers
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    returning id
  $$,
  'a non-owner cannot delete a financial row under their own uid'
);

reset role;

select is(
  (
    select name
    from public.customers
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ),
  'Outsider pre-existing row',
  'blocked non-owner mutations leave financial data unchanged'
);

select set_config(
  'request.jwt.claim.sub',
  '66666666-6666-4666-8666-666666666666',
  true
);
set local role authenticated;

select lives_ok(
  $$
    insert into public.customers (
      id,
      owner_user_id,
      name
    )
    values (
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      '66666666-6666-4666-8666-666666666666',
      'Owner customer'
    )
  $$,
  'the singleton owner retains normal insert access'
);

select is(
  (
    select name
    from public.customers
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  ),
  'Owner customer',
  'the singleton owner retains normal select access'
);

select lives_ok(
  $$
    update public.customers
    set name = 'Updated owner customer'
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  $$,
  'the singleton owner retains normal update access'
);

select is(
  (
    select name
    from public.customers
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  ),
  'Updated owner customer',
  'the owner update is visible'
);

select lives_ok(
  $$
    delete from public.customers
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  $$,
  'the singleton owner retains normal delete access'
);

select is(
  (
    select count(*)
    from public.customers
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  ),
  0::bigint,
  'the owner delete is effective'
);

reset role;
set local role anon;

select throws_ok(
  $$
    select public.onboard_owner('EUR', 'Europe/Paris', 'FR', null, 0, 0)
  $$,
  '42501',
  null,
  'anonymous callers cannot execute onboarding'
);

select is(
  (select count(*) from public.customers),
  0::bigint,
  'anonymous callers cannot read financial data'
);

reset role;

select * from finish();
rollback;
