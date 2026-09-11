begin;
select no_plan();
select has_table('public','recurring_detection_runs','recurring_detection_runs exists');
select has_table('public','recurring_suggestions','recurring_suggestions exists');
select has_table('public','recurring_suggestion_evidence','recurring_suggestion_evidence exists');
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.app_settings(owner_user_id) values ('10000000-0000-4000-8000-000000000001');
select throws_ok($$select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001')$$,'42501','DETECTION_INVALID','service cannot analyze non-owner');
select throws_ok($$select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001')$$,'P0001','DETECTION_SOURCE_UNAVAILABLE','analysis requires published banking source');
insert into public.integrations(id,owner_user_id,provider,last_success_at) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','qonto','2026-09-11T10:00:00.123456Z'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','qonto','2026-09-11T10:00:00Z');
insert into public.bank_accounts(id,owner_user_id,integration_id,external_id,name,currency,current_balance_cents,status,updated_at) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','a','Synthetic account','EUR',0,'active',now()),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','b','Synthetic foreign account','EUR',0,'active',now());
-- Dates are relative to owner today so strict-future checks remain meaningful.
insert into public.bank_transactions(id,owner_user_id,integration_id,bank_account_id,external_id,currency,amount_cents,direction,status,label,transaction_date,updated_at)
 select ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',n::text,'EUR',1000,'outflow','completed','Synthetïc Service',
 (date_trunc('month',clock_timestamp() at time zone 'Europe/Paris') - (n-1)*interval '1 month')::date,now() from generate_series(1,3) n;
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
select lives_ok($$ select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001') $$,'analysis acquires');
select is((select lease_expires_at-last_attempt_at from public.recurring_detection_runs),interval '60 seconds','analysis lease 60 seconds');
select throws_ok($$ select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002') $$,'P0001','DETECTION_LOCKED','parallel analysis denied');
create function pg_temp.publish(p jsonb default jsonb_build_array(pg_temp.candidate())) returns void language sql as $$
 select public.publish_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-09-11T10:00:00.123456Z',p) $$;
select throws_ok($$select pg_temp.publish('{}')$$,'P0001','DETECTION_INVALID','candidate payload must be an array');
select throws_ok($$select pg_temp.publish('[null]')$$,'P0001','DETECTION_INVALID','candidate cannot be null');
select throws_ok($$select pg_temp.publish(jsonb_build_array(pg_temp.candidate(),pg_temp.candidate()))$$,'P0001','DETECTION_INVALID','duplicate series rejected atomically');
select throws_ok($$select pg_temp.publish(jsonb_build_array(pg_temp.candidate(),jsonb_set(pg_temp.candidate(),'{normalized_label}','"other"')))$$,'P0001','DETECTION_INVALID','invalid second candidate rolls back first');
select is((select count(*) from public.recurring_suggestions),0::bigint,'invalid batch leaves no suggestion');
select throws_ok($$select pg_temp.publish(jsonb_build_array(jsonb_set(pg_temp.candidate(),'{account_id}','"40000000-0000-4000-8000-000000000002"')))$$,'P0001','DETECTION_INVALID','foreign account denied');
select throws_ok($$select pg_temp.publish(jsonb_build_array(jsonb_set(pg_temp.candidate(),'{transaction_ids,0}','"50000000-0000-4000-8000-000000000099"')))$$,'P0001','DETECTION_INVALID','foreign evidence denied');
select throws_ok($$select pg_temp.publish(jsonb_build_array(jsonb_set(pg_temp.candidate(),'{amount_cents}','1.5')))$$,'P0001','DETECTION_INVALID','fractional cents denied');
select throws_ok($$select pg_temp.publish(jsonb_build_array(jsonb_set(pg_temp.candidate(),'{amount_cents}','"1000"')))$$,'P0001','DETECTION_INVALID','string cents denied');
select throws_ok($$select pg_temp.publish(jsonb_build_array(jsonb_set(pg_temp.candidate(),'{last_payment_date}','"infinity"')))$$,'P0001','DETECTION_INVALID','nonfinite dates denied');
select throws_ok($$select pg_temp.publish(jsonb_build_array(jsonb_set(pg_temp.candidate(),'{transaction_ids,0}','"50000000-0000-4000-8000-000000000002"')))$$,'P0001','DETECTION_INVALID','duplicate evidence denied');
select lives_ok($$select pg_temp.publish()$$,'publish candidate atomically');
select throws_ok($$select pg_temp.publish()$$,'P0001','DETECTION_LOCKED','successful publication replay is fenced after lease release');
select is((select count(*) from public.recurring_suggestion_evidence),3::bigint,'three evidence references stored');
select is((select count(*) from public.recurring_cashflows),0::bigint,'suggestions have no financial effect');
select is((select analyzed_publication from public.recurring_detection_runs),'2026-09-11T10:00:00.123456Z'::timestamptz,'microseconds preserved');
select is((select state from public.recurring_suggestions),'pending','new suggestion pending');
select ok((select eligible from public.recurring_suggestions),'new suggestion eligible');
select ok((select lease_run_id is null from public.recurring_detection_runs),'successful run releases lease');
select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
select pg_temp.publish('[]');
select ok(not (select eligible from public.recurring_suggestions),'absent pending series becomes ineligible');
select is((select state from public.recurring_suggestions),'pending','absence retains series identity and decision');
select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
select pg_temp.publish(jsonb_build_array(jsonb_set(pg_temp.candidate(),'{amount_cents}','1050')));
select is((select count(*) from public.recurring_suggestions),1::bigint,'estimate variation upserts same canonical series');
select is((select amount_cents from public.recurring_suggestions),1050::bigint,'pending estimates refresh');
select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
select pg_temp.publish();
select throws_ok($$insert into public.recurring_suggestion_evidence(owner_user_id,integration_id,suggestion_id,transaction_id) select owner_user_id,integration_id,id,'50000000-0000-4000-8000-000000000099' from public.recurring_suggestions$$,'23503',null,'composite evidence FK rejects foreign transaction even for privileged direct insert');
select throws_ok($$update public.recurring_suggestions set bank_account_id='40000000-0000-4000-8000-000000000002'$$,'23503',null,'composite account FK rejects foreign account on direct update');
select ok(not has_table_privilege('service_role','public.recurring_suggestions','UPDATE'),'service table mutation requires RPC');
select ok(not has_function_privilege('service_role','public.confirm_recurring_suggestion(uuid,timestamptz,jsonb,uuid,boolean)','EXECUTE'),'service cannot impersonate owner confirmation RPC');
-- Bank labels may contain 1000 Unicode characters; NFD may expand their identity.
create function pg_temp.long_candidate() returns jsonb language sql as $$
 select jsonb_set(jsonb_set(pg_temp.candidate(),'{normalized_label}',to_jsonb(public.normalize_recurring_label((select label from public.bank_transactions where id='50000000-0000-4000-8000-000000000001')))),'{label}','"Synthetic long display"') $$;
update public.bank_transactions set label=(select string_agg(chr(44032+n),'') from generate_series(0,999) n) where owner_user_id='10000000-0000-4000-8000-000000000001';
select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
select lives_ok($$select pg_temp.publish(jsonb_build_array(pg_temp.long_candidate()))$$,'expanded canonical label beyond 2000 characters is persisted');
select ok(exists(select 1 from public.recurring_suggestions where length(normalized_label)>2000),'full expanded label retained');
-- If the prior RED attempt still holds the lease, close it before the next independent case.
select public.fail_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','DETECTION_INVALID') where exists(select 1 from public.recurring_detection_runs where lease_run_id is not null);
delete from public.recurring_suggestions where normalized_label<>'synthetic service';
update public.bank_transactions set label=(select string_agg(chr(131072+((n*7919)%42000)),'') from generate_series(0,999) n) where owner_user_id='10000000-0000-4000-8000-000000000001';
select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
select lives_ok($$select pg_temp.publish(jsonb_build_array(pg_temp.long_candidate()))$$,'high-entropy 4000-byte canonical label does not exceed btree row limit');
select ok(exists(select 1 from public.recurring_suggestions where octet_length(normalized_label)=4000),'full high-entropy label retained');
select public.fail_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','DETECTION_INVALID') where exists(select 1 from public.recurring_detection_runs where lease_run_id is not null);
delete from public.recurring_suggestions where normalized_label<>'synthetic service';
update public.bank_transactions set label='Synthetïc Service' where owner_user_id='10000000-0000-4000-8000-000000000001';
select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
select pg_temp.publish();
select is(public.normalize_recurring_label(' ÉCOLE—ø œ ß Ⅷ ² 𐐀 '),'ecole ø œ ß ⅷ ² 𐐨','NFD, numbers and astral normalization parity');
select is(public.normalize_recurring_label(U&'E\0301cole  A\1AB0B'),'ecole ab','all Unicode marks removed');
select is(public.normalize_recurring_label(U&'\1C89 \+0105C9 \+016D6A'),U&'\1C8A \+0105D2 \+016D63\+016D67\+016D67','new Unicode cases and decompositions match Node');
select is(public.normalize_recurring_label(U&'\1C89Σ Σ\1C89'),U&'\1C8Aς σ\1C8A','new Unicode letters participate in contextual sigma');
select is(public.normalize_recurring_label('ΟΣ ΟΣΑ Σ'),'ος οσα σ','contextual Greek lower case matches JavaScript');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.recurring_suggestions),0::bigint,'foreign owner cannot read suggestions');
select is((select count(*) from public.recurring_detection_runs),0::bigint,'foreign owner cannot read runs');
select is((select count(*) from public.recurring_suggestion_evidence),0::bigint,'foreign owner cannot read evidence');
select throws_ok($$select public.confirm_recurring_suggestion('60000000-0000-4000-8000-000000000099',now(),'{}')$$,'42501','DETECTION_INVALID','foreign user cannot confirm');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.recurring_suggestions),1::bigint,'owner reads own suggestions');
select throws_ok($$update public.recurring_suggestions set state='confirmed'$$,'42501',null,'browser cannot write tables');
select throws_ok($$select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003')$$,'42501',null,'browser cannot acquire service analysis');
reset role;
create function pg_temp.confirm(p jsonb default pg_temp.command(), source timestamptz default '2026-09-11T10:00:00.123456Z', existing uuid default null, allow_duplicate boolean default false) returns uuid language sql as $$
 select public.confirm_recurring_suggestion((select id from public.recurring_suggestions limit 1),source,p,existing,allow_duplicate) $$;
select throws_ok($$select pg_temp.confirm(source=>'2026-09-11T10:00:00.123Z')$$,'P0001','DETECTION_STALE','truncated publication marker rejected');
select throws_ok($$select pg_temp.confirm(jsonb_set(pg_temp.command(),'{start_date}',to_jsonb((clock_timestamp() at time zone 'Europe/Paris')::date)))$$,'P0001','DETECTION_INVALID','today is not future start');
select throws_ok($$select pg_temp.confirm(null)$$,'P0001','DETECTION_INVALID','null confirmation command denied');
select throws_ok($$select pg_temp.confirm(jsonb_set(pg_temp.command(),'{probability_basis_points}','"10000"'))$$,'P0001','DETECTION_INVALID','string command probability denied');
select throws_ok($$select pg_temp.confirm(jsonb_set(pg_temp.command(),'{amount_cents}','9007199254740992'))$$,'P0001','DETECTION_INVALID','unsafe integer denied');
select throws_ok($$select pg_temp.confirm(jsonb_set(pg_temp.command(),'{cashflow_kind}','"income"'))$$,'P0001','DETECTION_INVALID','expense kind mandatory');
insert into public.cashflow_categories(id,owner_user_id,name,type) values ('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Synthetic foreign category','outflow');
select throws_ok($$select pg_temp.confirm(jsonb_set(pg_temp.command(),'{category_id}','"70000000-0000-4000-8000-000000000002"'))$$,'P0001','DETECTION_INVALID','foreign category denied');
insert into public.recurring_cashflows(id,owner_user_id,direction,cashflow_kind,label,amount_cents,frequency,day_of_month,start_date) values
 ('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','outflow','expense','SYNTHETIC SERVICE',1000,'monthly',1,current_date),
 ('80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','outflow','expense','SYNTHETIC SERVICE',1000,'monthly',1,current_date);
select throws_ok($$select pg_temp.confirm()$$,'P0001','DETECTION_DUPLICATE','similar manual expense requires explicit choice');
select throws_ok($$select pg_temp.confirm(existing=>'80000000-0000-4000-8000-000000000002')$$,'P0001','DETECTION_INVALID','foreign existing expense denied');
select throws_ok($$update public.recurring_suggestions set state='confirmed',recurring_cashflow_id='80000000-0000-4000-8000-000000000002'$$,'23503',null,'composite expense FK rejects foreign owner');
update public.recurring_cashflows set frequency='yearly' where id='80000000-0000-4000-8000-000000000001';
select throws_ok($$select pg_temp.confirm(existing=>'80000000-0000-4000-8000-000000000001')$$,'P0001','DETECTION_INVALID','association requires monthly expense');
update public.recurring_cashflows set frequency='monthly' where id='80000000-0000-4000-8000-000000000001';
create temp table expense_before as select to_jsonb(r) row from public.recurring_cashflows r where id='80000000-0000-4000-8000-000000000001';
select is(pg_temp.confirm(existing=>'80000000-0000-4000-8000-000000000001'),'80000000-0000-4000-8000-000000000001'::uuid,'associate existing monthly expense');
select is((select to_jsonb(r) from public.recurring_cashflows r where id='80000000-0000-4000-8000-000000000001'),(select row from expense_before),'association never edits existing charge');
select is(pg_temp.confirm(),'80000000-0000-4000-8000-000000000001'::uuid,'confirmation replay returns same linked charge');
update public.recurring_cashflows set amount_cents=4200,label='Synthetic user edit',active=false where id='80000000-0000-4000-8000-000000000001';
select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
select pg_temp.publish(jsonb_build_array(jsonb_set(pg_temp.candidate(),'{amount_cents}','1100')));
select is((select state from public.recurring_suggestions),'confirmed','analysis preserves confirmation');
select is((select amount_cents from public.recurring_cashflows where id='80000000-0000-4000-8000-000000000001'),4200::bigint,'analysis preserves user amount');
select ok(not (select active from public.recurring_cashflows where id='80000000-0000-4000-8000-000000000001'),'analysis preserves deactivation');
select is((select amount_cents from public.recurring_suggestions),1000::bigint,'observed matching amount preserved');
set local role authenticated;
select lives_ok($$delete from public.recurring_cashflows where id='80000000-0000-4000-8000-000000000001'$$,'existing direct owner DELETE path works');
reset role;
select is((select state from public.recurring_suggestions),'dismissed','delete suppresses series');
select ok((select recurring_cashflow_id is null from public.recurring_suggestions),'delete unlinks atomically');
select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
select pg_temp.publish();
select is((select state from public.recurring_suggestions),'dismissed','repeat analysis preserves refusal');
select throws_ok($$select pg_temp.confirm()$$,'P0001','DETECTION_STALE','dismissed suggestion cannot confirm');
select lives_ok($$select public.set_recurring_suggestion_state((select id from public.recurring_suggestions),'reexamine')$$,'reexamine allowed');
select is((select state from public.recurring_suggestions),'pending','reexamine changes decision');
select ok(not (select eligible from public.recurring_suggestions),'reexamine needs fresh analysis');
select throws_ok($$select pg_temp.confirm()$$,'P0001','DETECTION_STALE','reexamine alone cannot create charge');
select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
select pg_temp.publish();
select lives_ok($$select pg_temp.confirm(allow_duplicate=>true)$$,'confirm creates active monthly expense');
select is((select count(*) from public.recurring_cashflows where owner_user_id='10000000-0000-4000-8000-000000000001'),1::bigint,'only one newly created expense');
select is((select label from public.recurring_cashflows where owner_user_id='10000000-0000-4000-8000-000000000001'),'Synthetic edited expense','creation uses user command');
select throws_ok($$select public.set_recurring_suggestion_state((select id from public.recurring_suggestions),'dismiss')$$,'P0001','DETECTION_INVALID','confirmed charge cannot be hidden via dismiss');
select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
update public.integrations set last_success_at=last_success_at+interval '1 microsecond' where owner_user_id='10000000-0000-4000-8000-000000000001';
select throws_ok($$select pg_temp.publish()$$,'P0001','DETECTION_STALE','changed bank publication rejects analysis');
select lives_ok($$select public.fail_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','DETECTION_STALE')$$,'failure records separately');
select throws_ok($$select public.fail_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','DETECTION_INVALID')$$,'P0001','DETECTION_LOCKED','failure closure replay cannot overwrite recorded outcome');
select is((select last_error_code from public.recurring_detection_runs),'DETECTION_STALE','failure replay preserves normalized outcome');
select is((select last_success_at from public.integrations where owner_user_id='10000000-0000-4000-8000-000000000001'),'2026-09-11T10:00:00.123457Z'::timestamptz,'analysis failure preserves bank publication');
select is((select state from public.recurring_suggestions),'confirmed','analysis failure preserves prior decision');
select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
update public.recurring_detection_runs set lease_expires_at=clock_timestamp()-interval '1 second';
select throws_ok($$select pg_temp.publish()$$,'P0001','DETECTION_LOCKED','expired lease cannot publish');
select throws_ok($$select public.fail_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','DETECTION_INVALID')$$,'P0001','DETECTION_LOCKED','expired lease cannot close');
select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002');
select throws_ok($$select pg_temp.publish()$$,'P0001','DETECTION_LOCKED','replaced lease fenced');
select throws_ok($$select public.fail_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','unsafe raw diagnostic')$$,'P0001','DETECTION_INVALID','arbitrary diagnostics cannot persist');
select ok(not has_function_privilege('anon','public.confirm_recurring_suggestion(uuid,timestamptz,jsonb,uuid,boolean)','EXECUTE'),'anonymous cannot confirm');
select ok(not has_function_privilege('authenticated','public.normalize_recurring_label(text)','EXECUTE'),'normalization helper restricted');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('acquire_recurring_analysis','publish_recurring_analysis','fail_recurring_analysis','confirm_recurring_suggestion','set_recurring_suggestion_state') and not ('search_path=""'=any(p.proconfig))),'RPCs pin empty search path');
-- A normalized database failure must close only this lease and preserve all prior data.
create temp table before_generic_failure as select
 (select last_success_at from public.integrations where owner_user_id='10000000-0000-4000-8000-000000000001') bank_publication,
 (select analyzed_publication from public.recurring_detection_runs) analyzed_publication,
 (select last_success_at from public.recurring_detection_runs) analysis_success,
 (select to_jsonb(s) from public.recurring_suggestions s) suggestion;
select lives_ok($$select public.fail_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','DATABASE_ERROR')$$,'normalized database failure closes active analysis');
select is((select last_error_code from public.recurring_detection_runs),'DATABASE_ERROR','generic failure is persisted as its allowlisted code');
select ok((select lease_run_id is null and lease_expires_at is null from public.recurring_detection_runs),'generic failure releases lease');
select is((select last_success_at from public.integrations where owner_user_id='10000000-0000-4000-8000-000000000001'),(select bank_publication from before_generic_failure),'generic failure preserves bank publication');
select is((select analyzed_publication from public.recurring_detection_runs),(select analyzed_publication from before_generic_failure),'generic failure preserves analyzed publication');
select is((select last_success_at from public.recurring_detection_runs),(select analysis_success from before_generic_failure),'generic failure preserves prior analysis success');
select is((select to_jsonb(s) from public.recurring_suggestions s),(select suggestion from before_generic_failure),'generic failure preserves full prior suggestion decision');
select throws_ok($$select public.fail_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','DETECTION_INVALID')$$,'P0001','DETECTION_LOCKED','generic failure replay remains fenced');
select is((select last_error_code from public.recurring_detection_runs),'DATABASE_ERROR','failure replay cannot replace generic recorded error');
-- Keep both new regressions observable during RED even if generic closure is missing.
select public.fail_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','DETECTION_INVALID') where exists(select 1 from public.recurring_detection_runs where lease_run_id is not null);

-- Each of 10001 synthetic series is independently valid: three real owned payments.
-- This makes removing the upper limit a behavioral failure, not a duplicate-array test.
create temp table batch_base as select pg_temp.candidate() candidate;
create temp table batch_transactions as select n series, m month_offset, gen_random_uuid() id from generate_series(1,10001) n cross join generate_series(0,2) m;
insert into public.bank_transactions(id,owner_user_id,integration_id,bank_account_id,external_id,currency,amount_cents,direction,status,label,transaction_date,updated_at)
 select id,'10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
 'batch-'||series||'-'||month_offset,'EUR',1000,'outflow','completed','synthetic batch '||series,
 (date_trunc('month',clock_timestamp() at time zone 'Europe/Paris')-month_offset*interval '1 month')::date,now() from batch_transactions;
create temp table batch_candidates as select series,
 (select candidate from batch_base) || jsonb_build_object('label','synthetic batch '||series,'normalized_label','synthetic batch '||series,'transaction_ids',jsonb_agg(id order by month_offset)) candidate from batch_transactions group by series;
create function pg_temp.publish_batch(p_count integer) returns void language sql as $$
 select public.publish_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000099',
 (select last_success_at from public.integrations where owner_user_id='10000000-0000-4000-8000-000000000001'),
 (select jsonb_agg(candidate order by series) from batch_candidates where series<=p_count)) $$;
select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000099');
select lives_ok($$select pg_temp.publish_batch(1001)$$,'one atomic publication accepts more than 1000 valid candidates');
select is((select count(*) from public.recurring_suggestions where state='pending' and eligible),1001::bigint,'every candidate in large accepted batch is present and eligible');
select is((select count(*) from public.recurring_suggestion_evidence e join public.recurring_suggestions s on s.id=e.suggestion_id where s.state='pending'),3003::bigint,'large accepted batch retains all evidence references');
select is((select count(*) from public.recurring_suggestions where state='confirmed'),1::bigint,'large publication preserves previous confirmed decision');
select public.fail_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000099','DETECTION_INVALID') where exists(select 1 from public.recurring_detection_runs where lease_run_id is not null);
select public.acquire_recurring_analysis('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000099');
create temp table before_oversized_batch as select to_jsonb(r) run_state from public.recurring_detection_runs r;
select throws_ok($$select pg_temp.publish_batch(10001)$$,'P0001','DETECTION_INVALID','more than 10000 otherwise valid candidates are rejected atomically');
select is((select count(*) from public.recurring_suggestions where state='pending' and eligible),1001::bigint,'oversized rejection preserves all previous eligible suggestions');
select is((select count(*) from public.recurring_suggestion_evidence e join public.recurring_suggestions s on s.id=e.suggestion_id where s.state='pending'),3003::bigint,'oversized rejection preserves previous evidence');
select is((select to_jsonb(r) from public.recurring_detection_runs r),(select run_state from before_oversized_batch),'oversized rejection preserves lease and prior successful metadata');
select is((select last_success_at from public.integrations where owner_user_id='10000000-0000-4000-8000-000000000001'),(select bank_publication from before_generic_failure),'batch outcomes preserve banking publication');
select lives_ok($$delete from auth.users where id='10000000-0000-4000-8000-000000000001'$$,'owner deprovisioning cascades with linked expense and lease');
select is((select count(*) from public.recurring_suggestions)+(select count(*) from public.recurring_detection_runs)+(select count(*) from public.recurring_suggestion_evidence),0::bigint,'deprovisioning clears detection state');
select * from finish();
rollback;
