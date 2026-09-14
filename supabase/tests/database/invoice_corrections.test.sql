begin;
set local search_path = public, extensions;

select plan(18);

delete from public.app_settings;
delete from auth.users;

insert into auth.users (id, email)
values
  ('51515151-5151-4515-8515-515151515151', 'correction-owner@example.test'),
  ('52525252-5252-4525-8525-525252525252', 'correction-outsider@example.test');

insert into public.app_settings (owner_user_id)
values ('51515151-5151-4515-8515-515151515151');

insert into public.customers (id, owner_user_id, name)
values
  ('53535353-5353-4535-8535-535353535353', '51515151-5151-4515-8515-515151515151', 'Client initial'),
  ('54545454-5454-4545-8545-545454545454', '51515151-5151-4515-8515-515151515151', 'Client corrigé');

select has_function(
  'public', 'update_invoice',
  array['uuid', 'uuid', 'text', 'date', 'date', 'date', 'bigint', 'bigint', 'bigint'],
  'the invoice update RPC exists'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.update_invoice(uuid,uuid,text,date,date,date,bigint,bigint,bigint)'::regprocedure),
  false,
  'invoice updates are SECURITY INVOKER'
);
select ok(has_function_privilege('authenticated', 'public.update_invoice(uuid,uuid,text,date,date,date,bigint,bigint,bigint)', 'EXECUTE'), 'authenticated may update invoices');
select ok(not has_function_privilege('anon', 'public.update_invoice(uuid,uuid,text,date,date,date,bigint,bigint,bigint)', 'EXECUTE'), 'anonymous may not update invoices');

select has_function(
  'public', 'delete_invoice_payment', array['uuid', 'uuid'],
  'the payment deletion RPC exists'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.delete_invoice_payment(uuid,uuid)'::regprocedure),
  false,
  'payment deletion is SECURITY INVOKER'
);
select ok(has_function_privilege('authenticated', 'public.delete_invoice_payment(uuid,uuid)', 'EXECUTE'), 'authenticated may delete invoice payments');
select ok(not has_function_privilege('anon', 'public.delete_invoice_payment(uuid,uuid)', 'EXECUTE'), 'anonymous may not delete invoice payments');

select set_config('request.jwt.claim.sub', '51515151-5151-4515-8515-515151515151', true);
set local role authenticated;

select public.create_invoice(
  '53535353-5353-4535-8535-535353535353', null,
  'manual', 'F-CORRECTION-1', '2026-09-01', '2026-09-30', '2026-09-30',
  1000, 200, 1200, null
);

select lives_ok(
  $$ select public.update_invoice(
    (select id from public.invoices where invoice_number = 'F-CORRECTION-1'),
    '54545454-5454-4545-8545-545454545454',
    'F-CORRIGEE-1', '2026-09-02', '2026-10-02', '2026-10-05',
    1500, 300, 1800
  ) $$,
  'an owner can correct an existing invoice'
);
select is(
  (select customer_id::text || ':' || invoice_number || ':' || issued_at::text || ':' || due_at::text || ':' || expected_payment_date::text || ':' || amount_ttc_cents::text
   from public.invoices where invoice_number = 'F-CORRIGEE-1'),
  '54545454-5454-4545-8545-545454545454:F-CORRIGEE-1:2026-09-02:2026-10-02:2026-10-05:1800',
  'all editable invoice fields are persisted exactly'
);

select public.record_invoice_payment(
  (select id from public.invoices where invoice_number = 'F-CORRIGEE-1'),
  '55555555-5555-4555-8555-555555555555', 600, '2026-09-15'
);
select public.record_invoice_payment(
  (select id from public.invoices where invoice_number = 'F-CORRIGEE-1'),
  '56565656-5656-4565-8565-565656565656', 1200, '2026-09-20'
);

select throws_ok(
  $$ select public.update_invoice(
    (select id from public.invoices where invoice_number = 'F-CORRIGEE-1'),
    '54545454-5454-4545-8545-545454545454',
    'F-CORRIGEE-1', '2026-09-02', '2026-10-02', '2026-10-05',
    1000, 200, 1200
  ) $$,
  '22023', 'FC_INVOICE_TOTAL_BELOW_PAYMENTS',
  'an invoice total cannot be reduced below retained payments'
);

select lives_ok(
  $$ select public.delete_invoice_payment(
    (select id from public.invoices where invoice_number = 'F-CORRIGEE-1'),
    (select id from public.invoice_payments where amount_cents = 1200)
  ) $$,
  'an owner can remove one mistaken payment'
);
select is(
  (select paid_amount_cents::text || ':' || status || ':' || coalesce(paid_at::text, 'null')
   from public.invoices where invoice_number = 'F-CORRIGEE-1'),
  '600:partially_paid:null',
  'removing one payment recalculates a partially paid invoice'
);
select is((select count(*) from public.invoice_payments), 1::bigint, 'only the selected payment is removed');

select lives_ok(
  $$ select public.delete_invoice_payment(
    (select id from public.invoices where invoice_number = 'F-CORRIGEE-1'),
    (select id from public.invoice_payments where amount_cents = 600)
  ) $$,
  'the remaining payment can also be removed'
);
select is(
  (select paid_amount_cents::text || ':' || status || ':' || coalesce(paid_at::text, 'null')
   from public.invoices where invoice_number = 'F-CORRIGEE-1'),
  '0:issued:null',
  'removing every payment restores the unpaid state'
);

reset role;
select set_config('request.jwt.claim.sub', '52525252-5252-4525-8525-525252525252', true);
set local role authenticated;

select throws_ok(
  $$ select public.update_invoice(
    (select id from public.invoices where invoice_number = 'F-CORRIGEE-1'),
    '54545454-5454-4545-8545-545454545454',
    'OUTSIDER', '2026-09-02', '2026-10-02', '2026-10-05', 1500, 300, 1800
  ) $$,
  'P0001', 'FC_OWNER_REQUIRED',
  'a non-owner cannot update an invoice'
);
select throws_ok(
  $$ select public.delete_invoice_payment(
    (select id from public.invoices where invoice_number = 'F-CORRIGEE-1'),
    '57575757-5757-4575-8575-575757575757'
  ) $$,
  'P0001', 'FC_OWNER_REQUIRED',
  'a non-owner cannot delete a payment'
);

select * from finish();
rollback;
