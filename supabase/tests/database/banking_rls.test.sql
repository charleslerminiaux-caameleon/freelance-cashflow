begin;
select no_plan();
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.app_settings(owner_user_id) values ('10000000-0000-4000-8000-000000000001');
insert into public.integrations(id,owner_user_id,provider) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','qonto');
select ok(c.relrowsecurity, t || ' enables RLS') from unnest(array['integrations','sync_runs','bank_accounts','bank_transactions','provider_object_mappings','bank_account_staging','bank_transaction_staging','banking_sync_pages']) t join pg_class c on c.oid = ('public.' || t)::regclass;
select ok(not has_table_privilege(r,t,'INSERT,UPDATE,DELETE'), r || ' cannot write ' || t) from unnest(array['anon','authenticated']) r cross join unnest(array['integrations','sync_runs','bank_accounts','bank_transactions','provider_object_mappings','bank_account_staging','bank_transaction_staging','banking_sync_pages']) t;
select ok(not has_table_privilege(r,t,'SELECT'), r || ' cannot read hidden ' || t) from unnest(array['anon','authenticated']) r cross join unnest(array['bank_account_staging','bank_transaction_staging','banking_sync_pages']) t;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*) from public.integrations),1::bigint,'singleton owner reads integration');
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*) from public.integrations),0::bigint,'nonowner sees no integration');
select throws_ok($$ insert into public.integrations(owner_user_id,provider) values ('10000000-0000-4000-8000-000000000002','qonto') $$,'42501',null,'authenticated cannot write');
reset role;
set local role anon;
select throws_ok('select * from public.integrations','42501',null,'anon cannot read');
reset role;

select ok(not has_function_privilege(r, f, 'EXECUTE'), r || ' denied ' || f)
from unnest(array['anon','authenticated']) r cross join unnest(array[
'public.acquire_banking_sync(uuid,uuid)','public.renew_banking_sync(uuid,uuid)',
'public.stage_banking_page(uuid,uuid,text,text,integer,integer,jsonb)',
'public.publish_banking_sync(uuid,uuid)','public.fail_banking_sync(uuid,uuid,text,boolean)']) f;
select ok(has_function_privilege('service_role',f,'EXECUTE'),'service can execute ' || f)
from unnest(array['public.acquire_banking_sync(uuid,uuid)','public.renew_banking_sync(uuid,uuid)',
'public.stage_banking_page(uuid,uuid,text,text,integer,integer,jsonb)',
'public.publish_banking_sync(uuid,uuid)','public.fail_banking_sync(uuid,uuid,text,boolean)']) f;
select ok(prosecdef and proconfig=array['search_path=""']::text[],proname || ' has fixed definer context')
from pg_proc where pronamespace='public'::regnamespace and (proname like '%banking_sync' or proname='stage_banking_page' or proname like 'banking_%');
select ok(not has_function_privilege('service_role',f,'EXECUTE'),'internal helper cannot be invoked directly: ' || f)
from unnest(array['public.banking_require_owner(uuid)','public.banking_locked_integration(uuid,uuid)','public.banking_clear_staging(uuid,uuid)','public.banking_validate_item(jsonb,text)']) f;
set local role authenticated;
select throws_ok($$select public.acquire_banking_sync('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001')$$,'42501',null,'authenticated RPC execution rejected');
reset role;
set local role service_role;
select lives_ok($$select public.acquire_banking_sync('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001')$$,'service executes through definer');
select public.stage_banking_page('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','accounts',null,1,null,'[{"external_id":"a","name":"Synthetic account","iban_masked":null,"currency":"EUR","current_balance_cents":100,"available_balance_cents":null,"status":"active","updated_at":"2026-09-01T00:00:00Z"}]');
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*) from public.bank_accounts),0::bigint,'owner sees no unpublished accounts');
select throws_ok('select * from public.bank_account_staging','42501',null,'even owner cannot inspect staged accounts');
reset role;
select public.stage_banking_page('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','transactions','a',1,null,'[]');
select public.publish_banking_sync('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*) from public.bank_accounts),1::bigint,'owner sees published account');
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*) from public.bank_accounts),0::bigint,'nonowner cannot read published account');
select is((select count(*) from public.sync_runs),0::bigint,'nonowner cannot read run metadata');
select is((select count(*) from public.provider_object_mappings),0::bigint,'nonowner cannot read mappings');
reset role;
select * from finish();
rollback;
