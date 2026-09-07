create extension if not exists dblink with schema extensions;
set search_path = public, extensions;

select plan(7);

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

create role fc_payment_concurrency_login login;
grant authenticated to fc_payment_concurrency_login;

create temp table payment_concurrency_runtime (
  password text not null
);

insert into payment_concurrency_runtime (password)
values (gen_random_uuid()::text || gen_random_uuid()::text);

do $$
declare
  v_password text;
begin
  select password into v_password from payment_concurrency_runtime;
  execute format(
    'alter role fc_payment_concurrency_login password %L',
    v_password
  );
end;
$$;

delete from auth.users where id = '41414141-4141-4414-8414-414141414141';

insert into auth.users (id, email)
values ('41414141-4141-4414-8414-414141414141', 'concurrent-payment@example.test');

insert into public.app_settings (owner_user_id)
values ('41414141-4141-4414-8414-414141414141');

insert into public.customers (id, owner_user_id, name)
values (
  '42424242-4242-4424-8424-424242424242',
  '41414141-4141-4414-8414-414141414141',
  'Concurrent client'
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

-- LOGIN exists only for the two connection handshakes. If either connection fails,
-- the exception handler disables the role and closes any connection already opened.
do $establish_connections$
begin
  perform extensions.dblink_connect(
    'payment_one',
    format(
      'host=db.supabase.internal port=%s dbname=%I user=fc_payment_concurrency_login password=%L',
      current_setting('port'),
      current_database(),
      (select password from payment_concurrency_runtime)
    )
  );
  perform extensions.dblink_connect(
    'payment_two',
    format(
      'host=db.supabase.internal port=%s dbname=%I user=fc_payment_concurrency_login password=%L',
      current_setting('port'),
      current_database(),
      (select password from payment_concurrency_runtime)
    )
  );
  execute 'alter role fc_payment_concurrency_login nologin';
exception when others then
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
  raise;
end;
$establish_connections$;

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

delete from auth.users where id = '41414141-4141-4414-8414-414141414141';
