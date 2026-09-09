create extension if not exists dblink with schema extensions;
set search_path = public, extensions;

select plan(15);

-- A prior interrupted run may leave only a disabled fixture role behind. Remove it
-- before recreating the fixture so the next run is always self-healing.
do $cleanup_stale_fixture$
declare
  v_role_oid oid;
begin
  select oid into v_role_oid
  from pg_roles
  where rolname = 'fc_payment_concurrency_login';

  if found then
    perform pg_terminate_backend(pid)
    from pg_stat_activity
    where usesysid = v_role_oid
      and pid <> pg_backend_pid();
    execute 'drop role fc_payment_concurrency_login';
  end if;
end;
$cleanup_stale_fixture$;

create temp table payment_concurrency_runtime (
  password text not null
);

insert into payment_concurrency_runtime (password)
values (gen_random_uuid()::text || gen_random_uuid()::text);

delete from public.invoices
where owner_user_id = '41414141-4141-4414-8414-414141414141';
delete from auth.users where id = '41414141-4141-4414-8414-414141414141';

insert into auth.users (id, email)
values ('41414141-4141-4414-8414-414141414141', 'concurrent-payment@example.test');

insert into public.app_settings (owner_user_id)
values ('41414141-4141-4414-8414-414141414141');

insert into public.customers (id, owner_user_id, name)
values
  (
    '42424242-4242-4424-8424-424242424242',
    '41414141-4141-4414-8414-414141414141',
    'Concurrent client'
  ),
  (
    '47474747-4747-4747-8747-474747474747',
    '41414141-4141-4414-8414-414141414141',
    'Concurrent replacement client'
  );

insert into public.invoices (
  id,
  owner_user_id,
  customer_id,
  provider,
  invoice_number,
  issued_at,
  due_at,
  expected_payment_date,
  amount_ht_cents,
  vat_cents,
  amount_ttc_cents,
  status
)
values (
  '43434343-4343-4434-8434-434343434343',
  '41414141-4141-4414-8414-414141414141',
  '42424242-4242-4424-8424-424242424242',
  'manual',
  'F-CONCURRENT',
  '2026-09-01',
  '2026-09-30',
  '2026-09-30',
  1000,
  0,
  1000,
  'issued'
);

insert into public.engagements (
  id,
  owner_user_id,
  customer_id,
  reference,
  signed_at,
  amount_ht_cents,
  amount_ttc_cents
)
values
  (
    '48484848-4848-4848-8848-484848484848',
    '41414141-4141-4414-8414-414141414141',
    '42424242-4242-4424-8424-424242424242',
    'CMD-UPDATE-FIRST',
    '2026-09-01',
    1000,
    1200
  ),
  (
    '49494949-4949-4949-8949-494949494949',
    '41414141-4141-4414-8414-414141414141',
    '42424242-4242-4424-8424-424242424242',
    'CMD-INVOICE-FIRST',
    '2026-09-01',
    1000,
    1200
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
  expected_payment_date
)
values
  (
    '50505050-5050-4050-8050-505050505050',
    '41414141-4141-4414-8414-414141414141',
    '48484848-4848-4848-8848-484848484848',
    'Customer update first',
    '2026-09-01',
    1000,
    200,
    1200,
    '2026-09-30'
  ),
  (
    '51515151-5151-4151-8151-515151515151',
    '41414141-4141-4414-8414-414141414141',
    '49494949-4949-4949-8949-494949494949',
    'Invoice creation first',
    '2026-09-01',
    1000,
    200,
    1200,
    '2026-09-30'
  );

-- PostgreSQL must commit a new login before another connection can authenticate as
-- it. A test-local procedure supplies that visibility boundary while keeping role
-- creation, grants, runtime password, both handshakes, NOLOGIN, and failure cleanup
-- in one call. Every potentially failing data fixture is already complete.
create procedure pg_temp.establish_concurrency_connections()
language plpgsql
as $procedure$
declare
  v_password text;
  v_setup_error text;
