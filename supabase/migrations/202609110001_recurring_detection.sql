create extension if not exists pgcrypto with schema extensions;

-- Decisions are independent of recalculated estimates; banking remains the source of truth.
create table public.recurring_detection_runs (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null,
  lease_run_id uuid,
  lease_expires_at timestamptz,
  analyzed_publication timestamptz check (isfinite(analyzed_publication)),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error_code text check (last_error_code in ('DETECTION_LOCKED','DETECTION_STALE','DETECTION_INVALID','DETECTION_DUPLICATE','DETECTION_NOT_FOUND','DETECTION_SOURCE_UNAVAILABLE')),
  primary key (owner_user_id, integration_id),
  foreign key (owner_user_id,integration_id) references public.integrations(owner_user_id,id) on delete cascade,
  check ((lease_run_id is null) = (lease_expires_at is null))
);

alter table public.recurring_cashflows add constraint recurring_cashflows_owner_id_unique unique (owner_user_id,id);
create table public.recurring_suggestions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null,
  bank_account_id uuid not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  normalized_label text not null check (length(trim(normalized_label))>0),
  -- Hash bounds the btree key; publication rejects an unequal-label collision.
  normalized_label_hash bytea generated always as (extensions.digest(normalized_label,'sha256')) stored,
  frequency text not null default 'monthly' check (frequency='monthly'),
  state text not null default 'pending' check (state in ('pending','confirmed','dismissed')),
  eligible boolean not null default true,
  label text not null check (length(trim(label)) between 1 and 160),
  amount_cents bigint not null check (amount_cents between 1 and 9007199254740991),
  day_of_month integer not null check (day_of_month between 1 and 31),
  last_payment_date date not null check (isfinite(last_payment_date)),
  next_date date not null check (isfinite(next_date) and date_trunc('month',next_date)>date_trunc('month',last_payment_date)),
  source_publication timestamptz not null check (isfinite(source_publication)),
  rules_version integer not null default 1 check (rules_version=1),
  recurring_cashflow_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id,integration_id,id),
  unique (owner_user_id,integration_id,bank_account_id,currency,normalized_label_hash,frequency),
  foreign key (owner_user_id,integration_id,bank_account_id) references public.bank_accounts(owner_user_id,integration_id,id) on delete cascade,
  foreign key (owner_user_id,recurring_cashflow_id) references public.recurring_cashflows(owner_user_id,id),
  check ((state='confirmed') = (recurring_cashflow_id is not null))
);
create unique index recurring_suggestions_link_unique on public.recurring_suggestions(recurring_cashflow_id) where recurring_cashflow_id is not null;
create index recurring_suggestions_owner_state_idx on public.recurring_suggestions(owner_user_id,state,eligible);
create trigger recurring_suggestions_set_updated_at before update on public.recurring_suggestions for each row execute function public.set_updated_at();

create table public.recurring_suggestion_evidence (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null,
  suggestion_id uuid not null,
  transaction_id uuid not null,
  primary key (suggestion_id,transaction_id),
  foreign key (owner_user_id,integration_id,suggestion_id) references public.recurring_suggestions(owner_user_id,integration_id,id) on delete cascade,
  foreign key (owner_user_id,integration_id,transaction_id) references public.bank_transactions(owner_user_id,integration_id,id) on delete cascade
);

alter table public.recurring_detection_runs enable row level security;
alter table public.recurring_suggestions enable row level security;
alter table public.recurring_suggestion_evidence enable row level security;
revoke all on public.recurring_detection_runs,public.recurring_suggestions,public.recurring_suggestion_evidence from public,anon,authenticated,service_role;
grant select on public.recurring_detection_runs,public.recurring_suggestions,public.recurring_suggestion_evidence to authenticated,service_role;
create policy owner_read on public.recurring_detection_runs for select to authenticated using (
  owner_user_id=(select auth.uid()) and exists(select 1 from public.app_settings where owner_user_id=(select auth.uid())));
create policy owner_read on public.recurring_suggestions for select to authenticated using (
  owner_user_id=(select auth.uid()) and exists(select 1 from public.app_settings where owner_user_id=(select auth.uid())));
create policy owner_read on public.recurring_suggestion_evidence for select to authenticated using (
  owner_user_id=(select auth.uid()) and exists(select 1 from public.app_settings where owner_user_id=(select auth.uid())));
