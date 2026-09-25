begin;
select no_plan();
insert into auth.users(id) values ('24000000-0000-4000-8000-000000000001'),('24000000-0000-4000-8000-000000000002');
insert into public.app_settings(owner_user_id) values ('24000000-0000-4000-8000-000000000001');
insert into public.integrations(owner_user_id,provider,last_success_at)
 select '24000000-0000-4000-8000-000000000001',p,clock_timestamp()-interval '1 hour'
 from unnest(array['qonto','revolut','bunq','pennylane']) p;

-- The atomic admission policy is identical, but gates and leases are per provider.
select ok(public.acquire_automatic_direct_banking_sync('24000000-0000-4000-8000-000000000001',gen_random_uuid(),p) is not null,p||' automatic admission')
 from unnest(array['qonto','revolut','bunq','pennylane']) p;
select is((select count(*) from public.sync_runs where status='running'),4::bigint,'all provider leases coexist');
select ok(public.acquire_automatic_direct_banking_sync('24000000-0000-4000-8000-000000000001',gen_random_uuid(),p) is null,p||' active lease skips')
 from unnest(array['qonto','revolut','bunq','pennylane']) p;
select public.fail_banking_sync(owner_user_id,lease_run_id,'PROVIDER_UNAVAILABLE',false) from public.integrations;
select ok(public.acquire_automatic_direct_banking_sync('24000000-0000-4000-8000-000000000001',gen_random_uuid(),p) is null,p||' failed attempt backs off')
 from unnest(array['qonto','revolut','bunq','pennylane']) p;
update public.integrations set last_auto_attempt_at=clock_timestamp()-interval '16 minutes';
select ok(public.acquire_automatic_direct_banking_sync('24000000-0000-4000-8000-000000000001',gen_random_uuid(),p) is not null,p||' retries after backoff')
 from unnest(array['qonto','revolut','bunq','pennylane']) p;
select public.fail_banking_sync(owner_user_id,lease_run_id,'PROVIDER_UNAVAILABLE',false) from public.integrations;
update public.integrations set last_success_at=clock_timestamp()-interval '4 minutes',last_auto_attempt_at=null;
select ok(public.acquire_automatic_direct_banking_sync('24000000-0000-4000-8000-000000000001',gen_random_uuid(),p) is null,p||' recent success skips')
 from unnest(array['qonto','revolut','bunq','pennylane']) p;
update public.integrations set last_success_at=clock_timestamp()-interval '6 minutes',last_auto_attempt_at=clock_timestamp()-interval '7 minutes';
select ok(public.acquire_automatic_direct_banking_sync('24000000-0000-4000-8000-000000000001',gen_random_uuid(),p) is not null,p||' success after attempt permits five-minute refresh')
 from unnest(array['qonto','revolut','bunq','pennylane']) p;
select public.fail_banking_sync(owner_user_id,lease_run_id,'PROVIDER_UNAVAILABLE',false) from public.integrations;
update public.integrations set last_success_at=null,last_auto_attempt_at=null;
select ok(public.acquire_automatic_direct_banking_sync('24000000-0000-4000-8000-000000000001',gen_random_uuid(),p) is null,p||' never published skips')
 from unnest(array['qonto','revolut','bunq','pennylane']) p;
select throws_ok($$select public.acquire_automatic_direct_banking_sync('24000000-0000-4000-8000-000000000002',gen_random_uuid(),'bunq')$$,'42501','DATABASE_ERROR','automatic admission rejects foreign owner');
select throws_ok($$select public.acquire_automatic_direct_banking_sync('24000000-0000-4000-8000-000000000001',gen_random_uuid(),'tiime')$$,'P0001','DATABASE_ERROR','Tiime has no automatic transport');

update public.integrations set last_success_at=clock_timestamp()-interval '1 hour';
insert into public.bank_accounts(owner_user_id,integration_id,external_id,name,currency,current_balance_cents,status,updated_at)
 select owner_user_id,id,'shared-account-id','Synthetic account','EUR',0,'active',now() from public.integrations where provider<>'pennylane';
