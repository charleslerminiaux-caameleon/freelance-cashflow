begin;

select plan(15);

insert into auth.users (id, email)
values ('22222222-2222-4222-8222-222222222222', 'immutable-owner@example.test');

insert into public.app_settings (owner_user_id)
values ('22222222-2222-4222-8222-222222222222');

insert into public.customers (id, owner_user_id, name)
values (
  '23232323-2323-4323-8323-232323232323',
  '22222222-2222-4222-8222-222222222222',
  'Client immuable'
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
  ('24242424-2424-4424-8424-242424242424', '22222222-2222-4222-8222-222222222222', '23232323-2323-4323-8323-232323232323', 'Statut', 'proposal', 100000, 5000),
  ('25252525-2525-4525-8525-252525252525', '22222222-2222-4222-8222-222222222222', '23232323-2323-4323-8323-232323232323', 'Lien', 'proposal', 100000, 5000),
  ('26262626-2626-4626-8626-262626262626', '22222222-2222-4222-8222-222222222222', '23232323-2323-4323-8323-232323232323', 'Montant', 'proposal', 100000, 5000),
  ('27272727-2727-4727-8727-272727272727', '22222222-2222-4222-8222-222222222222', '23232323-2323-4323-8323-232323232323', 'SuppressionX', 'proposal', 100000, 5000),
  ('28282828-2828-4828-8828-282828282828', '22222222-2222-4222-8222-222222222222', '23232323-2323-4323-8323-232323232323', 'Éditable', 'lead', 50000, 1000),
  ('29292929-2929-4929-8929-292929292929', '22222222-2222-4222-8222-222222222222', '23232323-2323-4323-8323-232323232323', 'Lien incohérent', 'proposal', 50000, 5000);

select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);
set local role authenticated;

do $$
begin
  perform public.convert_opportunity('24242424-2424-4424-8424-242424242424', 'CMD-STATUT', '2026-09-06', 2000, 30);
  perform public.convert_opportunity('25252525-2525-4525-8525-252525252525', 'CMD-LIEN', '2026-09-06', 2000, 30);
  perform public.convert_opportunity('26262626-2626-4626-8626-262626262626', 'CMD-MONTANT', '2026-09-06', 2000, 30);
  perform public.convert_opportunity('27272727-2727-4727-8727-272727272727', 'CMD-SUPPRESSION', '2026-09-06', 2000, 30);
end;
$$;

insert into public.engagements (
  id,
  owner_user_id,
  customer_id,
  reference,
  signed_at,
  amount_ht_cents,
  amount_ttc_cents,
  payment_terms_days
) values (
  '30303030-3030-4030-8030-303030303030',
  '22222222-2222-4222-8222-222222222222',
  '23232323-2323-4323-8323-232323232323',
  'CMD-SANS-OPPORTUNITE',
  '2026-09-06',
  50000,
  60000,
  30
);

select throws_ok(
  $$update public.opportunities set status = 'proposal' where id = '24242424-2424-4424-8424-242424242424'$$,
  'P0001',
  'FC_CONVERTED_OPPORTUNITY_IMMUTABLE',
  'a converted opportunity must remain won'
);

select is(
  (select status from public.opportunities where id = '24242424-2424-4424-8424-242424242424'),
  'won',
  'a rejected status mutation leaves won intact'
);

select throws_ok(
  $$update public.opportunities set converted_engagement_id = null where id = '25252525-2525-4525-8525-252525252525'$$,
  'P0001',
  'FC_CONVERTED_OPPORTUNITY_IMMUTABLE',
  'a converted opportunity link cannot be cleared'
);

select isnt(
  (select converted_engagement_id from public.opportunities where id = '25252525-2525-4525-8525-252525252525'),
  null::uuid,
  'a rejected link mutation preserves the engagement link'
);

select throws_ok(
  $$update public.opportunities set estimated_amount_ht_cents = 200000 where id = '26262626-2626-4626-8626-262626262626'$$,
  'P0001',
  'FC_CONVERTED_OPPORTUNITY_IMMUTABLE',
  'commercial values copied to an engagement become immutable'
);

select is(
  (select estimated_amount_ht_cents from public.opportunities where id = '26262626-2626-4626-8626-262626262626'),
  100000::bigint,
  'a rejected commercial mutation leaves the source amount intact'
);

select throws_ok(
  $$delete from public.opportunities where id = '27272727-2727-4727-8727-272727272727'$$,
  'P0001',
  'FC_CONVERTED_OPPORTUNITY_IMMUTABLE',
  'a converted opportunity cannot be deleted'
);

select is(
  (select count(*) from public.opportunities where id = '27272727-2727-4727-8727-272727272727'),
  1::bigint,
  'a rejected delete preserves the converted opportunity'
);

select throws_ok(
  $$
    insert into public.opportunities (
      owner_user_id,
      customer_id,
      name,
      status,
      estimated_amount_ht_cents,
      probability_basis_points
    ) values (
      '22222222-2222-4222-8222-222222222222',
      '23232323-2323-4323-8323-232323232323',
      'Gagnée sans commande',
      'won',
      50000,
      10000
    )
  $$,
  'P0001',
  'FC_WON_OPPORTUNITY_REQUIRES_ENGAGEMENT',
  'won cannot be assigned without a coherent engagement link'
);

select lives_ok(
  $$update public.opportunities set name = 'Éditable mise à jour' where id = '28282828-2828-4828-8828-282828282828'$$,
  'an unconverted opportunity remains editable'
);

select is(
  (select name from public.opportunities where id = '28282828-2828-4828-8828-282828282828'),
  'Éditable mise à jour',
  'the unconverted opportunity edit is persisted'
);

select lives_ok(
  $$update public.opportunities set notes = 'Note post-conversion' where id = '24242424-2424-4424-8424-242424242424'$$,
  'non-contractual notes remain editable after conversion'
);

select is(
  (select notes from public.opportunities where id = '24242424-2424-4424-8424-242424242424'),
  'Note post-conversion',
  'the permitted note mutation is persisted'
);

select throws_ok(
  $$
    update public.opportunities
    set
      status = 'won',
      converted_engagement_id = '30303030-3030-4030-8030-303030303030'
    where id = '29292929-2929-4929-8929-292929292929'
  $$,
  'P0001',
  'FC_WON_OPPORTUNITY_REQUIRES_ENGAGEMENT',
  'a won opportunity link must point to its reciprocal engagement'
);

select is(
  (
    select status || ':' || (converted_engagement_id is null)::text
    from public.opportunities
    where id = '29292929-2929-4929-8929-292929292929'
  ),
  'proposal:true',
  'a rejected incoherent link leaves the opportunity unconverted'
);

select * from finish();
rollback;
