begin;

select plan(18);

select is(
  pg_get_function_result(
    'public.create_invoice(uuid,uuid,text,text,date,date,date,bigint,bigint,bigint,text)'::regprocedure
  ),
  'jsonb',
  'invoice creation returns its id and authoritative created flag as JSON'
);

select has_function(
  'public',
  'record_invoice_payment',
  array['uuid', 'uuid', 'bigint', 'date'],
  'payment recording requires an idempotency key'
);

select is(
  to_regprocedure('public.record_invoice_payment(uuid,bigint,date)'),
  null::regprocedure,
  'the unsafe payment contract without an idempotency key is removed'
);

select is(
  (
    select data_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'invoice_payments'
      and column_name = 'idempotency_key'
  ),
  'uuid',
  'payments store a UUID idempotency key'
);

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'invoice_payments'
      and column_name = 'idempotency_key'
  ),
  'NO',
  'every payment has an idempotency key'
);

insert into auth.users (id, email)
values ('51515151-5151-4515-8515-515151515151', 'idempotency-owner@example.test');

insert into public.app_settings (owner_user_id)
values ('51515151-5151-4515-8515-515151515151');

insert into public.customers (id, owner_user_id, name)
values (
  '52525252-5252-4525-8525-525252525252',
  '51515151-5151-4515-8515-515151515151',
  'Client idempotent'
);

select set_config('request.jwt.claim.sub', '51515151-5151-4515-8515-515151515151', true);
set local role authenticated;

select ok(
  (
    with result as (
      select to_jsonb(public.create_invoice(
        '52525252-5252-4525-8525-525252525252', null,
        'manual', 'F-IDEMPOTENT-1', '2026-09-01', '2026-09-30', '2026-09-30',
        1000, 200, 1200, null
      )) as payload
    )
    select
      (payload ->> 'created')::boolean
      and (payload ->> 'invoice_id')::uuid is not null
    from result
  ),
  'a new invoice reports created=true and its persisted id'
);

select is(
  to_jsonb(public.create_invoice(
    '52525252-5252-4525-8525-525252525252', null,
    'manual', 'F-IDEMPOTENT-1', '2026-09-01', '2026-09-30', '2026-09-30',
    1000, 200, 1200, null
  )) ->> 'created',
  'false',
  'an identical invoice replay reports created=false'
);

select is(
  (to_jsonb(public.create_invoice(
    '52525252-5252-4525-8525-525252525252', null,
    'manual', 'F-IDEMPOTENT-1', '2026-09-01', '2026-09-30', '2026-09-30',
    1000, 200, 1200, null
  )) ->> 'invoice_id')::uuid,
  (select id from public.invoices where invoice_number = 'F-IDEMPOTENT-1'),
  'an identical invoice replay returns the original id'
);

select lives_ok(
  $$ select public.record_invoice_payment(
    (select id from public.invoices where invoice_number = 'F-IDEMPOTENT-1'),
    '53535353-5353-4535-8535-535353535353',
    400,
    '2026-09-15'
  ) $$,
  'the first keyed payment is persisted'
);

select is(
  public.record_invoice_payment(
    (select id from public.invoices where invoice_number = 'F-IDEMPOTENT-1'),
    '53535353-5353-4535-8535-535353535353',
    400,
    '2026-09-15'
  ),
  (
    select id
    from public.invoice_payments
    where idempotency_key = '53535353-5353-4535-8535-535353535353'
  ),
  'an identical payment replay returns the original payment id'
);

select is(
  (select count(*) from public.invoice_payments),
  1::bigint,
  'an identical payment replay creates no duplicate row'
);

select is(
  (select paid_amount_cents from public.invoices where invoice_number = 'F-IDEMPOTENT-1'),
  400::bigint,
  'an identical payment replay does not add to the paid amount'
);

select throws_ok(
  $$ select public.record_invoice_payment(
    (select id from public.invoices where invoice_number = 'F-IDEMPOTENT-1'),
    '53535353-5353-4535-8535-535353535353',
    401,
    '2026-09-15'
  ) $$,
  'P0001',
  'FC_PAYMENT_IDEMPOTENCY_CONFLICT',
  'reusing a payment key with a different amount is rejected'
);

select lives_ok(
  $$ select public.create_invoice(
    '52525252-5252-4525-8525-525252525252', null,
    'manual', 'F-IDEMPOTENT-2', '2026-09-01', '2026-09-30', '2026-09-30',
    500, 0, 500, null
  ) $$,
  'a second invoice is available for cross-invoice key validation'
);

select throws_ok(
  $$ select public.record_invoice_payment(
    (select id from public.invoices where invoice_number = 'F-IDEMPOTENT-2'),
    '53535353-5353-4535-8535-535353535353',
    400,
    '2026-09-15'
  ) $$,
  'P0001',
  'FC_PAYMENT_IDEMPOTENCY_CONFLICT',
  'a payment key cannot be reused for another invoice owned by the same owner'
);

select throws_ok(
  $$ select public.record_invoice_payment(
    (select id from public.invoices where invoice_number = 'F-IDEMPOTENT-1'),
    null,
    800,
    '2026-09-20'
  ) $$,
  '22023',
  'FC_INVALID_PAYMENT_INPUT',
  'a missing payment idempotency key is rejected'
);

select lives_ok(
  $$ select public.record_invoice_payment(
    (select id from public.invoices where invoice_number = 'F-IDEMPOTENT-1'),
    '54545454-5454-4545-8545-545454545454',
    800,
    '2026-09-20'
  ) $$,
  'a distinct key records a distinct payment'
);

select is(
  (
    select paid_amount_cents::text || ':' || status || ':' || paid_at::text
    from public.invoices
    where invoice_number = 'F-IDEMPOTENT-1'
  ),
  '1200:paid:2026-09-20',
  'distinct payment keys preserve the normal full-payment path'
);

select * from finish();
rollback;