insert into public.bank_transactions(owner_user_id,integration_id,bank_account_id,external_id,currency,amount_cents,direction,status,label,transaction_date,updated_at)
 select a.owner_user_id,a.integration_id,a.id,'shared-transaction-'||n,'EUR',1000,'outflow','completed','Synthetic Service',
 (date_trunc('month',clock_timestamp() at time zone 'Europe/Paris')-(n-1)*interval '1 month')::date,now()
 from public.bank_accounts a cross join generate_series(1,3) n;
create function pg_temp.candidates(p_provider text) returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('account_id',a.id,'currency','EUR','normalized_label','synthetic service','label','Synthetic Service','amount_cents',1000,'day_of_month',1,
 'last_payment_date',max(t.transaction_date),'next_date',(date_trunc('month',clock_timestamp() at time zone 'Europe/Paris')+interval '1 month')::date,'transaction_ids',jsonb_agg(t.id)))
 from public.bank_accounts a join public.integrations i on i.id=a.integration_id join public.bank_transactions t on t.bank_account_id=a.id where i.provider=p_provider group by a.id
$$;
create function pg_temp.command() returns jsonb language sql as $$
 select jsonb_build_object('label','Synthetic expense','amount_cents',1000,'day_of_month',1,'start_date',(date_trunc('month',clock_timestamp() at time zone 'Europe/Paris')+interval '1 month')::date,'category_id',null,'cashflow_kind','expense','certainty','certain','probability_basis_points',10000)
$$;
select lives_ok(format('select public.acquire_direct_recurring_analysis(%L,gen_random_uuid(),%L)',owner_user_id,provider),provider||' analysis acquires') from public.integrations where provider<>'pennylane';
select throws_ok(format('select public.acquire_direct_recurring_analysis(%L,gen_random_uuid(),%L)',owner_user_id,provider),'P0001','DETECTION_LOCKED',provider||' analysis lease isolated') from public.integrations where provider<>'pennylane';
select throws_ok($$select public.acquire_direct_recurring_analysis('24000000-0000-4000-8000-000000000001',gen_random_uuid(),'pennylane')$$,'P0001','DETECTION_SOURCE_UNAVAILABLE','invoice provider is not a bank source');
select throws_ok($$select public.acquire_direct_recurring_analysis('24000000-0000-4000-8000-000000000002',gen_random_uuid(),'bunq')$$,'42501','DETECTION_INVALID','analysis rejects foreign owner');
select throws_ok(format('select public.fail_direct_recurring_analysis(%L,%L,%L,%L)',r.owner_user_id,r.lease_run_id,'bunq','DATABASE_ERROR'),'P0001','DETECTION_LOCKED','foreign provider token cannot fail bunq') from public.recurring_detection_runs r join public.integrations i on i.id=r.integration_id where i.provider='revolut';
select throws_ok(format('select public.publish_direct_recurring_analysis(%L,%L,%L,%L,pg_temp.candidates(%L))',r.owner_user_id,r.lease_run_id,i.provider,i.last_success_at,'bunq'),'P0001','DETECTION_INVALID','cross-bank evidence rejected') from public.recurring_detection_runs r join public.integrations i on i.id=r.integration_id where i.provider='revolut';
select throws_ok(format('select public.publish_direct_recurring_analysis(%L,%L,%L,%L,''[]'')',r.owner_user_id,r.lease_run_id,'bunq',i.last_success_at),'P0001','DETECTION_LOCKED','cross-provider publication lease rejected') from public.recurring_detection_runs r join public.integrations i on i.id=r.integration_id where i.provider='revolut';
select lives_ok(format('select public.publish_direct_recurring_analysis(%L,%L,%L,%L,pg_temp.candidates(%L))',r.owner_user_id,r.lease_run_id,i.provider,i.last_success_at,i.provider),i.provider||' publishes independent evidence') from public.recurring_detection_runs r join public.integrations i on i.id=r.integration_id;
select is((select count(*) from public.recurring_suggestions),3::bigint,'matching external identities stay separate across banks');
select is((select count(*) from public.recurring_suggestion_evidence),9::bigint,'all-bank evidence retained');