begin
  select password into v_password from payment_concurrency_runtime;
  execute 'create role fc_payment_concurrency_login login';
  execute 'grant authenticated to fc_payment_concurrency_login';
  execute format(
    'alter role fc_payment_concurrency_login password %L',
    v_password
  );
  commit;

  begin
    perform extensions.dblink_connect(
      'payment_one',
      format(
        'host=db.supabase.internal port=%s dbname=%I user=fc_payment_concurrency_login password=%L',
        current_setting('port'),
        current_database(),
        v_password
      )
    );
    perform extensions.dblink_connect(
      'payment_two',
      format(
        'host=db.supabase.internal port=%s dbname=%I user=fc_payment_concurrency_login password=%L',
        current_setting('port'),
        current_database(),
        v_password
      )
    );
    execute 'alter role fc_payment_concurrency_login nologin';
  exception when others then
    v_setup_error := sqlstate || ':' || sqlerrm;
    execute 'alter role fc_payment_concurrency_login nologin';
    begin
      perform extensions.dblink_disconnect('payment_one');
    exception when others then
      null;
    end;
    begin
      perform extensions.dblink_disconnect('payment_two');
    exception when others then
      null;
    end;
    perform pg_terminate_backend(pid)
    from pg_stat_activity
    where usesysid = (
      select oid from pg_roles where rolname = 'fc_payment_concurrency_login'
    )
      and pid <> pg_backend_pid();
    execute 'drop role fc_payment_concurrency_login';
  end;

  commit;
  if v_setup_error is not null then
    raise exception using
      errcode = 'P0001',
      message = 'FC_CONCURRENCY_FIXTURE_SETUP_FAILED';
  end if;
end;
$procedure$;

call pg_temp.establish_concurrency_connections();

select is(
  (select rolcanlogin from pg_roles where rolname = 'fc_payment_concurrency_login'),
  false,
  'the random-password fixture role is NOLOGIN once both sessions are established'
);

select extensions.dblink_exec(
  'payment_one',
  $$do $block$ begin
    perform pg_catalog.set_config(
      'request.jwt.claim.sub',
      '41414141-4141-4414-8414-414141414141',
      false
    );
  end $block$;$$
);
select extensions.dblink_exec('payment_one', 'set role authenticated');
select extensions.dblink_exec('payment_one', 'begin');

select extensions.dblink_exec(
  'payment_two',
  $$do $block$ begin
    perform pg_catalog.set_config(
      'request.jwt.claim.sub',
      '41414141-4141-4414-8414-414141414141',
      false
    );
  end $block$;$$
);
select extensions.dblink_exec('payment_two', 'set role authenticated');
select extensions.dblink_exec('payment_two', 'begin');

select extensions.dblink_send_query(
  'payment_one',
  $$select public.record_invoice_payment(
    '43434343-4343-4434-8434-434343434343',
    '45454545-4545-4545-8545-454545454545',
    600,
    '2026-09-20'
  )$$
);

select lives_ok(
  $$select * from extensions.dblink_get_result('payment_one') as result(payment_id uuid)$$,
  'the first concurrent payment acquires the invoice row lock'
);
select *
from extensions.dblink_get_result('payment_one') as completed(payment_id uuid);

select extensions.dblink_send_query(
  'payment_two',
  $$select public.record_invoice_payment(
    '43434343-4343-4434-8434-434343434343',
    '46464646-4646-4646-8646-464646464646',
    600,
    '2026-09-20'
  )$$
);

select is(
  extensions.dblink_is_busy('payment_two'),
  1,
  'the competing payment waits on the locked invoice row'
);

select extensions.dblink_exec('payment_one', 'commit');

select throws_ok(
  $$select * from extensions.dblink_get_result('payment_two') as result(payment_id uuid)$$,
  '22023',
  'FC_PAYMENT_EXCEEDS_BALANCE',
  'the competing payment rechecks the committed balance and is rejected'
);
select *
from extensions.dblink_get_result('payment_two') as completed(payment_id uuid);

select extensions.dblink_exec('payment_two', 'rollback');

select is(
  (select paid_amount_cents from public.invoices where id = '43434343-4343-4434-8434-434343434343'),
  600::bigint,
  'concurrent calls cannot overpay the invoice'
);
select is(
  (select count(*) from public.invoice_payments where invoice_id = '43434343-4343-4434-8434-434343434343'),
  1::bigint,
  'only the successful concurrent payment is persisted'
);

select extensions.dblink_exec('payment_one', 'begin');
select extensions.dblink_exec(
  'payment_one',
  $$update public.engagements
    set customer_id = '47474747-4747-4747-8747-474747474747'
    where id = '48484848-4848-4848-8848-484848484848'$$
);
select extensions.dblink_exec('payment_two', 'begin');
select extensions.dblink_send_query(
  'payment_two',
  $$select public.create_invoice(
    '42424242-4242-4424-8424-424242424242',
    '50505050-5050-4050-8050-505050505050',
    'manual',
    'F-UPDATE-FIRST',
    '2026-09-01',
    '2026-09-30',
    '2026-09-30',
    1000,
    200,
    1200,
    null
  )$$
);
select pg_sleep(0.1);

