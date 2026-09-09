begin;

select plan(14);

insert into auth.users (id, email)
values
  ('61616161-6161-4616-8616-616161616161', 'inverse-owner@example.test'),
  ('62626262-6262-4626-8626-626262626262', 'inverse-outsider@example.test');

insert into public.app_settings (owner_user_id)
values ('61616161-6161-4616-8616-616161616161');

insert into public.customers (id, owner_user_id, name)
values
  (
    '63636363-6363-4636-8636-636363636363',
    '61616161-6161-4616-8616-616161616161',
    'Client facturé'
  ),
  (
    '64646464-6464-4646-8646-646464646464',
    '61616161-6161-4616-8616-616161616161',
    'Autre client'
  );

insert into public.engagements (
  id, owner_user_id, customer_id, reference, signed_at,
  amount_ht_cents, amount_ttc_cents
)
values
  (
    '65656565-6565-4656-8656-656565656565',
    '61616161-6161-4616-8616-616161616161',
    '63636363-6363-4636-8636-636363636363',
    'CMD-LIEE', '2026-09-01', 1000, 1200
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    '61616161-6161-4616-8616-616161616161',
    '63636363-6363-4636-8636-636363636363',
    'CMD-CIBLE', '2026-09-01', 1000, 1200
  );

insert into public.billing_schedule_items (
  id, owner_user_id, engagement_id, label, planned_invoice_date,
  amount_ht_cents, vat_cents, amount_ttc_cents, expected_payment_date
)
values (
  '67676767-6767-4676-8676-676767676767',
  '61616161-6161-4616-8616-616161616161',
  '65656565-6565-4656-8656-656565656565',
  'Jalon lié', '2026-09-01', 1000, 200, 1200, '2026-09-30'
);

select set_config('request.jwt.claim.sub', '61616161-6161-4616-8616-616161616161', true);
set local role authenticated;

select lives_ok(
  $$ select public.create_invoice(
    '63636363-6363-4636-8636-636363636363',
    '67676767-6767-4676-8676-676767676767',
    'manual', 'F-INVERSE', '2026-09-01', '2026-09-30', '2026-09-30',
    1000, 200, 1200, null
  ) $$,
  'the normal schedule-linked invoice path remains available'
);

select throws_ok(
  $$ update public.billing_schedule_items
     set owner_user_id = '62626262-6262-4626-8626-626262626262'
     where id = '67676767-6767-4676-8676-676767676767' $$,
  'P0001', 'FC_INVOICED_SCHEDULE_IMMUTABLE',
  'a linked schedule cannot change owner'
);

select throws_ok(
  $$ update public.billing_schedule_items
     set engagement_id = '66666666-6666-4666-8666-666666666666'
     where id = '67676767-6767-4676-8676-676767676767' $$,
  'P0001', 'FC_INVOICED_SCHEDULE_IMMUTABLE',
  'a linked schedule cannot move to another engagement'
);

select throws_ok(
  $$ update public.billing_schedule_items
     set amount_ht_cents = 900, vat_cents = 300, amount_ttc_cents = 1200
     where id = '67676767-6767-4676-8676-676767676767' $$,
  'P0001', 'FC_INVOICED_SCHEDULE_IMMUTABLE',
  'a linked schedule cannot change its invoice amounts'
);

select throws_ok(
  $$ delete from public.billing_schedule_items
     where id = '67676767-6767-4676-8676-676767676767' $$,
  'P0001', 'FC_INVOICED_SCHEDULE_IMMUTABLE',
  'a linked schedule cannot be deleted and implicitly detach its invoice'
);

select throws_ok(
  $$ update public.engagements
     set customer_id = '64646464-6464-4646-8646-646464646464'
     where id = '65656565-6565-4656-8656-656565656565' $$,
  'P0001', 'FC_INVOICED_ENGAGEMENT_CUSTOMER_IMMUTABLE',
  'an engagement cannot change customer while a linked invoice exists'
);

select is(
  (
    select owner_user_id::text || ':' || engagement_id::text || ':'
      || amount_ht_cents::text || ':' || vat_cents::text || ':' || amount_ttc_cents::text
    from public.billing_schedule_items
    where id = '67676767-6767-4676-8676-676767676767'
  ),
  '61616161-6161-4616-8616-616161616161:65656565-6565-4656-8656-656565656565:1000:200:1200',
  'rejected inverse mutations leave the linked schedule unchanged'
);

select is(
  (select customer_id from public.engagements where id = '65656565-6565-4656-8656-656565656565'),
  '63636363-6363-4636-8636-636363636363'::uuid,
  'a rejected customer change leaves the engagement unchanged'
);

select lives_ok(
  $$ update public.billing_schedule_items
     set label = 'Jalon lié renommé'
     where id = '67676767-6767-4676-8676-676767676767' $$,
  'non-identity schedule fields remain editable'
);

select lives_ok(
  $$ update public.engagements
     set reference = 'CMD-LIEE-RENOMMEE'
     where id = '65656565-6565-4656-8656-656565656565' $$,
  'non-customer engagement fields remain editable'
);

select lives_ok(
  $$ update public.invoices
     set billing_schedule_item_id = null
     where invoice_number = 'F-INVERSE' $$,
  'detaching from the invoice side keeps the reciprocal status coherent'
);

select is(
  (select status from public.billing_schedule_items where id = '67676767-6767-4676-8676-676767676767'),
  'planned',
  'a controlled invoice detach replans the schedule'
);

select lives_ok(
  $$ update public.billing_schedule_items
     set engagement_id = '66666666-6666-4666-8666-666666666666'
     where id = '67676767-6767-4676-8676-676767676767' $$,
  'an unlinked schedule may move through the normal editing path'
);

select lives_ok(
  $$ delete from public.billing_schedule_items
     where id = '67676767-6767-4676-8676-676767676767' $$,
  'an unlinked schedule may be deleted normally'
);

select * from finish();
rollback;
