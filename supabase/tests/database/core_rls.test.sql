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
    select jsonb_agg(c.relname order by c.relname)
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
  ),
  jsonb_build_array(
    'app_settings',
    'billing_schedule_items',
    'cashflow_categories',
    'customers',
    'engagements',
    'invoice_payments',
    'invoices',
    'opportunities',
    'planned_cashflows',
    'recurring_cashflows'
  ),
  'exactly the ten owner-scoped tables have RLS enabled'
);

select is(
  (
    select jsonb_agg(
      concat_ws(
        '|',
        tablename,
        policyname,
        permissive,
        array_to_string(roles, ','),
        cmd,
        (
          regexp_replace(qual, E'\\s+', ' ', 'g') = case
            when tablename = 'app_settings'
              then '(( SELECT auth.uid() AS uid) = owner_user_id)'
            else '((( SELECT auth.uid() AS uid) = owner_user_id) AND (EXISTS ( SELECT 1 FROM app_settings WHERE (app_settings.owner_user_id = ( SELECT auth.uid() AS uid)))))'
          end
        )::text,
        (
          regexp_replace(with_check, E'\\s+', ' ', 'g') = case
            when tablename = 'app_settings'
              then '(( SELECT auth.uid() AS uid) = owner_user_id)'
            else '((( SELECT auth.uid() AS uid) = owner_user_id) AND (EXISTS ( SELECT 1 FROM app_settings WHERE (app_settings.owner_user_id = ( SELECT auth.uid() AS uid)))))'
          end
        )::text
      )
      order by tablename, policyname
    )
    from pg_policies
    where schemaname = 'public'
  ),
  jsonb_build_array(
    'app_settings|owner_access|PERMISSIVE|authenticated|ALL|true|true',
    'billing_schedule_items|owner_access|PERMISSIVE|authenticated|ALL|true|true',
    'cashflow_categories|owner_access|PERMISSIVE|authenticated|ALL|true|true',
    'customers|owner_access|PERMISSIVE|authenticated|ALL|true|true',
    'engagements|owner_access|PERMISSIVE|authenticated|ALL|true|true',
    'invoice_payments|owner_access|PERMISSIVE|authenticated|ALL|true|true',
    'invoices|owner_access|PERMISSIVE|authenticated|ALL|true|true',
    'opportunities|owner_access|PERMISSIVE|authenticated|ALL|true|true',
    'planned_cashflows|owner_access|PERMISSIVE|authenticated|ALL|true|true',
    'recurring_cashflows|owner_access|PERMISSIVE|authenticated|ALL|true|true'
  ),
  'every public policy exactly matches the owner-access contract'
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
