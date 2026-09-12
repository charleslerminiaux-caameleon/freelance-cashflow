begin;
select no_plan();
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.app_settings(owner_user_id) values ('10000000-0000-4000-8000-000000000001');
insert into public.integrations(id,owner_user_id,provider,last_success_at) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','qonto','2026-09-11T10:00:00.123456Z'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','qonto','2026-09-11T10:00:00Z');
insert into public.bank_accounts(id,owner_user_id,integration_id,external_id,name,currency,current_balance_cents,status,updated_at) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','a','Synthetic account','EUR',0,'active',now()),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','b','Synthetic foreign account','EUR',0,'active',now());
-- Dates are relative to owner today so strict-future checks remain meaningful.
insert into public.bank_transactions(id,owner_user_id,integration_id,bank_account_id,external_id,currency,amount_cents,direction,status,label,transaction_date,updated_at)
 select ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',n::text,'EUR',1000,'outflow','completed','Synthetïc Service',
 (date_trunc('month',clock_timestamp() at time zone 'Europe/Paris') - (n-1)*interval '1 month')::date,now() from generate_series(1,1) n;
insert into public.bank_transactions(id,owner_user_id,integration_id,bank_account_id,external_id,currency,amount_cents,direction,status,label,transaction_date,updated_at) values
 ('50000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','foreign','EUR',1000,'outflow','completed','Synthetïc Service',current_date,now());
create function pg_temp.candidate() returns jsonb language sql as $$
 select jsonb_build_object('account_id','40000000-0000-4000-8000-000000000001','currency','EUR','normalized_label','synthetic service','label','Synthetïc Service','amount_cents',1000,'day_of_month',1,
 'last_payment_date',(select max(transaction_date) from public.bank_transactions where owner_user_id='10000000-0000-4000-8000-000000000001'),
 'next_date',(date_trunc('month',clock_timestamp() at time zone 'Europe/Paris')+interval '1 month')::date,
 'transaction_ids',jsonb_build_array('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000003')) $$;
create function pg_temp.command() returns jsonb language sql as $$
 select jsonb_build_object('label','Synthetic edited expense','amount_cents',1200,'day_of_month',1,'start_date',(date_trunc('month',clock_timestamp() at time zone 'Europe/Paris')+interval '1 month')::date,
 'category_id',null,'cashflow_kind','expense','certainty','certain','probability_basis_points',10000) $$;

select has_column('public','recurring_suggestions','creation_source','provenance is explicit');
select has_function('public','confirm_recurring_from_transaction',array['uuid','timestamp with time zone','jsonb','uuid','boolean','boolean'],'history decision RPC exists');
create function pg_temp.confirm(p jsonb default pg_temp.command(), source timestamptz default '2026-09-11T10:00:00.123456Z', existing uuid default null, allow_duplicate boolean default false, recreate boolean default false, tx uuid default '50000000-0000-4000-8000-000000000001') returns uuid language sql as $$
 select public.confirm_recurring_from_transaction(tx,source,p,existing,allow_duplicate,recreate) $$;
select ok(not has_function_privilege('anon','public.confirm_recurring_from_transaction(uuid,timestamptz,jsonb,uuid,boolean,boolean)','EXECUTE'),'anonymous cannot confirm');
select ok(not has_function_privilege('service_role','public.confirm_recurring_from_transaction(uuid,timestamptz,jsonb,uuid,boolean,boolean)','EXECUTE'),'service cannot impersonate owner');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select throws_ok($$select pg_temp.confirm()$$,'42501','DETECTION_INVALID','foreign owner rejected');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select throws_ok($$select pg_temp.confirm(tx=>'50000000-0000-4000-8000-000000000099')$$,'P0001','DETECTION_NOT_FOUND','foreign transaction rejected');
select throws_ok($$select pg_temp.confirm(source=>'2026-09-11T10:00:00.123Z')$$,'P0001','DETECTION_STALE','microsecond stale publication rejected');
select throws_ok($$select pg_temp.confirm(jsonb_set(pg_temp.command(),'{start_date}',to_jsonb((clock_timestamp() at time zone 'Europe/Paris')::date)))$$,'P0001','DETECTION_INVALID','today rejected');
select throws_ok($$select pg_temp.confirm(jsonb_set(pg_temp.command(),'{start_date}',to_jsonb(((clock_timestamp() at time zone 'Europe/Paris')::date+1))))$$,'P0001','DETECTION_INVALID','future start in already paid month rejected') where date_trunc('month',(clock_timestamp() at time zone 'Europe/Paris')::date+1)=date_trunc('month',clock_timestamp() at time zone 'Europe/Paris');
select throws_ok($$select pg_temp.confirm(jsonb_set(pg_temp.command(),'{amount_cents}','0'))$$,'P0001','DETECTION_INVALID','zero command cents rejected');
select throws_ok($$select pg_temp.confirm(jsonb_set(pg_temp.command(),'{amount_cents}','9007199254740992'))$$,'P0001','DETECTION_INVALID','unsafe command cents rejected');
select throws_ok($$select pg_temp.confirm(pg_temp.command() || '{"owner_user_id":"10000000-0000-4000-8000-000000000001"}')$$,'P0001','DETECTION_INVALID','extra command field rejected');
reset role;
update public.bank_transactions set amount_cents=0 where external_id='1';
select throws_ok($$select pg_temp.confirm()$$,'P0001','DETECTION_INVALID','ineligible transaction amount_cents 0 rejected');
update public.bank_transactions set amount_cents=1000 where external_id='1';
update public.bank_transactions set direction='inflow' where external_id='1';
select throws_ok($$select pg_temp.confirm()$$,'P0001','DETECTION_INVALID','ineligible transaction direction inflow rejected');
update public.bank_transactions set direction='outflow' where external_id='1';
update public.bank_transactions set status='pending' where external_id='1';
select throws_ok($$select pg_temp.confirm()$$,'P0001','DETECTION_INVALID','ineligible transaction status pending rejected');
update public.bank_transactions set status='completed' where external_id='1';
update public.bank_transactions set status='reversed' where external_id='1';
select throws_ok($$select pg_temp.confirm()$$,'P0001','DETECTION_INVALID','ineligible transaction status reversed rejected');
update public.bank_transactions set status='completed' where external_id='1';
update public.bank_transactions set currency='USD' where external_id='1';
select throws_ok($$select pg_temp.confirm()$$,'P0001','DETECTION_INVALID','ineligible transaction currency USD rejected');
update public.bank_transactions set currency='EUR' where external_id='1';

