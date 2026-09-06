begin;

select plan(17);

insert into auth.users (id, email)
values ('12121212-1212-4212-8212-121212121212', 'authority-owner@example.test');

insert into public.app_settings (owner_user_id)
values ('12121212-1212-4212-8212-121212121212');

insert into public.customers (id, owner_user_id, name)
values (
  '13131313-1313-4313-8313-131313131313',
  '12121212-1212-4212-8212-121212121212',
  'Client autorité'
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
values
  (
    '14141414-1414-4414-8414-141414141414',
    '12121212-1212-4212-8212-121212121212',
    '13131313-1313-4313-8313-131313131313',
    'Montant courant',
    'proposal',
    600000,
    7500
  ),
  (
    '15151515-1515-4515-8515-151515151515',
    '12121212-1212-4212-8212-121212121212',
    '13131313-1313-4313-8313-131313131313',
    'TVA invalide',
    'qualified',
    100000,
    5000
  ),
  (
    '16161616-1616-4616-8616-161616161616',
    '12121212-1212-4212-8212-121212121212',
    '13131313-1313-4313-8313-131313131313',
    'Dépassement bigint',
    'proposal',
    9223372036854775807,
    5000
  );

select has_function(
  'public',
  'convert_opportunity',
  array['uuid', 'text', 'date', 'integer', 'integer'],
  'conversion accepts a VAT rate rather than a client-computed TTC amount'
);

select hasnt_function(
  'public',
  'convert_opportunity',
  array['uuid', 'text', 'date', 'bigint', 'integer'],
  'the stale client-TTC overload is removed'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.convert_opportunity(uuid,text,date,integer,integer)'::regprocedure
  ),
  false,
  'authoritative conversion remains SECURITY INVOKER'
);

select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.convert_opportunity(uuid,text,date,integer,integer)'::regprocedure
  ),
  array['search_path=""']::text[],
  'authoritative conversion keeps an empty search path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.convert_opportunity(uuid,text,date,integer,integer)',
    'EXECUTE'
  ),
  'authenticated callers may execute authoritative conversion'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.convert_opportunity(uuid,text,date,integer,integer)',
    'EXECUTE'
  ),
  'anonymous callers cannot execute authoritative conversion'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.convert_opportunity(uuid,text,date,integer,integer)',
    'EXECUTE'
  ),
  'the service role receives no authoritative conversion privilege'
);

select set_config(
  'request.jwt.claim.sub',
  '12121212-1212-4212-8212-121212121212',
  true
);
set local role authenticated;

update public.opportunities
set estimated_amount_ht_cents = 700000
where id = '14141414-1414-4414-8414-141414141414';

select lives_ok(
  $$
    select public.convert_opportunity(
      '14141414-1414-4414-8414-141414141414',
      'CMD-AUTORITE',
      '2026-09-06',
      2000,
      30
    )
  $$,
  'conversion succeeds after the source HT changes'
);

select is(
  (select amount_ht_cents from public.engagements where reference = 'CMD-AUTORITE'),
  700000::bigint,
  'the locked current opportunity HT is the engagement source of truth'
);

select is(
  (select amount_ttc_cents from public.engagements where reference = 'CMD-AUTORITE'),
  840000::bigint,
  'the database derives TTC exactly from locked HT and VAT basis points'
);

select is(
  (
    select status || ':' || (converted_engagement_id is not null)::text
    from public.opportunities
    where id = '14141414-1414-4414-8414-141414141414'
  ),
  'won:true',
  'authoritative conversion still links and wins the opportunity atomically'
);

select throws_ok(
  $$
    select public.convert_opportunity(
      '15151515-1515-4515-8515-151515151515',
      'TVA-NEGATIVE',
      '2026-09-06',
      -1,
      30
    )
  $$,
  '22023',
  'FC_INVALID_CONVERSION_INPUT',
  'negative VAT basis points are rejected'
);

select throws_ok(
  $$
    select public.convert_opportunity(
      '15151515-1515-4515-8515-151515151515',
      'TVA-TROP-ELEVEE',
      '2026-09-06',
      10001,
      30
    )
  $$,
  '22023',
  'FC_INVALID_CONVERSION_INPUT',
  'VAT basis points above one hundred percent are rejected'
);

select is(
  (select count(*) from public.engagements),
  1::bigint,
  'invalid VAT inputs create no partial engagement'
);

select throws_ok(
  $$
    select public.convert_opportunity(
      '16161616-1616-4616-8616-161616161616',
      'TTC-HORS-BIGINT',
      '2026-09-06',
      10000,
      30
    )
  $$,
  '22003',
  'FC_CONVERSION_AMOUNT_OVERFLOW',
  'a derived TTC outside bigint is rejected before persistence'
);

select is(
  (
    select status || ':' || (converted_engagement_id is null)::text
    from public.opportunities
    where id = '16161616-1616-4616-8616-161616161616'
  ),
  'proposal:true',
  'overflow leaves the source opportunity unchanged'
);

select is(
  (select count(*) from public.engagements),
  1::bigint,
  'overflow creates no partial engagement'
);

select * from finish();
rollback;
