-- Published inventory and hidden staging are separate; only RPC publication crosses the boundary.
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('qonto', 'tiime')),
  status text not null default 'not_connected' check (status in ('not_connected', 'syncing', 'connected', 'error', 'awaiting_api_access')),
  lease_run_id uuid,
  lease_expires_at timestamptz,
  last_connection_succeeded boolean,
  last_success_at timestamptz,
  last_published_updated_to timestamptz,
  initial_created_from date,
  last_error_code text check (last_error_code in ('PROVIDER_AUTH_EXPIRED','PROVIDER_RATE_LIMIT','PROVIDER_UNAVAILABLE','PROVIDER_INVALID_RESPONSE','SYNC_LOCKED','DATABASE_ERROR')),
  created_at timestamptz not null default now(),
  unique (owner_user_id, provider),
  unique (owner_user_id, id),
  check ((lease_run_id is null) = (lease_expires_at is null))
);

create table public.sync_runs (
  id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null,
  status text not null default 'running' check (status in ('running','succeeded','failed','interrupted')),
  initial_created_from date,
  updated_from timestamptz not null,
  updated_to timestamptz not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  error_code text check (error_code in ('PROVIDER_AUTH_EXPIRED','PROVIDER_RATE_LIMIT','PROVIDER_UNAVAILABLE','PROVIDER_INVALID_RESPONSE','SYNC_LOCKED','DATABASE_ERROR')),
  unique (owner_user_id, integration_id, id),
  foreign key (owner_user_id, integration_id) references public.integrations(owner_user_id, id) on delete cascade,
  check (updated_from <= updated_to)
);
alter table public.integrations add constraint integrations_lease_run_fk
  foreign key (owner_user_id, id, lease_run_id) references public.sync_runs(owner_user_id, integration_id, id)
  deferrable initially deferred;

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null,
  external_id text not null check (length(trim(external_id)) between 1 and 200),
  name text not null check (length(trim(name)) between 1 and 500),
  iban_masked text check (iban_masked is null or iban_masked ~ '^[A-Z]{2}[0-9]{2}•{7,26}[A-Z0-9]{4}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  current_balance_cents bigint not null check (current_balance_cents between -9007199254740991 and 9007199254740991),
  available_balance_cents bigint check (available_balance_cents between -9007199254740991 and 9007199254740991),
  status text not null check (status in ('active', 'closed')),
  updated_at timestamptz not null check (isfinite(updated_at)),
  is_current boolean not null default true,
  unique (owner_user_id, integration_id, external_id),
  unique (owner_user_id, integration_id, id),
  foreign key (owner_user_id, integration_id) references public.integrations(owner_user_id, id) on delete cascade
);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null,
  bank_account_id uuid not null,
  external_id text not null check (length(trim(external_id)) between 1 and 200),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_cents bigint not null check (amount_cents between 0 and 9007199254740991),
  direction text not null check (direction in ('inflow', 'outflow')),
  status text not null check (status in ('pending', 'completed', 'declined', 'reversed')),
  label text not null check (length(trim(label)) between 1 and 1000),
  counterparty text check (counterparty is null or length(trim(counterparty)) between 1 and 500),
  transaction_date date not null check (isfinite(transaction_date)),
  value_date date check (isfinite(value_date)),
  updated_at timestamptz not null check (isfinite(updated_at)),
  unique (owner_user_id, integration_id, external_id),
  unique (owner_user_id, integration_id, id),
  foreign key (owner_user_id, integration_id, bank_account_id) references public.bank_accounts(owner_user_id, integration_id, id) on delete cascade
);

create table public.provider_object_mappings (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null,
  object_kind text not null check (object_kind in ('account','transaction')),
  external_id text not null check (length(trim(external_id)) between 1 and 200),
  bank_account_id uuid,
  bank_transaction_id uuid,
  primary key (owner_user_id, integration_id, object_kind, external_id),
  check ((object_kind = 'account' and bank_account_id is not null and bank_transaction_id is null)
    or (object_kind = 'transaction' and bank_account_id is null and bank_transaction_id is not null)),
  foreign key (owner_user_id, integration_id) references public.integrations(owner_user_id, id) on delete cascade,
  foreign key (owner_user_id, integration_id, bank_account_id) references public.bank_accounts(owner_user_id, integration_id, id) on delete cascade,
  foreign key (owner_user_id, integration_id, bank_transaction_id) references public.bank_transactions(owner_user_id, integration_id, id) on delete cascade
);