update public.bank_accounts set is_current=false where external_id='a';
select throws_ok($$select pg_temp.confirm()$$,'P0001','DETECTION_INVALID','noncurrent account rejected');
update public.bank_accounts set is_current=true,status='closed' where external_id='a';
select throws_ok($$select pg_temp.confirm()$$,'P0001','DETECTION_INVALID','closed account rejected');
update public.bank_accounts set status='active' where external_id='a';
insert into public.cashflow_categories(id,owner_user_id,name,type) values
 ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Foreign synthetic','outflow'),
 ('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Income synthetic','inflow');
select throws_ok($$select pg_temp.confirm(jsonb_set(pg_temp.command(),'{category_id}','"70000000-0000-4000-8000-000000000001"'))$$,'P0001','DETECTION_INVALID','foreign category rejected');
select throws_ok($$select pg_temp.confirm(jsonb_set(pg_temp.command(),'{category_id}','"70000000-0000-4000-8000-000000000002"'))$$,'P0001','DETECTION_INVALID','inflow category rejected');
select throws_ok($$select pg_temp.confirm(existing=>'60000000-0000-4000-8000-000000000099')$$,'P0001','DETECTION_INVALID','absent association rejected');
select is((select count(*)::int from public.recurring_suggestions),0,'invalid requests have no persistent effect');
set local role authenticated;
select lives_ok($$select pg_temp.confirm()$$,'one eligible proof confirms charge');
select lives_ok($$select pg_temp.confirm(jsonb_set(pg_temp.command(),'{label}','"Changed on replay"'))$$,'confirmed series replay succeeds');
select is((select count(*)::int from public.recurring_cashflows),1,'double submit creates one charge');
select is((select label from public.recurring_cashflows),'Synthetic edited expense','replay does not overwrite charge');
select is((select amount_cents from public.recurring_cashflows),1200::bigint,'edited amount belongs to charge');
select is((select amount_cents from public.recurring_suggestions),1000::bigint,'observed amount remains matching baseline');
select is((select creation_source from public.recurring_suggestions),'history','history provenance recorded');
select is((select count(*)::int from public.recurring_suggestion_evidence),1,'only selected real proof stored');
select is((select state from public.recurring_suggestions),'confirmed','series confirmed');
select public.confirm_recurring_suggestion((select id from public.recurring_suggestions),'2026-09-11T10:00:00.123456Z',pg_temp.command());
select is((select creation_source from public.recurring_suggestions),'history','suggestion replay preserves confirmed history provenance');
reset role;
insert into public.bank_transactions(id,owner_user_id,integration_id,bank_account_id,external_id,currency,amount_cents,direction,status,label,transaction_date,updated_at)
 select '50000000-0000-4000-8000-000000000002',owner_user_id,integration_id,bank_account_id,'same-series','EUR',1050,'outflow','completed','SYNTHETIC SERVICE',transaction_date,now() from public.bank_transactions where external_id='1';
set local role authenticated;
select is(pg_temp.confirm(tx=>'50000000-0000-4000-8000-000000000002'),(select recurring_cashflow_id from public.recurring_suggestions),'another transaction in confirmed identity returns same charge');
select is((select amount_cents from public.recurring_suggestions),1000::bigint,'second transaction replay preserves chosen baseline');