select ok(not has_function_privilege('authenticated',f,'EXECUTE'),'owner cannot call server RPC '||f) from unnest(array[
 'public.acquire_automatic_direct_banking_sync(uuid,uuid,text)',
 'public.acquire_direct_recurring_analysis(uuid,uuid,text)',
 'public.publish_direct_recurring_analysis(uuid,uuid,text,timestamptz,jsonb)',
 'public.fail_direct_recurring_analysis(uuid,uuid,text,text)']) f;
select ok(has_function_privilege('service_role',f,'EXECUTE') and not has_function_privilege('anon',f,'EXECUTE'),'server-only privilege '||f) from unnest(array[
 'public.acquire_automatic_direct_banking_sync(uuid,uuid,text)',
 'public.acquire_direct_recurring_analysis(uuid,uuid,text)',
 'public.publish_direct_recurring_analysis(uuid,uuid,text,timestamptz,jsonb)',
 'public.fail_direct_recurring_analysis(uuid,uuid,text,text)']) f;

set local role authenticated;
select set_config('request.jwt.claim.sub','24000000-0000-4000-8000-000000000001',true);
select lives_ok(format('select public.set_recurring_suggestion_state(%L,''dismiss'')',s.id),i.provider||' dismisses its suggestion') from public.recurring_suggestions s join public.integrations i on i.id=s.integration_id;
select lives_ok(format('select public.set_recurring_suggestion_state(%L,''reexamine'')',s.id),i.provider||' reexamines its suggestion') from public.recurring_suggestions s join public.integrations i on i.id=s.integration_id;
reset role;
-- Re-publication restores eligibility for the owner-requested reexamination.
select public.acquire_direct_recurring_analysis(owner_user_id,gen_random_uuid(),provider) from public.integrations where provider<>'pennylane';
select public.publish_direct_recurring_analysis(r.owner_user_id,r.lease_run_id,i.provider,i.last_success_at,pg_temp.candidates(i.provider)) from public.recurring_detection_runs r join public.integrations i on i.id=r.integration_id;
set local role authenticated;
select lives_ok(format('select public.confirm_recurring_suggestion(%L,%L,pg_temp.command())',s.id,s.source_publication),i.provider||' confirms detected suggestion') from public.recurring_suggestions s join public.integrations i on i.id=s.integration_id;
select is((select count(*) from public.recurring_cashflows),3::bigint,'three banks create three charges');
delete from public.recurring_cashflows;
select is((select count(*) from public.recurring_suggestions where state='dismissed' and recurring_cashflow_id is null),3::bigint,'deletion suppresses every bank identity');
select lives_ok(format('select public.confirm_recurring_from_transaction(%L,%L,pg_temp.command(),null,false,true)',t.id,i.last_success_at),i.provider||' confirms historical transaction') from public.bank_transactions t join public.integrations i on i.id=t.integration_id where t.external_id='shared-transaction-1';
select is((select count(*) from public.recurring_suggestions where creation_source='history' and state='confirmed'),3::bigint,'history provenance assigned across all banks');
select is((select count(*) from public.recurring_suggestion_evidence),3::bigint,'history confirmation keeps actual selected proof only');
reset role;
-- A stale or absent Qonto publication cannot block direct-bank decisions.
update public.integrations set last_success_at=null where provider='qonto';
set local role authenticated;
select lives_ok(format('select public.confirm_recurring_from_transaction(%L,%L,pg_temp.command())',t.id,i.last_success_at),i.provider||' history replay does not depend on Qonto') from public.bank_transactions t join public.integrations i on i.id=t.integration_id where t.external_id='shared-transaction-1' and i.provider in ('revolut','bunq');
select throws_ok($$select public.confirm_recurring_from_transaction(gen_random_uuid(),now(),pg_temp.command())$$,'P0001','DETECTION_NOT_FOUND','absent transaction cannot resolve integration');
reset role;
select set_config('request.jwt.claim.sub','24000000-0000-4000-8000-000000000002',true);
select throws_ok(format('select public.confirm_recurring_suggestion(%L,%L,pg_temp.command())',s.id,s.source_publication),'42501','DETECTION_INVALID','foreign owner cannot confirm '||i.provider) from public.recurring_suggestions s join public.integrations i on i.id=s.integration_id;
select * from finish();
rollback;