select is(
  extensions.dblink_is_busy('payment_two'),
  1,
  'invoice creation waits when an engagement customer update owns the row lock'
);

select extensions.dblink_exec('payment_one', 'commit');

select throws_ok(
  $$select *
    from extensions.dblink_get_result('payment_two') as result(payload jsonb)$$,
  'P0001',
  'FC_SCHEDULE_INVOICE_MISMATCH',
  'invoice creation revalidates the committed customer change after waiting'
);
select *
from extensions.dblink_get_result('payment_two') as completed(payload jsonb);
select extensions.dblink_exec('payment_two', 'rollback');

select is(
  (
    select engagement.customer_id::text || ':' || count(invoice.id)::text
    from public.engagements as engagement
    left join public.billing_schedule_items as schedule
      on schedule.owner_user_id = engagement.owner_user_id
      and schedule.engagement_id = engagement.id
    left join public.invoices as invoice
      on invoice.owner_user_id = schedule.owner_user_id
      and invoice.billing_schedule_item_id = schedule.id
    where engagement.id = '48484848-4848-4848-8848-484848484848'
    group by engagement.customer_id
  ),
  '47474747-4747-4747-8747-474747474747:0',
  'the update-first interleaving commits only the coherent customer mutation'
);

select extensions.dblink_exec('payment_one', 'begin');
select extensions.dblink_send_query(
  'payment_one',
  $$select public.create_invoice(
    '42424242-4242-4424-8424-424242424242',
    '51515151-5151-4151-8151-515151515151',
    'manual',
    'F-INVOICE-FIRST',
    '2026-09-01',
    '2026-09-30',
    '2026-09-30',
    1000,
    200,
    1200,
    null
  )$$
);
select lives_ok(
  $$select *
    from extensions.dblink_get_result('payment_one') as result(payload jsonb)$$,
  'invoice creation acquires the linked engagement lock'
);
select *
from extensions.dblink_get_result('payment_one') as completed(payload jsonb);

select extensions.dblink_exec('payment_two', 'begin');
select extensions.dblink_send_query(
  'payment_two',
  $$update public.engagements
    set customer_id = '47474747-4747-4747-8747-474747474747'
    where id = '49494949-4949-4949-8949-494949494949'$$
);
select pg_sleep(0.1);

select is(
  extensions.dblink_is_busy('payment_two'),
  1,
  'the engagement customer update waits while invoice creation holds the engagement lock'
);

select extensions.dblink_exec('payment_one', 'commit');

select throws_ok(
  $$select *
    from extensions.dblink_get_result('payment_two') as result(status text)$$,
  'P0001',
  'FC_INVOICED_ENGAGEMENT_CUSTOMER_IMMUTABLE',
  'the waiting customer update is rejected after invoice creation commits'
);
select *
from extensions.dblink_get_result('payment_two') as completed(status text);
select extensions.dblink_exec('payment_two', 'rollback');

select is(
  (
    select engagement.customer_id::text || ':' || invoice.customer_id::text
    from public.engagements as engagement
    join public.billing_schedule_items as schedule
      on schedule.owner_user_id = engagement.owner_user_id
      and schedule.engagement_id = engagement.id
    join public.invoices as invoice
      on invoice.owner_user_id = schedule.owner_user_id
      and invoice.billing_schedule_item_id = schedule.id
    where engagement.id = '49494949-4949-4949-8949-494949494949'
  ),
  '42424242-4242-4424-8424-424242424242:42424242-4242-4424-8424-424242424242',
  'the invoice-first interleaving commits only the coherent invoice mutation'
);

select is(
  (
    select count(*)
    from public.invoices as invoice
    join public.billing_schedule_items as schedule
      on schedule.owner_user_id = invoice.owner_user_id
      and schedule.id = invoice.billing_schedule_item_id
    join public.engagements as engagement
      on engagement.owner_user_id = schedule.owner_user_id
      and engagement.id = schedule.engagement_id
    where invoice.customer_id <> engagement.customer_id
  ),
  0::bigint,
  'all committed schedule-linked invoices retain the engagement customer invariant'
);

select extensions.dblink_disconnect('payment_one');
select extensions.dblink_disconnect('payment_two');

drop role fc_payment_concurrency_login;

select ok(
  not exists (
    select 1 from pg_roles where rolname = 'fc_payment_concurrency_login'
  ),
  'the concurrency fixture role is absent after the happy-path cleanup'
);

select * from finish();

delete from public.invoices
where owner_user_id = '41414141-4141-4414-8414-414141414141';
delete from auth.users where id = '41414141-4141-4414-8414-414141414141';