create table public.bank_account_staging (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null,
  run_id uuid not null,
  external_id text not null check (length(trim(external_id)) between 1 and 200),
  name text not null check (length(trim(name)) between 1 and 500),
  iban_masked text check (iban_masked is null or iban_masked ~ '^[A-Z]{2}[0-9]{2}•{7,26}[A-Z0-9]{4}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  current_balance_cents bigint not null check (current_balance_cents between -9007199254740991 and 9007199254740991),
  available_balance_cents bigint check (available_balance_cents between -9007199254740991 and 9007199254740991),
  status text not null check (status in ('active', 'closed')),
  updated_at timestamptz not null check (isfinite(updated_at)),
  primary key (owner_user_id, run_id, external_id),
  foreign key (owner_user_id, integration_id, run_id) references public.sync_runs(owner_user_id, integration_id, id) on delete cascade
);

create table public.bank_transaction_staging (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null,
  run_id uuid not null,
  account_external_id text not null,
  external_id text not null check (length(trim(external_id)) between 1 and 200),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_cents bigint not null check (amount_cents between 0 and 9007199254740991),
  direction text not null check (direction in ('inflow', 'outflow')),
  status text not null check (status in ('pending', 'completed', 'declined', 'reversed')),
  label text not null check (length(trim(label)) between 1 and 1000),
  counterparty text check (counterparty is null or length(trim(counterparty)) between 1 and 500),
  transaction_date date not null check (isfinite(transaction_date)),
  value_date date check (isfinite(value_date)),
  updated_at timestamptz not null check (isfinite(updated_at)),
  primary key (owner_user_id, run_id, external_id),
  foreign key (owner_user_id, integration_id, run_id) references public.sync_runs(owner_user_id, integration_id, id) on delete cascade,
  foreign key (owner_user_id, run_id, account_external_id) references public.bank_account_staging(owner_user_id, run_id, external_id) on delete cascade
);

-- One receipt per persisted page. Fingerprints allow exact replay without retaining raw JSON.
create table public.banking_sync_pages (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null,
  run_id uuid not null,
  kind text not null check (kind in ('accounts','transactions')),
  account_external_id text not null,
  page integer not null check (page > 0),
  next_page integer check (next_page = page + 1),
  fingerprint text not null,
  primary key (owner_user_id, run_id, kind, account_external_id, page),
  check ((kind = 'accounts' and account_external_id = '') or (kind = 'transactions' and length(trim(account_external_id)) between 1 and 200)),
  foreign key (owner_user_id, integration_id, run_id) references public.sync_runs(owner_user_id, integration_id, id) on delete cascade
);

alter table public.integrations enable row level security;
revoke all on public.integrations from public, anon, authenticated;
grant all on public.integrations to service_role;
grant select on public.integrations to authenticated;
create policy owner_read on public.integrations for select to authenticated
using (owner_user_id = (select auth.uid()) and exists (
  select 1 from public.app_settings where owner_user_id = (select auth.uid())
));

alter table public.sync_runs enable row level security;
revoke all on public.sync_runs from public, anon, authenticated;
grant all on public.sync_runs to service_role;
grant select on public.sync_runs to authenticated;
create policy owner_read on public.sync_runs for select to authenticated
using (owner_user_id = (select auth.uid()) and exists (
  select 1 from public.app_settings where owner_user_id = (select auth.uid())
));

alter table public.bank_accounts enable row level security;
revoke all on public.bank_accounts from public, anon, authenticated;
grant all on public.bank_accounts to service_role;
grant select on public.bank_accounts to authenticated;
create policy owner_read on public.bank_accounts for select to authenticated
using (owner_user_id = (select auth.uid()) and exists (
  select 1 from public.app_settings where owner_user_id = (select auth.uid())
));

alter table public.bank_transactions enable row level security;
revoke all on public.bank_transactions from public, anon, authenticated;
grant all on public.bank_transactions to service_role;
grant select on public.bank_transactions to authenticated;
create policy owner_read on public.bank_transactions for select to authenticated
using (owner_user_id = (select auth.uid()) and exists (
  select 1 from public.app_settings where owner_user_id = (select auth.uid())
));

alter table public.provider_object_mappings enable row level security;
revoke all on public.provider_object_mappings from public, anon, authenticated;
grant all on public.provider_object_mappings to service_role;
grant select on public.provider_object_mappings to authenticated;
create policy owner_read on public.provider_object_mappings for select to authenticated
using (owner_user_id = (select auth.uid()) and exists (
  select 1 from public.app_settings where owner_user_id = (select auth.uid())
));

alter table public.bank_account_staging enable row level security;
revoke all on public.bank_account_staging from public, anon, authenticated;
grant all on public.bank_account_staging to service_role;

alter table public.bank_transaction_staging enable row level security;
revoke all on public.bank_transaction_staging from public, anon, authenticated;
grant all on public.bank_transaction_staging to service_role;

alter table public.banking_sync_pages enable row level security;
revoke all on public.banking_sync_pages from public, anon, authenticated;
grant all on public.banking_sync_pages to service_role;

create index bank_transactions_account_date_idx on public.bank_transactions(owner_user_id, bank_account_id, transaction_date desc);
