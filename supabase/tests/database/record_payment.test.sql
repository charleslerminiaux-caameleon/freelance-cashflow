begin;
set local search_path = public, extensions;

select plan(46);

insert into auth.users (id, email)
values
  ('31313131-3131-4313-8313-313131313131', 'invoice-owner@example.test'),
  ('32323232-3232-4323-8323-323232323232', 'invoice-outsider@example.test');

insert into public.app_settings (owner_user_id)
values ('31313131-3131-4313-8313-313131313131');

insert into public.customers (id, owner_user_id, name)
values
  (
    '33333333-3333-4333-8333-333333333333',
    '31313131-3131-4313-8313-313131313131',
    'Atelier Bleu'
  ),
  (
    '34343434-3434-4343-8343-343434343434',
    '32323232-3232-4323-8323-323232323232',
    'Client extérieur'
  );

insert into public.engagements (
  id,
  owner_user_id,
  customer_id,
  reference,
  signed_at,
  amount_ht_cents,
  amount_ttc_cents
)
values (
  '35353535-3535-4353-8353-353535353535',
  '31313131-3131-4313-8313-313131313131',
  '33333333-3333-4333-8333-333333333333',
  'CMD-FACTURE',
  '2026-09-01',
  1000,
  1200
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
  expected_payment_date
)
values (
  '36363636-3636-4363-8363-363636363636',
  '31313131-3131-4313-8313-313131313131',
  '35353535-3535-4353-8353-353535353535',
  'Acompte',
  '2026-09-01',
  1000,
  200,
  1200,
  '2026-09-30'
);

select has_function(
  'public',
  'create_invoice',
  array['uuid', 'uuid', 'text', 'text', 'date', 'date', 'date', 'bigint', 'bigint', 'bigint', 'text'],
  'the transactional invoice RPC exists'
);

select is(
  (select prosecdef from pg_proc where oid = 'public.create_invoice(uuid,uuid,text,text,date,date,date,bigint,bigint,bigint,text)'::regprocedure),
  false,
  'invoice creation is SECURITY INVOKER'
);

select is(
  (select proconfig from pg_proc where oid = 'public.create_invoice(uuid,uuid,text,text,date,date,date,bigint,bigint,bigint,text)'::regprocedure),
  array['search_path=""']::text[],
  'invoice creation locks its search path'
);

select ok(has_function_privilege('authenticated', 'public.create_invoice(uuid,uuid,text,text,date,date,date,bigint,bigint,bigint,text)', 'EXECUTE'), 'authenticated may create invoices');
select ok(not has_function_privilege('anon', 'public.create_invoice(uuid,uuid,text,text,date,date,date,bigint,bigint,bigint,text)', 'EXECUTE'), 'anonymous may not create invoices');
select ok(not has_function_privilege('service_role', 'public.create_invoice(uuid,uuid,text,text,date,date,date,bigint,bigint,bigint,text)', 'EXECUTE'), 'service role has no invoice RPC grant');

select has_function(
  'public',
  'record_invoice_payment',
  array['uuid', 'uuid', 'bigint', 'date'],
  'the payment RPC exists with the public contract'
);

select is(
  (select prosecdef from pg_proc where oid = 'public.record_invoice_payment(uuid,uuid,bigint,date)'::regprocedure),
  false,
  'payment recording is SECURITY INVOKER'
);

select is(
  (select proconfig from pg_proc where oid = 'public.record_invoice_payment(uuid,uuid,bigint,date)'::regprocedure),
  array['search_path=""']::text[],
  'payment recording locks its search path'
);

select ok(has_function_privilege('authenticated', 'public.record_invoice_payment(uuid,uuid,bigint,date)', 'EXECUTE'), 'authenticated may record payments');
select ok(not has_function_privilege('anon', 'public.record_invoice_payment(uuid,uuid,bigint,date)', 'EXECUTE'), 'anonymous may not record payments');
select ok(not has_function_privilege('service_role', 'public.record_invoice_payment(uuid,uuid,bigint,date)', 'EXECUTE'), 'service role has no payment RPC grant');

select set_config('request.jwt.claim.sub', '31313131-3131-4313-8313-313131313131', true);
set local role authenticated;

select lives_ok(
  $$ select public.create_invoice(
    '33333333-3333-4333-8333-333333333333',
    '36363636-3636-4363-8363-363636363636',
    'manual', 'F-2026-001', '2026-09-01', '2026-09-30', '2026-09-30',
    1000, 200, 1200, null
  ) $$,
  'an owner creates a schedule-linked invoice atomically'
);

