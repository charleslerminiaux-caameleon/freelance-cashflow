begin;

select plan(6);

insert into auth.users (id, email)
values ('17171717-1717-4717-8717-171717171717', 'schedule-owner@example.test');

insert into public.app_settings (owner_user_id)
values ('17171717-1717-4717-8717-171717171717');

insert into public.customers (id, owner_user_id, name)
values (
  '18181818-1818-4818-8818-181818181818',
  '17171717-1717-4717-8717-171717171717',
  'Client échéancier'
);

insert into public.engagements (
  id,
  owner_user_id,
  customer_id,
  reference,
  signed_at,
  amount_ht_cents,
  amount_ttc_cents,
  payment_terms_days
)
values (
  '19191919-1919-4919-8919-191919191919',
  '17171717-1717-4717-8717-171717171717',
  '18181818-1818-4818-8818-181818181818',
  'CMD-ECHEANCIER',
  '2026-09-06',
  500,
  1000,
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
  expected_payment_date,
  status
)
values
  (
    '20202020-2020-4020-8020-202020202020',
    '17171717-1717-4717-8717-171717171717',
    '19191919-1919-4919-8919-191919191919',
    'Jalon actif',
    '2026-09-15',
    500,
    100,
    600,
    30,
    '2026-10-15',
    'planned'
  ),
  (
    '21212121-2121-4121-8121-212121212121',
    '17171717-1717-4717-8717-171717171717',
    '19191919-1919-4919-8919-191919191919',
    'Jalon annulé',
    '2026-10-15',
    700,
    0,
    700,
    30,
    '2026-11-14',
    'cancelled'
  );

select set_config(
  'request.jwt.claim.sub',
  '17171717-1717-4717-8717-171717171717',
  true
);
set local role authenticated;

select throws_ok(
  $$
    update public.engagements
    set amount_ttc_cents = 599
    where id = '19191919-1919-4919-8919-191919191919'
  $$,
  '23514',
  'FC_ENGAGEMENT_BELOW_SCHEDULE_TOTAL',
  'an engagement TTC cannot drop below its active schedule total'
);

select is(
  (
    select amount_ttc_cents
    from public.engagements
    where id = '19191919-1919-4919-8919-191919191919'
  ),
  1000::bigint,
  'a rejected parent reduction leaves the engagement unchanged'
);

select lives_ok(
  $$
    update public.engagements
    set amount_ttc_cents = 600
    where id = '19191919-1919-4919-8919-191919191919'
  $$,
  'the engagement TTC may equal its active schedule total'
);

select is(
  (
    select amount_ttc_cents
    from public.engagements
    where id = '19191919-1919-4919-8919-191919191919'
  ),
  600::bigint,
  'cancelled schedule items do not contribute to the parent floor'
);

select throws_ok(
  $$
    update public.billing_schedule_items
    set status = 'planned'
    where id = '21212121-2121-4121-8121-212121212121'
  $$,
  '23514',
  'FC_BILLING_SCHEDULE_EXCEEDS_ENGAGEMENT',
  'reactivating a cancelled item rechecks the engagement ceiling'
);

select is(
  (
    select status
    from public.billing_schedule_items
    where id = '21212121-2121-4121-8121-212121212121'
  ),
  'cancelled',
  'a rejected reactivation keeps the item cancelled'
);

select * from finish();
rollback;
