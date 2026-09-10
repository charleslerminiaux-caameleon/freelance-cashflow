begin;
select no_plan();
select has_table('public', t, t || ' exists') from unnest(array['integrations','sync_runs','bank_accounts','bank_transactions','provider_object_mappings','bank_account_staging','bank_transaction_staging','banking_sync_pages']) t;
select has_column('public', 'bank_accounts', 'is_current', 'inventory membership');
select has_column('public', 'integrations', 'last_connection_succeeded', 'connection status');
select has_column('public', 'integrations', 'initial_created_from', 'stable initial date');

insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.app_settings(owner_user_id) values ('10000000-0000-4000-8000-000000000001');
insert into public.integrations(id,owner_user_id,provider) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','qonto');
select throws_ok($$insert into public.integrations(owner_user_id,provider) values ('10000000-0000-4000-8000-000000000001','qonto')$$,'23505',null,'unique owner/provider identity');
select lives_ok($$insert into public.integrations(owner_user_id,provider,status) values ('10000000-0000-4000-8000-000000000001','tiime','awaiting_api_access')$$,'Tiime control record allowed without connector');
insert into public.bank_accounts(id,owner_user_id,integration_id,external_id,name,currency,current_balance_cents,status,updated_at)
values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','a','Synthetic account','EUR',100,'active',now());
select throws_ok($$ update public.bank_accounts set current_balance_cents=9007199254740992 $$,'23514',null,'balance maximum safe integer enforced');
select throws_ok($$ update public.bank_accounts set current_balance_cents=-9007199254740992 $$,'23514',null,'balance minimum safe integer enforced');
select throws_ok($$ update public.bank_accounts set available_balance_cents=9007199254740992 $$,'23514',null,'available balance bounded');
select throws_ok($$ update public.bank_accounts set owner_user_id='10000000-0000-4000-8000-000000000002' $$,'23503',null,'account owner must match integration');
select throws_ok($$ update public.bank_accounts set iban_masked='FR00SYNTHETICUNMASKED' $$,'23514',null,'unmasked identifier rejected');
select throws_ok($$ update public.bank_accounts set iban_masked='FR000000000000000000000' $$,'23514',null,'complete synthetic IBAN cannot satisfy masked format');
select lives_ok($$ update public.bank_accounts set iban_masked='FR00•••••••••••••••0000' $$,'Task1 bullet-masked IBAN accepted');
select lives_ok($$ update public.bank_accounts set current_balance_cents=-9007199254740991,available_balance_cents=null,iban_masked=null $$,'negative safe balance and absent optional fields allowed');
insert into public.bank_transactions(owner_user_id,integration_id,bank_account_id,external_id,currency,amount_cents,direction,status,label,transaction_date,updated_at)
values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','t','EUR',1,'inflow','pending','Synthetic transaction','2026-09-01',now());
select throws_ok($$ update public.bank_transactions set amount_cents=-1 $$,'23514',null,'transaction amount is magnitude');
select throws_ok($$ update public.bank_transactions set amount_cents=9007199254740992 $$,'23514',null,'transaction amount bounded');
select throws_ok($$ update public.bank_transactions set owner_user_id='10000000-0000-4000-8000-000000000002' $$,'23503',null,'transaction owner must match account');
select throws_ok($$ insert into public.bank_transactions select gen_random_uuid(),owner_user_id,integration_id,bank_account_id,external_id,currency,amount_cents,direction,status,label,counterparty,transaction_date,value_date,updated_at from public.bank_transactions $$,'23505',null,'provider transaction identities unique');
select throws_ok($$insert into public.provider_object_mappings(owner_user_id,integration_id,object_kind,external_id,bank_account_id) values ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','account','a','40000000-0000-4000-8000-000000000001')$$,'23503',null,'mapping owner must match target');
select lives_ok($$ delete from auth.users where id='10000000-0000-4000-8000-000000000001' $$,'schema deprovisioning succeeds');
set constraints all immediate;
select * from finish();
rollback;
