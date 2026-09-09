create table public.app_settings (
  singleton_key boolean primary key default true check (singleton_key),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Europe/Paris' check (length(trim(timezone)) > 0),
  country text not null default 'FR' check (country ~ '^[A-Z]{2}$'),
  legal_form text,
  manual_current_balance_cents bigint not null default 0,
  manual_balance_as_of date not null default current_date,
  safety_cash_threshold_cents bigint not null default 0
    check (safety_cash_threshold_cents >= 0),
  default_forecast_horizon_days integer not null default 90
    check (default_forecast_horizon_days between 1 and 366),
  default_scenario text not null default 'certain'
    check (default_scenario in ('certain', 'committed', 'probable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  email text,
  payment_terms_days integer not null default 30
    check (payment_terms_days between 0 and 365),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, id)
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  status text not null default 'lead'
    check (status in ('lead', 'qualified', 'proposal', 'won', 'lost')),
  estimated_amount_ht_cents bigint not null
    check (estimated_amount_ht_cents >= 0),
  probability_basis_points integer not null default 0
    check (probability_basis_points between 0 and 10000),
  expected_close_date date,
  expected_start_date date,
  expected_end_date date,
  notes text,
  converted_engagement_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunities_expected_dates_check check (
    expected_start_date is null
    or expected_end_date is null
    or expected_end_date >= expected_start_date
  ),
  constraint opportunities_owner_customer_fk
    foreign key (owner_user_id, customer_id)
    references public.customers (owner_user_id, id)
    on delete restrict,
  unique (owner_user_id, id)
);

create table public.engagements (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null,
  opportunity_id uuid unique,
  reference text not null check (length(trim(reference)) > 0),
  signed_at date not null,
  start_date date,
  end_date date,
  amount_ht_cents bigint not null check (amount_ht_cents >= 0),
  amount_ttc_cents bigint not null check (amount_ttc_cents >= amount_ht_cents),
  status text not null default 'active'
    check (status in ('draft', 'active', 'completed', 'cancelled')),
  payment_terms_days integer not null default 30
    check (payment_terms_days between 0 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engagements_dates_check check (
    start_date is null or end_date is null or end_date >= start_date
  ),
  constraint engagements_owner_customer_fk
    foreign key (owner_user_id, customer_id)
    references public.customers (owner_user_id, id)
    on delete restrict,
  constraint engagements_owner_opportunity_fk
    foreign key (owner_user_id, opportunity_id)
    references public.opportunities (owner_user_id, id)
    on delete set null (opportunity_id),
  unique (owner_user_id, id)
);

alter table public.opportunities
  add constraint opportunities_converted_engagement_fk
  foreign key (owner_user_id, converted_engagement_id)
  references public.engagements (owner_user_id, id)
  on delete set null (converted_engagement_id);

create table public.billing_schedule_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  engagement_id uuid not null,
  label text not null check (length(trim(label)) > 0),
  planned_invoice_date date not null,
  amount_ht_cents bigint not null check (amount_ht_cents >= 0),
  vat_cents bigint not null default 0 check (vat_cents >= 0),
  amount_ttc_cents bigint not null
    check (amount_ttc_cents = amount_ht_cents + vat_cents),
  payment_terms_days integer not null default 30
    check (payment_terms_days between 0 and 365),
  expected_payment_date date not null,
  status text not null default 'planned'
    check (status in ('planned', 'invoiced', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_schedule_items_owner_engagement_fk
    foreign key (owner_user_id, engagement_id)
    references public.engagements (owner_user_id, id)
    on delete cascade,
  unique (owner_user_id, id)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null,
  billing_schedule_item_id uuid,
  provider text not null default 'manual'
    check (provider in ('manual', 'csv')),
  external_id text,
  invoice_number text not null check (length(trim(invoice_number)) > 0),
  issued_at date not null,
  due_at date not null,
  expected_payment_date date not null,
  amount_ht_cents bigint not null check (amount_ht_cents >= 0),
  vat_cents bigint not null default 0 check (vat_cents >= 0),
  amount_ttc_cents bigint not null
    check (amount_ttc_cents = amount_ht_cents + vat_cents),
  paid_amount_cents bigint not null default 0
    check (paid_amount_cents between 0 and amount_ttc_cents),
  status text not null
    check (status in ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled')),
  paid_at date,
  raw_payload_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_due_date_check check (due_at >= issued_at),
  constraint invoices_owner_customer_fk
    foreign key (owner_user_id, customer_id)
    references public.customers (owner_user_id, id)
    on delete restrict,
  constraint invoices_owner_billing_schedule_item_fk
    foreign key (owner_user_id, billing_schedule_item_id)
    references public.billing_schedule_items (owner_user_id, id)
    on delete set null (billing_schedule_item_id),
  unique (owner_user_id, id),
  unique (owner_user_id, invoice_number)
);

create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  paid_at date not null,
  match_type text not null default 'manual'
    check (match_type in ('manual', 'exact', 'suggested')),
  match_confidence_basis_points integer not null default 10000
    check (match_confidence_basis_points between 0 and 10000),
  created_at timestamptz not null default now(),
  constraint invoice_payments_owner_invoice_fk
    foreign key (owner_user_id, invoice_id)
    references public.invoices (owner_user_id, id)
    on delete cascade
);

create table public.cashflow_categories (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  type text not null check (type in ('inflow', 'outflow', 'both')),
  system_category boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_user_id, id),
  unique (owner_user_id, name)
);

create table public.recurring_cashflows (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('inflow', 'outflow')),
  cashflow_kind text not null
    check (cashflow_kind in ('income', 'expense', 'remuneration', 'reserve')),
  label text not null check (length(trim(label)) > 0),
  category_id uuid,
  amount_cents bigint not null check (amount_cents > 0),
  frequency text not null check (frequency in ('monthly', 'quarterly', 'yearly')),
  day_of_month integer not null check (day_of_month between 1 and 31),
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  certainty text not null default 'certain'
    check (certainty in ('certain', 'committed', 'probable')),
  probability_basis_points integer not null default 10000
    check (probability_basis_points between 0 and 10000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_cashflows_owner_category_fk
    foreign key (owner_user_id, category_id)
    references public.cashflow_categories (owner_user_id, id)
    on delete set null (category_id)
);

create table public.planned_cashflows (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('inflow', 'outflow')),
  cashflow_kind text not null
    check (cashflow_kind in ('income', 'expense', 'remuneration', 'reserve')),
  label text not null check (length(trim(label)) > 0),
  amount_cents bigint not null check (amount_cents > 0),
  planned_date date not null,
  category_id uuid,
  certainty text not null default 'certain'
    check (certainty in ('certain', 'committed', 'probable')),
  probability_basis_points integer not null default 10000
    check (probability_basis_points between 0 and 10000),
  status text not null default 'planned'
    check (status in ('planned', 'realized', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_cashflows_owner_category_fk
    foreign key (owner_user_id, category_id)
    references public.cashflow_categories (owner_user_id, id)
    on delete set null (category_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

create trigger opportunities_set_updated_at
before update on public.opportunities
for each row execute function public.set_updated_at();

create trigger engagements_set_updated_at
before update on public.engagements
for each row execute function public.set_updated_at();

create trigger billing_schedule_items_set_updated_at
before update on public.billing_schedule_items
for each row execute function public.set_updated_at();

create trigger invoices_set_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

create trigger recurring_cashflows_set_updated_at
before update on public.recurring_cashflows
for each row execute function public.set_updated_at();

create trigger planned_cashflows_set_updated_at
before update on public.planned_cashflows
for each row execute function public.set_updated_at();

create index customers_owner_name_idx
  on public.customers (owner_user_id, name);
create index opportunities_owner_status_close_idx
  on public.opportunities (owner_user_id, status, expected_close_date);
create index engagements_owner_status_start_idx
  on public.engagements (owner_user_id, status, start_date);
create index billing_schedule_items_owner_invoice_date_idx
  on public.billing_schedule_items (owner_user_id, planned_invoice_date, status);
create index invoices_owner_payment_date_idx
  on public.invoices (owner_user_id, expected_payment_date, status);
create unique index invoices_owner_provider_external_id_uidx
  on public.invoices (owner_user_id, provider, external_id)
  where external_id is not null;
create index invoice_payments_owner_paid_at_idx
  on public.invoice_payments (owner_user_id, paid_at);
create index cashflow_categories_owner_type_idx
  on public.cashflow_categories (owner_user_id, type);
create index recurring_cashflows_owner_active_start_idx
  on public.recurring_cashflows (owner_user_id, active, start_date);
create index planned_cashflows_owner_date_status_idx
  on public.planned_cashflows (owner_user_id, planned_date, status);

alter table public.app_settings enable row level security;
alter table public.customers enable row level security;
alter table public.opportunities enable row level security;
alter table public.engagements enable row level security;
alter table public.billing_schedule_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.cashflow_categories enable row level security;
alter table public.recurring_cashflows enable row level security;
alter table public.planned_cashflows enable row level security;

create policy owner_access on public.app_settings
for all to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy owner_access on public.customers
for all to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy owner_access on public.opportunities
for all to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy owner_access on public.engagements
for all to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy owner_access on public.billing_schedule_items
for all to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy owner_access on public.invoices
for all to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy owner_access on public.invoice_payments
for all to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy owner_access on public.cashflow_categories
for all to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy owner_access on public.recurring_cashflows
for all to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy owner_access on public.planned_cashflows
for all to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);