select is((select count(*) from public.invoices where invoice_number = 'F-2026-001'), 1::bigint, 'one invoice is created');
select is((select status from public.billing_schedule_items where id = '36363636-3636-4363-8363-363636363636'), 'invoiced', 'the linked schedule is marked invoiced');
select is((select billing_schedule_item_id from public.invoices where invoice_number = 'F-2026-001'), '36363636-3636-4363-8363-363636363636'::uuid, 'the invoice keeps the schedule link');

select is(
  (to_jsonb(public.create_invoice(
    '33333333-3333-4333-8333-333333333333',
    '36363636-3636-4363-8363-363636363636',
    'manual', 'F-2026-001', '2026-09-01', '2026-09-30', '2026-09-30',
    1000, 200, 1200, null
  )) ->> 'invoice_id')::uuid,
  (select id from public.invoices where invoice_number = 'F-2026-001'),
  'an identical retry returns the original invoice id'
);
select is((select count(*) from public.invoices where invoice_number = 'F-2026-001'), 1::bigint, 'an identical retry creates no duplicate');

select throws_ok(
  $$ select public.create_invoice(
    '33333333-3333-4333-8333-333333333333', null,
    null, 'F-INVALID-PROVIDER', '2026-09-01', '2026-09-30', '2026-09-30',
    100, 0, 100, null
  ) $$,
  '22023', 'FC_INVALID_INVOICE_INPUT',
  'a null provider is rejected by the stable invoice boundary'
);

select throws_ok(
  $$ select public.create_invoice(
    '33333333-3333-4333-8333-333333333333', null,
    'manual', 'F-2026-001', '2026-09-01', '2026-09-30', '2026-09-30',
    1001, 200, 1201, null
  ) $$,
  'P0001', 'FC_INVOICE_NUMBER_CONFLICT',
  'the same number with a different business identity is rejected safely'
);
select is((select count(*) from public.invoices where invoice_number = 'F-2026-001'), 1::bigint, 'a number conflict writes nothing');

select throws_ok(
  $$ select public.create_invoice(
    '33333333-3333-4333-8333-333333333333',
    '36363636-3636-4363-8363-363636363636',
    'manual', 'F-2026-002', '2026-09-01', '2026-09-30', '2026-09-30',
    1000, 200, 1200, null
  ) $$,
  'P0001', 'FC_SCHEDULE_ALREADY_INVOICED',
  'a schedule item cannot be invoiced twice'
);
select is((select count(*) from public.invoices), 1::bigint, 'a rejected schedule reuse creates no invoice');

select lives_ok(
  $$ select public.create_invoice(
    '33333333-3333-4333-8333-333333333333', null,
    'manual', 'F-2026-003', '2026-09-02', '2026-10-02', '2026-10-02',
    500, 0, 500, null
  ) $$,
  'an owner creates an unlinked invoice'
);

select lives_ok(
  $$ select public.record_invoice_payment(
    (select id from public.invoices where invoice_number = 'F-2026-001'),
    '37373737-3737-4737-8737-373737373737', 400, '2026-09-15'
  ) $$,
  'a positive partial payment is recorded'
);
select is((select count(*) from public.invoice_payments where amount_cents = 400), 1::bigint, 'the partial payment row exists once');
select is(
  (select paid_amount_cents::text || ':' || status || ':' || coalesce(paid_at::text, 'null') from public.invoices where invoice_number = 'F-2026-001'),
  '400:partially_paid:null',
  'a partial payment updates amount and status without claiming full-payment date'
);

select lives_ok(
  $$ select public.record_invoice_payment(
    (select id from public.invoices where invoice_number = 'F-2026-001'),
    '38383838-3838-4838-8838-383838383838', 800, '2026-09-20'
  ) $$,
  'the exact remaining payment is recorded'
);
select is(
  (select paid_amount_cents::text || ':' || status || ':' || paid_at::text from public.invoices where invoice_number = 'F-2026-001'),
  '1200:paid:2026-09-20',
  'full payment updates amount, status, and payment date'
);
select is((select count(*) from public.invoice_payments where invoice_id = (select id from public.invoices where invoice_number = 'F-2026-001')), 2::bigint, 'both legitimate payment rows remain auditable');

select throws_ok(
  $$ select public.record_invoice_payment(
    (select id from public.invoices where invoice_number = 'F-2026-003'),
    '39393939-3939-4939-8939-393939393939', 501, '2026-09-20'
  ) $$,
  '22023', 'FC_PAYMENT_EXCEEDS_BALANCE',
  'an overpayment is rejected'
);
select is((select paid_amount_cents::text || ':' || status || ':' || coalesce(paid_at::text, 'null') from public.invoices where invoice_number = 'F-2026-003'), '0:issued:null', 'overpayment rolls back the invoice update');
select is((select count(*) from public.invoice_payments where invoice_id = (select id from public.invoices where invoice_number = 'F-2026-003')), 0::bigint, 'overpayment rolls back the payment insert');

