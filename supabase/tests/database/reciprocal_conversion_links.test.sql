begin;

select plan(9);

insert into auth.users (id, email)
values ('31313131-3131-4131-8131-313131313131', 'reciprocal-owner@example.test');

insert into public.app_settings (owner_user_id)
values ('31313131-3131-4131-8131-313131313131');

insert into public.customers (id, owner_user_id, name)
values (
  '32323232-3232-4232-8232-323232323232',
  '31313131-3131-4131-8131-313131313131',
  'Client réciproque'
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
  ('33333333-3333-4333-8333-333333333333', '31313131-3131-4131-8131-313131313131', '32323232-3232-4232-8232-323232323232', 'Lien NULL', 'proposal', 100000, 5000),
  ('34343434-3434-4434-8434-343434343434', '31313131-3131-4131-8131-313131313131', '32323232-3232-4232-8232-323232323232', 'Lien réassigné', 'proposal', 100000, 5000),
  ('35353535-3535-4535-8535-353535353535', '31313131-3131-4131-8131-313131313131', '32323232-3232-4232-8232-323232323232', 'Commande supprimée', 'proposal', 100000, 5000),
  ('36363636-3636-4636-8636-363636363636', '31313131-3131-4131-8131-313131313131', '32323232-3232-4232-8232-323232323232', 'Cible non convertie', 'qualified', 100000, 5000);

select set_config(
  'request.jwt.claim.sub',
  '31313131-3131-4131-8131-313131313131',
  true
);
set local role authenticated;

select lives_ok(
  $$
    do $conversion$
    begin
      perform public.convert_opportunity('33333333-3333-4333-8333-333333333333', 'CMD-NULL', '2026-09-06', 2000, 30);
      perform public.convert_opportunity('34343434-3434-4434-8434-343434343434', 'CMD-REASSIGNATION', '2026-09-06', 2000, 30);
      perform public.convert_opportunity('35353535-3535-4535-8535-353535353535', 'CMD-SUPPRESSION', '2026-09-06', 2000, 30);
    end;
    $conversion$
  $$,
  'the conversion RPC may insert engagements before linking opportunities'
);

select is(
  (
    select count(*)
    from public.engagements as engagement
    join public.opportunities as opportunity
      on opportunity.id = engagement.opportunity_id
      and opportunity.owner_user_id = engagement.owner_user_id
      and opportunity.converted_engagement_id = engagement.id
    where engagement.owner_user_id = '31313131-3131-4131-8131-313131313131'
  ),
  3::bigint,
  'conversion establishes exact reciprocal links'
);

select throws_ok(
  $$
    update public.engagements
    set opportunity_id = null
    where reference = 'CMD-NULL'
  $$,
  'P0001',
  'FC_CONVERSION_LINK_IMMUTABLE',
  'a reciprocal engagement link cannot be cleared'
);

select is(
  (select opportunity_id from public.engagements where reference = 'CMD-NULL'),
  '33333333-3333-4333-8333-333333333333'::uuid,
  'a rejected clear preserves the engagement link'
);

select throws_ok(
  $$
    update public.engagements
    set opportunity_id = '36363636-3636-4636-8636-363636363636'
    where reference = 'CMD-REASSIGNATION'
  $$,
  'P0001',
  'FC_CONVERSION_LINK_IMMUTABLE',
  'a reciprocal engagement link cannot be reassigned'
);

select is(
  (select opportunity_id from public.engagements where reference = 'CMD-REASSIGNATION'),
  '34343434-3434-4434-8434-343434343434'::uuid,
  'a rejected reassignment preserves the engagement link'
);

select throws_ok(
  $$delete from public.engagements where reference = 'CMD-SUPPRESSION'$$,
  'P0001',
  'FC_CONVERSION_LINK_IMMUTABLE',
  'a reciprocally linked engagement cannot be deleted'
);

select is(
  (select count(*) from public.engagements where reference = 'CMD-SUPPRESSION'),
  1::bigint,
  'a rejected delete preserves the engagement'
);

select lives_ok(
  $$update public.engagements set reference = 'CMD-NULL-MISE-A-JOUR' where reference = 'CMD-NULL'$$,
  'non-link engagement fields remain editable'
);

select * from finish();
rollback;
