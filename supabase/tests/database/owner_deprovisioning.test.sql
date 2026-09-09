begin;

select plan(27);

select is(
  (select prosecdef from pg_proc where oid = 'public.preserve_converted_opportunity()'::regprocedure),
  true,
  'the converted-opportunity trigger may inspect auth state as its definer'
);

select is(
  (select proconfig from pg_proc where oid = 'public.preserve_converted_opportunity()'::regprocedure),
  array['search_path=""']::text[],
  'the converted-opportunity trigger locks its search path'
);

select is(
  (select prosecdef from pg_proc where oid = 'public.preserve_engagement_conversion_link()'::regprocedure),
  true,
  'the reciprocal-link trigger may inspect auth state as its definer'
);

select is(
  (select proconfig from pg_proc where oid = 'public.preserve_engagement_conversion_link()'::regprocedure),
  array['search_path=""']::text[],
  'the reciprocal-link trigger locks its search path'
);

select is(
  (select prosecdef from pg_proc where oid = 'public.protect_invoiced_schedule_identity()'::regprocedure),
  true,
  'the invoiced-schedule trigger may inspect auth state as its definer'
);

select is(
  (select proconfig from pg_proc where oid = 'public.protect_invoiced_schedule_identity()'::regprocedure),
  array['search_path=""']::text[],
  'the invoiced-schedule trigger locks its search path'
);

select is(
  (select prosecdef from pg_proc where oid = 'public.synchronize_invoice_schedule_status()'::regprocedure),
  true,
  'the schedule-status trigger may inspect auth state as its definer'
);

select is(
  (select proconfig from pg_proc where oid = 'public.synchronize_invoice_schedule_status()'::regprocedure),
  array['search_path=""']::text[],
  'the schedule-status trigger locks its search path'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.preserve_converted_opportunity()',
    'execute'
  ),
  'anon cannot execute the converted-opportunity trigger function'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.preserve_converted_opportunity()',
    'execute'
  ),
  'authenticated cannot execute the converted-opportunity trigger function'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.preserve_converted_opportunity()',
    'execute'
  ),
  'service_role cannot execute the converted-opportunity trigger function'
);

select ok(
  has_function_privilege(
    'postgres',
    'public.preserve_converted_opportunity()',
    'execute'
  ),
  'postgres retains execution authority for the converted-opportunity trigger function'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.preserve_engagement_conversion_link()',
    'execute'
  ),
  'anon cannot execute the reciprocal-link trigger function'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.preserve_engagement_conversion_link()',
    'execute'
  ),
  'authenticated cannot execute the reciprocal-link trigger function'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.preserve_engagement_conversion_link()',
    'execute'
  ),
  'service_role cannot execute the reciprocal-link trigger function'
);

select ok(
  has_function_privilege(
    'postgres',
    'public.preserve_engagement_conversion_link()',
    'execute'
  ),
  'postgres retains execution authority for the reciprocal-link trigger function'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.protect_invoiced_schedule_identity()',
    'execute'
  ),
  'anon cannot execute the invoiced-schedule trigger function'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.protect_invoiced_schedule_identity()',
    'execute'
  ),
  'authenticated cannot execute the invoiced-schedule trigger function'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.protect_invoiced_schedule_identity()',
    'execute'
  ),
  'service_role cannot execute the invoiced-schedule trigger function'
);

select ok(
  has_function_privilege(
    'postgres',
    'public.protect_invoiced_schedule_identity()',
    'execute'
  ),
  'postgres retains execution authority for the invoiced-schedule trigger function'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.synchronize_invoice_schedule_status()',
    'execute'
  ),
  'anon cannot execute the schedule-status trigger function'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.synchronize_invoice_schedule_status()',
    'execute'
  ),
  'authenticated cannot execute the schedule-status trigger function'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.synchronize_invoice_schedule_status()',
    'execute'
  ),
  'service_role cannot execute the schedule-status trigger function'
);

select ok(
  has_function_privilege(
    'postgres',
    'public.synchronize_invoice_schedule_status()',
    'execute'
  ),
  'postgres retains execution authority for the schedule-status trigger function'
);

insert into auth.users (id, email)
values ('73737373-7373-4373-8373-737373737373', 'deprovisioning-owner@example.test');

insert into public.app_settings (owner_user_id)
values ('73737373-7373-4373-8373-737373737373');

insert into public.customers (id, owner_user_id, name)
values (
  '74747474-7474-4474-8474-747474747474',
  '73737373-7373-4373-8373-737373737373',
  'Client à supprimer'
);

insert into public.opportunities (
  id,
  owner_user_id,
  customer_id,
  name,
  status,
  estimated_amount_ht_cents,
  probability_basis_points
)
values (
  '75757575-7575-4575-8575-757575757575',
  '73737373-7373-4373-8373-737373737373',
  '74747474-7474-4474-8474-747474747474',
  'Mission convertie à supprimer',
  'proposal',
  100000,
  10000
);

select set_config(
  'request.jwt.claim.sub',
  '73737373-7373-4373-8373-737373737373',
  true
);
set local role authenticated;

select public.convert_opportunity(
  '75757575-7575-4575-8575-757575757575',
  'CMD-DEPROVISIONING',
  '2026-09-08',
  2000,
  30
);

insert into public.billing_schedule_items (
  id,
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
  '76767676-7676-4676-8676-767676767676',
  owner_user_id,
  id,
  'Acompte facturé à supprimer',
  '2026-09-08',
  100000,
  20000,
  120000,
  30,
  '2026-10-08'
from public.engagements
where opportunity_id = '75757575-7575-4575-8575-757575757575';

select public.create_invoice(
  '74747474-7474-4474-8474-747474747474',
  '76767676-7676-4676-8676-767676767676',
  'manual',
  'F-DEPROVISIONING',
  '2026-09-08',
  '2026-10-08',
  '2026-10-08',
  100000,
  20000,
  120000,
  null
);

reset role;

select lives_ok(
  $$delete from auth.users where id = '73737373-7373-4373-8373-737373737373'$$,
  'deprovisioning an owner may cascade through a converted opportunity'
);

select is(
  (
    select count(*)
    from auth.users
    where id = '73737373-7373-4373-8373-737373737373'
  ),
  0::bigint,
  'deprovisioning removes the authentication account'
);

select is(
  (
    select
      (select count(*) from public.app_settings where owner_user_id = owner.id)
      + (select count(*) from public.customers where owner_user_id = owner.id)
      + (select count(*) from public.opportunities where owner_user_id = owner.id)
      + (select count(*) from public.engagements where owner_user_id = owner.id)
      + (select count(*) from public.billing_schedule_items where owner_user_id = owner.id)
      + (select count(*) from public.invoices where owner_user_id = owner.id)
    from (values ('73737373-7373-4373-8373-737373737373'::uuid)) as owner(id)
  ),
  0::bigint,
  'deprovisioning removes the converted commercial graph'
);

select * from finish();
rollback;