delete from public.recurring_cashflows;
select is((select state from public.recurring_suggestions),'dismissed','deletion suppresses identity');
select throws_ok($$select pg_temp.confirm()$$,'P0001','DETECTION_INVALID','dismissed requires explicit recreation');
select lives_ok($$select pg_temp.confirm(recreate=>true)$$,'explicit recreation accepted');
delete from public.recurring_cashflows;
reset role;
insert into public.recurring_cashflows(id,owner_user_id,direction,cashflow_kind,label,amount_cents,frequency,day_of_month,start_date,certainty,probability_basis_points,active)
 values('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','outflow','expense','Synthetïc Service',1000,'monthly',12,current_date,'committed',10000,false);
set local role authenticated;
select throws_ok($$select pg_temp.confirm(recreate=>true)$$,'P0001','DETECTION_DUPLICATE','similar unlinked expense requires choice');
select lives_ok($$select pg_temp.confirm(recreate=>true,existing=>'60000000-0000-4000-8000-000000000001')$$,'association accepted');
select is((select label from public.recurring_cashflows),'Synthetïc Service','association preserves label');
select ok((select not active and day_of_month=12 and start_date=current_date and certainty='committed' from public.recurring_cashflows),'association preserves existing fields');
delete from public.recurring_cashflows;
reset role;
insert into public.recurring_cashflows(owner_user_id,direction,cashflow_kind,label,amount_cents,frequency,day_of_month,start_date,certainty,probability_basis_points,active)
 values('10000000-0000-4000-8000-000000000001','outflow','expense','Synthetïc Service',1000,'monthly',12,current_date,'committed',10000,false);
select lives_ok($$select pg_temp.confirm(recreate=>true,allow_duplicate=>true)$$,'explicit similar duplicate override accepted');
select is((select count(*)::int from public.recurring_cashflows),2,'override creates additional charge');
update public.bank_transactions set transaction_date=(date_trunc('month',clock_timestamp() at time zone 'Europe/Paris')-interval '1 month')::date where external_id='same-series';
insert into public.bank_transactions(id,owner_user_id,integration_id,bank_account_id,external_id,currency,amount_cents,direction,status,label,transaction_date,updated_at)
 select '50000000-0000-4000-8000-000000000003',owner_user_id,integration_id,bank_account_id,'third-proof','EUR',1000,'outflow','completed','SYNTHETIC SERVICE',(date_trunc('month',transaction_date)-interval '2 months')::date,now() from public.bank_transactions where external_id='1';

select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
select throws_ok($$select public.publish_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-09-11T10:00:00.123456Z',jsonb_build_array(jsonb_set(pg_temp.candidate(),'{transaction_ids}','["50000000-0000-4000-8000-000000000001"]')))$$,'P0001','DETECTION_INVALID','automatic publisher still requires three proofs');
select public.publish_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-09-11T10:00:00.123456Z',jsonb_build_array(pg_temp.candidate()));
select is((select state from public.recurring_suggestions),'confirmed','analysis preserves confirmation');
select is((select count(*)::int from public.recurring_suggestion_evidence),1,'automatic publication preserves selected history evidence');
delete from public.recurring_cashflows;
select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
select public.publish_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-09-11T10:00:00.123456Z',jsonb_build_array(pg_temp.candidate()));
select is((select state from public.recurring_suggestions),'dismissed','analysis preserves suppression');
update public.recurring_suggestions set state='pending',eligible=false,creation_source='detected';
select lives_ok($$select pg_temp.confirm()$$,'explicit history confirms pending detection regardless automatic eligibility');
select is((select creation_source from public.recurring_suggestions),'history','explicit confirmation changes pending provenance');
delete from public.recurring_cashflows;
select public.set_recurring_suggestion_state((select id from public.recurring_suggestions),'reexamine');
select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
select public.publish_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-09-11T10:00:00.123456Z',jsonb_build_array(pg_temp.candidate()));
select public.confirm_recurring_suggestion((select id from public.recurring_suggestions),'2026-09-11T10:00:00.123456Z',pg_temp.command());
select is((select creation_source from public.recurring_suggestions),'detected','last effective confirmation through detection replaces historical provenance');
select pg_temp.confirm();
select is((select creation_source from public.recurring_suggestions),'detected','history replay preserves already confirmed detected provenance');

delete from public.recurring_cashflows;
update public.bank_transactions set label=E'\t' || repeat('😀',79) || 'ab😀' || E'\n' where external_id='1';
select lives_ok($$select pg_temp.confirm()$$,'astral source label accepted');
select is((select label from public.recurring_suggestions where state='confirmed'),repeat('😀',79) || 'ab','display label uses trimmed UTF-16 budget without splitting scalar');
delete from auth.users where id='10000000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.recurring_suggestions),0,'owner deletion cascades');
select * from finish();
rollback;