select throws_ok($$ select public.record_invoice_payment((select id from public.invoices where invoice_number = 'F-2026-003'), '40404040-4040-4040-8040-404040404040', 0, '2026-09-20') $$, '22023', 'FC_PAYMENT_MUST_BE_POSITIVE', 'zero payment is rejected');
select throws_ok($$ select public.record_invoice_payment((select id from public.invoices where invoice_number = 'F-2026-003'), '41414141-4141-4141-8141-414141414141', -1, '2026-09-20') $$, '22023', 'FC_PAYMENT_MUST_BE_POSITIVE', 'negative payment is rejected');
select throws_ok($$ select public.record_invoice_payment((select id from public.invoices where invoice_number = 'F-2026-003'), '42424242-4242-4242-8242-424242424242', null, '2026-09-20') $$, '22023', 'FC_INVALID_PAYMENT_INPUT', 'null payment is rejected');
select is((select count(*) from public.invoice_payments where invoice_id = (select id from public.invoices where invoice_number = 'F-2026-003')), 0::bigint, 'all invalid payment inputs write nothing');

select public.create_invoice(
  '33333333-3333-4333-8333-333333333333', null,
  'manual', 'F-CANCELLED', '2026-09-02', '2026-10-02', '2026-10-02',
  100, 0, 100, null
);
update public.invoices set status = 'cancelled' where invoice_number = 'F-CANCELLED';
select throws_ok($$ select public.record_invoice_payment((select id from public.invoices where invoice_number = 'F-CANCELLED'), '43434343-4343-4343-8343-434343434343', 100, '2026-09-20') $$, 'P0001', 'FC_INVOICE_NOT_PAYABLE', 'a cancelled invoice cannot receive payment');
select is((select count(*) from public.invoice_payments where invoice_id = (select id from public.invoices where invoice_number = 'F-CANCELLED')), 0::bigint, 'cancelled invoice payment failure writes nothing');

select lives_ok(
  $$ select public.create_invoice(
    '33333333-3333-4333-8333-333333333333', null,
    'manual', 'F-MAX', '2026-09-02', '2026-10-02', '2026-10-02',
    9223372036854775807, 0, 9223372036854775807, null
  ) $$,
  'BIGINT maximum invoice cents are accepted without floating-point arithmetic'
);
select lives_ok($$ select public.record_invoice_payment((select id from public.invoices where invoice_number = 'F-MAX'), '44444444-4444-4444-8444-444444444444', 9223372036854775807, '2026-09-20') $$, 'BIGINT maximum payment is applied exactly');
select is((select paid_amount_cents from public.invoices where invoice_number = 'F-MAX'), 9223372036854775807::bigint, 'BIGINT maximum remains exact');

select throws_ok(
  $$ insert into public.invoices (
    owner_user_id, customer_id, billing_schedule_item_id, provider, invoice_number,
    issued_at, due_at, expected_payment_date, amount_ht_cents, vat_cents,
    amount_ttc_cents, status
  ) values (
    '31313131-3131-4313-8313-313131313131',
    '33333333-3333-4333-8333-333333333333',
    '36363636-3636-4363-8363-363636363636',
    'manual', 'F-DIRECT-DUPLICATE', '2026-09-01', '2026-09-30', '2026-09-30',
    1000, 200, 1200, 'issued'
  ) $$,
  'P0001', 'FC_SCHEDULE_ALREADY_INVOICED',
  'direct RLS writes cannot create a second invoice for one schedule item'
);

reset role;
select set_config('request.jwt.claim.sub', '32323232-3232-4323-8323-323232323232', true);
set local role authenticated;

select throws_ok(
  $$ select public.create_invoice(
    '34343434-3434-4343-8343-343434343434', null,
    'manual', 'OUTSIDER-1', '2026-09-01', '2026-09-30', '2026-09-30',
    100, 0, 100, null
  ) $$,
  'P0001', 'FC_OWNER_REQUIRED',
  'a non-owner cannot create an invoice even for a row carrying their uid'
);
select throws_ok(
  $$ select public.record_invoice_payment(
    (select id from public.invoices where invoice_number = 'F-2026-003'),
    '45454545-4545-4545-8545-454545454545', 500, '2026-09-20'
  ) $$,
  'P0001', 'FC_OWNER_REQUIRED',
  'a non-owner cannot record a payment'
);

reset role;
select is((select count(*) from public.invoice_payments), 3::bigint, 'non-owner attempts leave payment data unchanged');

select * from finish();
rollback;
