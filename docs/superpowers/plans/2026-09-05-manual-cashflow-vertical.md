# Manual Cashflow Vertical Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a locally runnable, tested Freelance Cashflow application covering the complete manual/CSV journey from customer and opportunity through payment, forecast, and dashboard.

**Architecture:** A pnpm TypeScript monorepo contains a Next.js 16 App Router web application, pure domain packages, shared validation primitives, and Supabase migrations. Server Components and Server Actions read and mutate owner-scoped data; all forecasting stays in a pure package and the browser receives only normalized view models.

**Tech Stack:** Node.js 24, pnpm 10, TypeScript, Next.js 16, React, Tailwind CSS, Supabase PostgreSQL/Auth/RLS, Zod, Vitest, Testing Library, Recharts, Playwright, pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-05-freelance-cashflow-mvp-design.md`

## Global Constraints

- The project is open source and self-hosted, but remains unpublished until the owner chooses a license and reviews the Git history.
- One installation has one functional owner; do not add organizations, teams, workspaces, SaaS roles, or multi-tenant abstractions.
- Supabase PostgreSQL is the source of truth and every financial table uses `owner_user_id` plus RLS.
- Store money as integer cents in TypeScript and `BIGINT` in PostgreSQL; never calculate money with decimal floating-point values.
- Store business dates as `DATE`/ISO `YYYY-MM-DD` and technical instants as `TIMESTAMPTZ`.
- The forecast engine must remain independent from React, Next.js, Supabase, and external providers.
- No secret may appear in Git, browser bundles, logs, fixtures, screenshots, or error messages.
- The user interface follows `dashboard-5a.png` and `logo.jpeg`: light background, restrained cards, petrol green accents, coral alerts, tabular financial figures, desktop sidebar, compact mobile navigation.
- Use Zod at every form, CSV, environment, and provider boundary; avoid TypeScript `any`.
- Write the failing test before each behavior, verify the failure, implement the minimum, then run the focused and full relevant suites.
- This plan implements Design Jalon 1 only. Qonto synchronization is Plan 2; cloud deployment, worker scheduling, backup/restore, and final open-source hardening are Plan 3.

---

## File Map

### Repository and app shell

- `package.json` — workspace scripts and pinned package manager.
- `pnpm-workspace.yaml` — workspace package discovery.
- `tsconfig.base.json` — strict shared compiler settings.
- `apps/web/src/app/*` — App Router pages and layouts.
- `apps/web/src/components/app-shell.tsx` — responsive navigation shell.
- `apps/web/src/app/globals.css` — product tokens and reference styling.

### Shared and domain packages

- `packages/shared/src/money.ts` — safe cents parsing, construction, arithmetic, and display.
- `packages/shared/src/local-date.ts` — validated business dates and date iteration.
- `packages/shared/src/env.ts` — server/public environment parsing.
- `packages/domain/src/cashflow-event.ts` — normalized forecast event contract.
- `packages/domain/src/forecast.ts` — scenario filtering and daily projection.
- `packages/domain/src/commercial.ts` — opportunity conversion rules.
- `packages/domain/src/invoices.ts` — invoice status and payment rules.
- `packages/domain/src/recurrence.ts` — recurring cashflow expansion.
- `packages/domain/src/event-builder.ts` — source records to forecast events.

### Data and application features

- `supabase/migrations/202609050001_core.sql` — Jalon 1 schema, constraints, indexes, and RLS.
- `supabase/tests/database/core_schema.test.sql` — schema and constraint tests.
- `supabase/tests/database/core_rls.test.sql` — owner-isolation tests.
- `apps/web/src/lib/supabase/*` — browser, server, and admin clients.
- `apps/web/src/features/*` — feature-local schemas, repositories, actions, and components.
- `apps/web/src/app/(app)/*` — authenticated product routes.
- `apps/web/src/app/(auth)/*` — login and owner creation routes.

### Verification

- `apps/web/e2e/manual-cashflow.spec.ts` — complete Playwright journey.
- `.github/workflows/ci.yml` — lint, typecheck, unit tests, build, database tests, and secret scanning.
- `README.md` — local installation and Jalon 1 capabilities.

---

### Task 1: Bootstrap the monorepo and branded application shell

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/test/setup.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/components/app-shell.tsx`
- Create: `apps/web/src/components/app-shell.test.tsx`
- Copy: `logo.jpeg` to `apps/web/public/logo.jpeg`
- Copy: `dashboard-5a.png` to `docs/assets/dashboard-reference.png`

**Interfaces:**
- Consumes: the validated product name and visual references.
- Produces: `AppShell({ children }: { children: React.ReactNode })`, root scripts `dev`, `build`, `lint`, `typecheck`, and `test`.

- [ ] **Step 1: Create workspace manifests and install the exact dependency set**

Use `packageManager: "pnpm@10.17.1"`, workspaces `apps/*` and `packages/*`, and root scripts that recurse through packages. `apps/web` must include `next`, `react`, `react-dom`, `zod`, `recharts`, `lucide-react`, `@supabase/ssr`, and `@supabase/supabase-js`; development dependencies must include TypeScript, ESLint, Vitest, jsdom, Testing Library, and Playwright.

```json
{
  "name": "freelance-cashflow",
  "private": true,
  "packageManager": "pnpm@10.17.1",
  "scripts": {
    "dev": "pnpm --filter @fc/web dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:run": "pnpm -r test:run"
  }
}
```

Run: `corepack pnpm install`

Expected: a committed `pnpm-lock.yaml` and no install errors.

- [ ] **Step 2: Write the failing shell test**

```tsx
import { render, screen } from "@testing-library/react";
import { AppShell } from "./app-shell";

it("renders the Freelance Cashflow navigation", () => {
  render(<AppShell><main>Contenu</main></AppShell>);
  expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
  expect(screen.getByRole("link", { name: "Opportunités" })).toBeInTheDocument();
  expect(screen.getByText("Freelance Cashflow")).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the focused test and verify the expected failure**

Run: `corepack pnpm --filter @fc/web test:run src/components/app-shell.test.tsx`

Expected: FAIL because `./app-shell` does not exist.

- [ ] **Step 4: Implement the shell and visual foundation**

`AppShell` must render the monogram image, product name, eight validated navigation links, a synchronization status slot, a desktop sidebar, and a mobile header. Use CSS variables named `--fc-petrol`, `--fc-coral`, `--fc-ink`, `--fc-muted`, `--fc-surface`, and `--fc-border`; keep numbers tabular with `font-variant-numeric: tabular-nums`.

```tsx
const navigation = [
  ["Dashboard", "/dashboard"],
  ["Opportunités", "/opportunities"],
  ["Commandes", "/engagements"],
  ["Facturation", "/invoices"],
  ["Trésorerie", "/cashflow"],
  ["Charges", "/expenses"],
  ["Intégrations", "/integrations"],
  ["Paramètres", "/settings"],
] as const;
```

The initial `/` page redirects to `/dashboard`; routes not implemented until later tasks render an explicit `Fonctionnalité en cours de construction` empty state and no fake financial values.

- [ ] **Step 5: Verify shell quality**

Run: `corepack pnpm --filter @fc/web test:run src/components/app-shell.test.tsx`

Expected: PASS.

Run: `corepack pnpm --filter @fc/web typecheck`

Expected: PASS with strict TypeScript.

Run: `corepack pnpm --filter @fc/web build`

Expected: PASS and all declared routes compile.

- [ ] **Step 6: Commit the foundation**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json .gitignore .env.example apps/web docs/assets/dashboard-reference.png
git commit -m "feat: bootstrap Freelance Cashflow web app"
```

---

### Task 2: Implement safe money, dates, events, and the forecast engine

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/money.ts`
- Create: `packages/shared/src/money.test.ts`
- Create: `packages/shared/src/local-date.ts`
- Create: `packages/shared/src/local-date.test.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/src/cashflow-event.ts`
- Create: `packages/domain/src/forecast.ts`
- Create: `packages/domain/src/forecast.test.ts`
- Create: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: no application or database code.
- Produces: `MoneyCents`, `moneyCents`, `parseAmountToCents`, `formatMoney`, `LocalDate`, `localDate`, `CashflowEvent`, `ForecastScenario`, `ForecastInput`, `ForecastResult`, and `calculateForecast`.

- [ ] **Step 1: Write failing money and date tests**

```ts
expect(parseAmountToCents("1 234,56")).toBe(123456);
expect(parseAmountToCents("-19.90")).toBe(-1990);
expect(() => moneyCents(10.5)).toThrow("integer cents");
expect(localDate("2026-02-29")).toThrow("valid ISO date");
expect(localDate("2028-02-29")).toBe("2028-02-29");
```

- [ ] **Step 2: Run primitive tests and verify failure**

Run: `corepack pnpm --filter @fc/shared test:run`

Expected: FAIL because the money and date modules do not exist.

- [ ] **Step 3: Implement branded primitives**

```ts
declare const moneyBrand: unique symbol;
export type MoneyCents = number & { readonly [moneyBrand]: true };

export function moneyCents(value: number): MoneyCents {
  if (!Number.isSafeInteger(value)) throw new Error("Money must be safe integer cents");
  return value as MoneyCents;
}

export function parseAmountToCents(input: string): MoneyCents {
  const normalized = input.trim().replaceAll(/\s/g, "").replace(",", ".");
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new Error("Amount must contain at most two decimals");
  const sign = match[1] === "-" ? -1 : 1;
  return moneyCents(sign * (Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"))));
}
```

Implement `LocalDate` validation by round-tripping year, month, and day through a UTC `Date`, never by accepting JavaScript's rollover behavior.

- [ ] **Step 4: Write failing forecast tests**

```ts
const result = calculateForecast({
  startBalanceCents: moneyCents(4_000_000),
  startDate: localDate("2026-09-05"),
  endDate: localDate("2026-09-08"),
  safetyThresholdCents: moneyCents(2_000_000),
  scenario: "probable",
  events: [
    { id: "invoice-1", direction: "inflow", sourceType: "invoice", sourceId: "1", label: "Facture", amountCents: moneyCents(1_000_000), plannedDate: localDate("2026-09-06"), certainty: "certain", probabilityBasisPoints: 10_000, isActual: false },
    { id: "opportunity-1", direction: "inflow", sourceType: "opportunity", sourceId: "2", label: "Projet", amountCents: moneyCents(2_000_000), plannedDate: localDate("2026-09-07"), certainty: "probable", probabilityBasisPoints: 4_000, isActual: false },
    { id: "tax-1", direction: "outflow", sourceType: "reserve", sourceId: "3", label: "TVA", amountCents: moneyCents(3_000_000), plannedDate: localDate("2026-09-08"), certainty: "certain", probabilityBasisPoints: 10_000, isActual: false },
  ],
});

expect(result.points.at(-1)?.balanceCents).toBe(2_800_000);
expect(result.lowestBalanceCents).toBe(2_800_000);
expect(result.runwayDays).toBeNull();
```

Add cases proving that `certain` excludes committed/probable events, `committed` includes certain and committed at full value, `probable` weights probable events by basis points, outflows subtract, and `runwayDays` is the first zero-based day whose closing balance is strictly below the safety threshold.

- [ ] **Step 5: Run forecast tests and verify failure**

Run: `corepack pnpm --filter @fc/domain test:run src/forecast.test.ts`

Expected: FAIL because `calculateForecast` does not exist.

- [ ] **Step 6: Implement deterministic projection**

```ts
export type ForecastScenario = "certain" | "committed" | "probable";

export type CashflowEvent = {
  id: string;
  direction: "inflow" | "outflow";
  sourceType: "invoice" | "billing_schedule" | "opportunity" | "recurring_cashflow" | "planned_cashflow" | "remuneration" | "reserve";
  sourceId: string;
  label: string;
  amountCents: MoneyCents;
  plannedDate: LocalDate;
  certainty: ForecastScenario;
  probabilityBasisPoints: number;
  isActual: boolean;
};
```

Group events by `plannedDate`, create one closing point for every date in the inclusive interval, apply signed event values, and derive minimum balance and runway from the same point array. Reject inverted ranges and basis points outside `0..10000`.

- [ ] **Step 7: Run domain verification and commit**

Run: `corepack pnpm --filter @fc/shared test:run`

Expected: PASS.

Run: `corepack pnpm --filter @fc/domain test:run`

Expected: PASS.

Run: `corepack pnpm --filter @fc/domain typecheck`

Expected: PASS.

```bash
git add packages/shared packages/domain pnpm-lock.yaml
git commit -m "feat: add deterministic forecast engine"
```

---

### Task 3: Create the core Supabase schema and owner-isolation policies

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202609050001_core.sql`
- Create: `supabase/tests/database/core_schema.test.sql`
- Create: `supabase/tests/database/core_rls.test.sql`
- Create: `supabase/seed.sql`

**Interfaces:**
- Consumes: cents/date contracts from Task 2.
- Produces: owner-scoped core tables used by Tasks 4–8, plus the singleton `app_settings` ownership rule.

- [ ] **Step 1: Initialize local Supabase configuration**

Run: `corepack pnpm dlx supabase init`

Expected: `supabase/config.toml` exists; generated `.temp` content stays ignored.

- [ ] **Step 2: Write failing pgTAP schema tests**

Create assertions for these exact public tables: `app_settings`, `customers`, `opportunities`, `engagements`, `billing_schedule_items`, `invoices`, `invoice_payments`, `recurring_cashflows`, `planned_cashflows`, and `cashflow_categories`.

```sql
begin;
select plan(13);
select has_table('public', 'app_settings');
select has_table('public', 'customers');
select has_table('public', 'opportunities');
select has_table('public', 'engagements');
select has_table('public', 'billing_schedule_items');
select has_table('public', 'invoices');
select has_table('public', 'invoice_payments');
select has_table('public', 'recurring_cashflows');
select has_table('public', 'planned_cashflows');
select has_table('public', 'cashflow_categories');
select col_type_is('public', 'invoices', 'amount_ttc_cents', 'bigint');
select col_type_is('public', 'billing_schedule_items', 'planned_invoice_date', 'date');
select is((select relrowsecurity from pg_class where oid = 'public.invoices'::regclass), true, 'invoices has RLS');
select * from finish();
rollback;
```

- [ ] **Step 3: Start Supabase and verify tests fail**

Run: `corepack pnpm dlx supabase start`

Expected: local services start in Docker.

Run: `corepack pnpm dlx supabase test db`

Expected: FAIL because the migration does not exist.

- [ ] **Step 4: Implement the migration**

The migration must create UUID primary keys, `owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `created_at/updated_at TIMESTAMPTZ`, cents `BIGINT` checks, status checks, useful indexes, and the following relationships:

```sql
create table public.app_settings (
  singleton_key boolean primary key default true check (singleton_key),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Europe/Paris',
  country text not null default 'FR',
  legal_form text,
  manual_current_balance_cents bigint not null default 0,
  manual_balance_as_of date not null default current_date,
  safety_cash_threshold_cents bigint not null default 0 check (safety_cash_threshold_cents >= 0),
  default_forecast_horizon_days integer not null default 90 check (default_forecast_horizon_days between 1 and 366),
  default_scenario text not null default 'certain' check (default_scenario in ('certain','committed','probable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  email text,
  payment_terms_days integer not null default 30 check (payment_terms_days between 0 and 365),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  name text not null,
  status text not null default 'lead' check (status in ('lead','qualified','proposal','won','lost')),
  estimated_amount_ht_cents bigint not null check (estimated_amount_ht_cents >= 0),
  probability_basis_points integer not null default 0 check (probability_basis_points between 0 and 10000),
  expected_close_date date,
  expected_start_date date,
  expected_end_date date,
  notes text,
  converted_engagement_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.engagements (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  opportunity_id uuid unique references public.opportunities(id) on delete set null,
  reference text not null,
  signed_at date not null,
  start_date date,
  end_date date,
  amount_ht_cents bigint not null check (amount_ht_cents >= 0),
  amount_ttc_cents bigint not null check (amount_ttc_cents >= amount_ht_cents),
  status text not null default 'active' check (status in ('draft','active','completed','cancelled')),
  payment_terms_days integer not null default 30 check (payment_terms_days between 0 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.opportunities add constraint opportunities_converted_engagement_fk
  foreign key (converted_engagement_id) references public.engagements(id) on delete set null;

create table public.billing_schedule_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  label text not null,
  planned_invoice_date date not null,
  amount_ht_cents bigint not null check (amount_ht_cents >= 0),
  vat_cents bigint not null default 0 check (vat_cents >= 0),
  amount_ttc_cents bigint not null check (amount_ttc_cents = amount_ht_cents + vat_cents),
  payment_terms_days integer not null default 30 check (payment_terms_days between 0 and 365),
  expected_payment_date date not null,
  status text not null default 'planned' check (status in ('planned','invoiced','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  billing_schedule_item_id uuid references public.billing_schedule_items(id) on delete set null,
  provider text not null default 'manual' check (provider in ('manual','csv')),
  external_id text,
  invoice_number text not null,
  issued_at date not null,
  due_at date not null,
  expected_payment_date date not null,
  amount_ht_cents bigint not null check (amount_ht_cents >= 0),
  vat_cents bigint not null default 0 check (vat_cents >= 0),
  amount_ttc_cents bigint not null check (amount_ttc_cents = amount_ht_cents + vat_cents),
  paid_amount_cents bigint not null default 0 check (paid_amount_cents between 0 and amount_ttc_cents),
  status text not null check (status in ('draft','issued','partially_paid','paid','overdue','cancelled')),
  paid_at date,
  raw_payload_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, invoice_number),
  unique nulls not distinct (owner_user_id, provider, external_id)
);

create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  paid_at date not null,
  match_type text not null default 'manual' check (match_type in ('manual','exact','suggested')),
  match_confidence_basis_points integer not null default 10000 check (match_confidence_basis_points between 0 and 10000),
  created_at timestamptz not null default now()
);

create table public.cashflow_categories (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  type text not null check (type in ('inflow','outflow','both')),
  system_category boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_user_id, name)
);

create table public.recurring_cashflows (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('inflow','outflow')),
  cashflow_kind text not null check (cashflow_kind in ('income','expense','remuneration','reserve')),
  label text not null check (length(trim(label)) > 0),
  category_id uuid references public.cashflow_categories(id) on delete set null,
  amount_cents bigint not null check (amount_cents > 0),
  frequency text not null check (frequency in ('monthly','quarterly','yearly')),
  day_of_month integer not null check (day_of_month between 1 and 31),
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  certainty text not null default 'certain' check (certainty in ('certain','committed','probable')),
  probability_basis_points integer not null default 10000 check (probability_basis_points between 0 and 10000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.planned_cashflows (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('inflow','outflow')),
  cashflow_kind text not null check (cashflow_kind in ('income','expense','remuneration','reserve')),
  label text not null check (length(trim(label)) > 0),
  amount_cents bigint not null check (amount_cents > 0),
  planned_date date not null,
  category_id uuid references public.cashflow_categories(id) on delete set null,
  certainty text not null default 'certain' check (certainty in ('certain','committed','probable')),
  probability_basis_points integer not null default 10000 check (probability_basis_points between 0 and 10000),
  status text not null default 'planned' check (status in ('planned','realized','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Add updated-at triggers and owner/date indexes used by list and forecast queries. Keep `seed.sql` free of authenticated users and owner-scoped records; the onboarding transaction creates the generic categories `Clients`, `Logiciels`, `Rémunération`, and `Fiscal et social` for the new owner.

Enable RLS on every table. For authenticated operations create one policy per table with both clauses:

```sql
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id)
```

- [ ] **Step 5: Write and run owner-isolation tests**

Create two `auth.users`, insert owner-one data under owner one, set `request.jwt.claim.sub` to owner two, and assert owner two sees zero rows and cannot update owner one's row. Assert a second `app_settings` insert fails because `singleton_key` is unique.

Run: `corepack pnpm dlx supabase db reset --local`

Expected: all migrations and seed data apply cleanly.

Run: `corepack pnpm dlx supabase test db`

Expected: PASS for schema and RLS suites.

- [ ] **Step 6: Commit database foundation**

```bash
git add supabase .gitignore
git commit -m "feat: add owner-scoped cashflow schema"
```

---

### Task 4: Add Supabase SSR authentication and singleton onboarding

**Files:**
- Create: `apps/web/src/lib/env/server.ts`
- Create: `apps/web/src/lib/env/public.ts`
- Create: `apps/web/src/lib/supabase/server.ts`
- Create: `apps/web/src/lib/supabase/browser.ts`
- Create: `apps/web/src/lib/supabase/admin.ts`
- Create: `apps/web/src/lib/supabase/proxy.ts`
- Create: `apps/web/src/lib/auth/route-decision.ts`
- Create: `apps/web/src/lib/auth/route-decision.test.ts`
- Create: `apps/web/src/lib/auth/require-owner.ts`
- Create: `apps/web/src/proxy.ts`
- Create: `apps/web/src/app/(auth)/login/page.tsx`
- Create: `apps/web/src/app/(auth)/login/actions.ts`
- Create: `apps/web/src/app/onboarding/page.tsx`
- Create: `apps/web/src/app/onboarding/actions.ts`
- Create: `apps/web/src/app/(app)/layout.tsx`
- Modify: `.env.example`

**Interfaces:**
- Consumes: singleton `app_settings` from Task 3.
- Produces: `requireOwner(): Promise<{ userId: string }>`, authenticated route layout, first-owner setup, and refreshed Supabase cookies through Next.js 16 `proxy.ts`.

- [ ] **Step 1: Add environment contracts**

Server schema requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Only the two `NEXT_PUBLIC_*` values may be imported by browser modules.

```ts
const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});
```

`.env.example` lists all three with empty values and warnings that the service role key is server-only.

- [ ] **Step 2: Write failing route-decision tests**

```ts
expect(decideAppRoute({ hasSession: false, hasOwner: false })).toBe("/login");
expect(decideAppRoute({ hasSession: true, hasOwner: false })).toBe("/onboarding");
expect(decideAppRoute({ hasSession: true, hasOwner: true, isOwner: true })).toBe("/dashboard");
expect(decideAppRoute({ hasSession: true, hasOwner: true, isOwner: false })).toBe("/access-denied");
```

- [ ] **Step 3: Verify failure, implement clients and guards, then pass**

Run: `corepack pnpm --filter @fc/web test:run src/lib/auth/route-decision.test.ts`

Expected: FAIL because the module does not exist.

Use `@supabase/ssr` cookie adapters in `server.ts` and `proxy.ts`. Use the admin client only for the server-side singleton owner existence check. `requireOwner` must call `auth.getUser()`, compare the authenticated id with `app_settings.owner_user_id`, and redirect rather than returning financial data to a non-owner.

Run: `corepack pnpm --filter @fc/web test:run src/lib/auth/route-decision.test.ts`

Expected: PASS.

- [ ] **Step 4: Implement login and first-owner onboarding**

The login page offers email/password sign-in. When no owner exists, it also offers account creation. The onboarding action validates this exact input:

```ts
const onboardingSchema = z.object({
  currency: z.literal("EUR"),
  timezone: z.string().min(1),
  country: z.literal("FR"),
  legalForm: z.string().max(80).optional(),
  openingBalance: z.string().min(1),
  safetyThreshold: z.string().min(1),
});
```

It parses the opening balance and threshold to cents and inserts the singleton `app_settings` row with the authenticated user's id and current local business date. In the same server action, insert the four generic owner categories `Clients`, `Logiciels`, `Rémunération`, and `Fiscal et social`. A conflicting settings insert returns the message `Cette instance possède déjà un propriétaire.` and never replaces the owner.

- [ ] **Step 5: Verify authentication build and commit**

Run: `corepack pnpm --filter @fc/web test:run`

Expected: PASS.

Run: `corepack pnpm --filter @fc/web typecheck`

Expected: PASS.

Run: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key SUPABASE_SERVICE_ROLE_KEY=test-service-role-key corepack pnpm --filter @fc/web build`

Expected: PASS using test-safe environment values supplied only to the command environment.

```bash
git add apps/web/src/lib apps/web/src/proxy.ts apps/web/src/app .env.example pnpm-lock.yaml
git commit -m "feat: add owner authentication and onboarding"
```

---

### Task 5: Build customers, opportunities, conversion, and billing schedules

**Files:**
- Create: `packages/domain/src/commercial.ts`
- Create: `packages/domain/src/commercial.test.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `apps/web/src/features/customers/schema.ts`
- Create: `apps/web/src/features/customers/repository.ts`
- Create: `apps/web/src/features/customers/actions.ts`
- Create: `apps/web/src/features/opportunities/schema.ts`
- Create: `apps/web/src/features/opportunities/repository.ts`
- Create: `apps/web/src/features/opportunities/actions.ts`
- Create: `apps/web/src/features/opportunities/opportunity-form.tsx`
- Create: `apps/web/src/features/engagements/schema.ts`
- Create: `apps/web/src/features/engagements/repository.ts`
- Create: `apps/web/src/features/engagements/actions.ts`
- Create: `supabase/migrations/202609050002_convert_opportunity.sql`
- Create: `supabase/tests/database/convert_opportunity.test.sql`
- Create: `apps/web/src/app/(app)/opportunities/page.tsx`
- Create: `apps/web/src/app/(app)/engagements/page.tsx`
- Create: `apps/web/src/app/(app)/engagements/[id]/page.tsx`

**Interfaces:**
- Consumes: `requireOwner`, Supabase server client, money/date primitives, core tables.
- Produces: customer/opportunity CRUD, `convertOpportunity`, engagement list/detail, and billing schedule creation.

- [ ] **Step 1: Write failing conversion tests**

```ts
const conversion = convertOpportunity({
  opportunityId: "opp-1",
  customerId: "customer-1",
  name: "Audit SI",
  status: "proposal",
  amountHtCents: moneyCents(600_000),
  vatRateBasisPoints: 2_000,
  paymentTermsDays: 30,
  signedAt: localDate("2026-09-05"),
});

expect(conversion.engagement.amountTtcCents).toBe(720_000);
expect(conversion.nextOpportunityStatus).toBe("won");
expect(() => convertOpportunity({ ...input, status: "lost" })).toThrow("cannot be converted");
```

- [ ] **Step 2: Verify failure and implement conversion rules**

Run: `corepack pnpm --filter @fc/domain test:run src/commercial.test.ts`

Expected: FAIL because the module does not exist.

Implement VAT by integer basis-point multiplication with a documented half-up rounding rule. Conversion returns values for one transaction; it does not write to the database.

Run: `corepack pnpm --filter @fc/domain test:run src/commercial.test.ts`

Expected: PASS.

- [ ] **Step 3: Implement owner-scoped repositories and actions**

Every repository receives `ownerUserId` explicitly and includes `.eq("owner_user_id", ownerUserId)`. Server Actions call `requireOwner`, validate `FormData` with Zod, and use `revalidatePath` after success.

Conversion must execute through `public.convert_opportunity(p_opportunity_id uuid, p_reference text, p_signed_at date, p_amount_ttc_cents bigint, p_payment_terms_days integer) returns uuid`. The `SECURITY INVOKER` PL/pgSQL function selects the opportunity with `owner_user_id = auth.uid()` for update, rejects `lost`, `won`, or already-converted rows, inserts the engagement, updates `opportunities.status/converted_engagement_id`, and returns the new engagement id atomically. The pgTAP test calls the function twice and proves the second call fails without creating a second engagement.

- [ ] **Step 4: Implement the commercial UI**

The opportunities page displays status, customer, amount, probability, expected close date, and an action to convert eligible opportunities. The engagement detail page shows contract values and allows multiple billing schedule items whose TTC sum may not exceed the engagement TTC amount.

Use empty states and inline validation; do not display mock records.

- [ ] **Step 5: Verify and commit**

Run: `corepack pnpm --filter @fc/domain test:run`

Expected: PASS.

Run: `corepack pnpm --filter @fc/web test:run`

Expected: PASS, including component tests for validation and conversion controls.

Run: `corepack pnpm --filter @fc/web typecheck`

Expected: PASS.

```bash
git add packages/domain apps/web/src/features apps/web/src/app supabase/migrations
git commit -m "feat: add commercial cashflow journey"
```

---

### Task 6: Add invoices, CSV import, and manual payments

**Files:**
- Create: `packages/domain/src/invoices.ts`
- Create: `packages/domain/src/invoices.test.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `packages/integrations/package.json`
- Create: `packages/integrations/tsconfig.json`
- Create: `packages/integrations/src/csv/invoices.ts`
- Create: `packages/integrations/src/csv/invoices.test.ts`
- Create: `packages/integrations/src/index.ts`
- Create: `apps/web/src/features/invoices/schema.ts`
- Create: `apps/web/src/features/invoices/repository.ts`
- Create: `apps/web/src/features/invoices/actions.ts`
- Create: `apps/web/src/features/invoices/invoice-form.tsx`
- Create: `apps/web/src/features/invoices/csv-import-form.tsx`
- Create: `apps/web/src/features/invoices/payment-form.tsx`
- Create: `supabase/migrations/202609050003_record_payment.sql`
- Create: `supabase/tests/database/record_payment.test.sql`
- Create: `apps/web/src/app/(app)/invoices/page.tsx`
- Create: `apps/web/src/app/(app)/invoices/[id]/page.tsx`

**Interfaces:**
- Consumes: customers, billing schedule items, cents/date primitives, owner guard.
- Produces: `deriveInvoiceStatus`, `applyPayment`, `parseInvoiceCsv`, manual invoice/payment actions, and idempotent CSV imports.

- [ ] **Step 1: Write failing invoice-state tests**

```ts
expect(deriveInvoiceStatus({ cancelled: false, amountTtcCents: 100_000, paidAmountCents: 0, dueAt: localDate("2026-09-01"), today: localDate("2026-09-05") })).toBe("overdue");
expect(deriveInvoiceStatus({ cancelled: false, amountTtcCents: 100_000, paidAmountCents: 20_000, dueAt: localDate("2026-10-01"), today: localDate("2026-09-05") })).toBe("partially_paid");
expect(applyPayment(moneyCents(100_000), moneyCents(75_000), moneyCents(25_001))).toThrow("exceeds invoice balance");
```

- [ ] **Step 2: Verify failure, implement, and pass**

Run: `corepack pnpm --filter @fc/domain test:run src/invoices.test.ts`

Expected: FAIL because the module does not exist.

`deriveInvoiceStatus` gives cancellation and full payment precedence, then partial payment, then overdue, then issued. `applyPayment` rejects zero, negative, or overpayments.

Run: `corepack pnpm --filter @fc/domain test:run src/invoices.test.ts`

Expected: PASS.

- [ ] **Step 3: Write failing CSV tests**

The supported UTF-8 CSV columns are exactly:

```text
invoice_number;customer_name;issued_at;due_at;amount_ht;vat;amount_ttc
```

```ts
const rows = parseInvoiceCsv("invoice_number;customer_name;issued_at;due_at;amount_ht;vat;amount_ttc\nF-001;Atelier Bleu;2026-09-01;2026-09-30;1000,00;200,00;1200,00");
expect(rows[0]?.amountTtcCents).toBe(120_000);
expect(() => parseInvoiceCsv(csvWithMismatchedTotal)).toThrow("amount_ttc must equal amount_ht + vat");
```

- [ ] **Step 4: Implement CSV parsing and idempotent import**

Parse by header name, normalize BOM/CRLF, validate every row with Zod, and return row-numbered errors. Hash the canonical normalized row with SHA-256 for `raw_payload_hash`. Upsert only when `(owner_user_id, invoice_number)` identifies the same invoice; reject a conflicting invoice number with different customer or amount.

- [ ] **Step 5: Implement invoice and payment screens**

The invoice list groups `À facturer`, `Facturé`, `À encaisser`, `Payé`, and `En retard`. Invoice creation can link one billing schedule item. Recording a payment calls `public.record_invoice_payment(p_invoice_id uuid, p_amount_cents bigint, p_paid_at date) returns uuid`. This `SECURITY INVOKER` function locks the owner-scoped invoice, rejects non-positive values and overpayment, inserts `invoice_payments`, updates `paid_amount_cents`, `paid_at`, and the derived invoice status, then returns the payment id. Its pgTAP test proves overpayment rolls back without changing the invoice.

- [ ] **Step 6: Verify and commit**

Run: `corepack pnpm --filter @fc/integrations test:run`

Expected: PASS.

Run: `corepack pnpm --filter @fc/domain test:run`

Expected: PASS.

Run: `corepack pnpm --filter @fc/web test:run`

Expected: PASS.

```bash
git add packages/domain packages/integrations apps/web/src/features/invoices apps/web/src/app supabase/migrations pnpm-lock.yaml
git commit -m "feat: add invoice import and payments"
```

---

### Task 7: Add expenses, reserves, recurrence, and event assembly

**Files:**
- Create: `packages/domain/src/recurrence.ts`
- Create: `packages/domain/src/recurrence.test.ts`
- Create: `packages/domain/src/event-builder.ts`
- Create: `packages/domain/src/event-builder.test.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `apps/web/src/features/expenses/schema.ts`
- Create: `apps/web/src/features/expenses/repository.ts`
- Create: `apps/web/src/features/expenses/actions.ts`
- Create: `apps/web/src/features/expenses/expense-form.tsx`
- Create: `apps/web/src/features/settings/settings-form.tsx`
- Create: `apps/web/src/app/(app)/expenses/page.tsx`
- Create: `apps/web/src/app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: owner-scoped invoices, schedules, opportunities, expenses, and app settings.
- Produces: `generateOccurrences`, `buildCashflowEvents`, expense CRUD, reserve/remuneration configuration, and scenario-ready event arrays.

- [ ] **Step 1: Write failing recurrence tests**

```ts
expect(generateOccurrences({ frequency: "monthly", dayOfMonth: 31, startDate: localDate("2026-01-31"), endDate: localDate("2026-04-30") }))
  .toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);

expect(generateOccurrences({ frequency: "quarterly", dayOfMonth: 15, startDate: localDate("2026-01-15"), endDate: localDate("2026-10-15") }))
  .toEqual(["2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15"]);
```

- [ ] **Step 2: Implement recurrence without Date rollover**

Supported frequencies are `monthly`, `quarterly`, and `yearly`. Clamp the configured day to the final day of each target month. Reject an end date before the start date.

- [ ] **Step 3: Write failing event-builder tests**

Create a snapshot containing one unpaid issued invoice, one signed schedule, one opportunity at 40%, one recurring charge, and one planned reserve. Assert:

- invoice event is `certain` on `expected_payment_date` for its unpaid balance;
- signed non-invoiced schedule is `committed`;
- opportunity is `probable` with `4000` basis points;
- expense and reserve are outflows;
- cancelled, paid, or superseded sources create no future duplicate event.

- [ ] **Step 4: Implement source precedence and event assembly**

```ts
export type CashflowSnapshot = {
  invoices: InvoiceForecastSource[];
  billingScheduleItems: BillingScheduleForecastSource[];
  opportunities: OpportunityForecastSource[];
  recurringCashflows: RecurringForecastSource[];
  plannedCashflows: PlannedForecastSource[];
};

export function buildCashflowEvents(snapshot: CashflowSnapshot, range: { startDate: LocalDate; endDate: LocalDate }): CashflowEvent[];
```

Precedence is actual payment over invoice, invoice over linked billing schedule, and converted opportunity over original opportunity. Each generated id combines source type, source id, and occurrence date.

- [ ] **Step 5: Implement Charges and Settings pages**

Charges support recurring and one-off outflows, categories, remuneration, and reserve entries. Settings edits threshold, timezone, legal form, default horizon, and default scenario. Copy states clearly that fiscal/social reserves are configurable planning amounts, not official tax calculations.

- [ ] **Step 6: Verify and commit**

Run: `corepack pnpm --filter @fc/domain test:run`

Expected: PASS.

Run: `corepack pnpm --filter @fc/web test:run`

Expected: PASS.

```bash
git add packages/domain apps/web/src/features/expenses apps/web/src/features/settings apps/web/src/app
git commit -m "feat: add expenses and forecast events"
```

---

### Task 8: Build the real-data dashboard and treasury view

**Files:**
- Create: `apps/web/src/features/dashboard/query.ts`
- Create: `apps/web/src/features/dashboard/view-model.ts`
- Create: `apps/web/src/features/dashboard/view-model.test.ts`
- Create: `apps/web/src/features/dashboard/kpi-strip.tsx`
- Create: `apps/web/src/features/dashboard/cashflow-chart.tsx`
- Create: `apps/web/src/features/dashboard/action-list.tsx`
- Create: `apps/web/src/features/dashboard/upcoming-lists.tsx`
- Create: `apps/web/src/features/dashboard/horizon-selector.tsx`
- Create: `apps/web/src/features/dashboard/scenario-controls.tsx`
- Create: `apps/web/src/app/(app)/dashboard/page.tsx`
- Create: `apps/web/src/app/(app)/cashflow/page.tsx`

**Interfaces:**
- Consumes: `buildCashflowEvents`, `calculateForecast`, owner repositories, app settings.
- Produces: `getDashboardViewModel(ownerUserId, options)`, dashboard UI matching the reference, and a detailed treasury event list.

- [ ] **Step 1: Write failing dashboard view-model tests**

For a fixed `today = 2026-09-05`, assert the model returns:

```ts
expect(model.kpis).toEqual({
  currentBalanceCents: 4_238_000,
  availableBalanceCents: 3_118_000,
  inflows30DaysCents: 1_080_000,
  outflows30DaysCents: 1_173_000,
  projected30DaysCents: 4_145_000,
  runwayDays: 69,
});
expect(model.overdueInvoices[0]?.daysOverdue).toBe(9);
expect(model.chart.points.length).toBe(91);
```

Use a deterministic fixture that mathematically produces these exact values; do not special-case reference numbers in production code.

- [ ] **Step 2: Implement dashboard query and pure view-model mapping**

`query.ts` loads owner settings and all sources overlapping the selected horizon. `view-model.ts` is pure: it builds events, runs forecasts, derives KPI windows, sorts overdue actions by due date then amount, and returns chart-ready integer-cent series.

If no bank connector exists yet, `currentBalanceCents` comes from `app_settings.manual_current_balance_cents` and `manual_balance_as_of`, both created during onboarding. Task 9's E2E flow uses this supported manual state; Plan 2 gives configured Qonto account balances precedence while retaining the manual fallback.

- [ ] **Step 3: Implement the dashboard components**

Match the visual reference's structure:

- top greeting and horizon selector `30 j / 90 j / 6 mois`;
- six KPI cards;
- large cashflow chart with certain, committed/probable, and safety-threshold series;
- inclusion controls for invoices, charges, signed orders, and weighted opportunities;
- right column for actions, upcoming inflows, and upcoming outflows.

Use Recharts only in the client chart component. Server Components perform data loading. Every chart series has a text legend, currency tooltip, and accessible summary. At widths below 900px, stack KPI cards, chart, and action lists; replace the sidebar with the compact mobile navigation from Task 1.

- [ ] **Step 4: Implement the treasury detail page**

Show the opening balance and a chronological list of normalized forecast events with source, certainty, planned date, amount, and running balance. Selecting 30, 90 days, or 6 months uses URL search parameters so views remain linkable.

- [ ] **Step 5: Verify UI behavior and commit**

Run: `corepack pnpm --filter @fc/web test:run src/features/dashboard/view-model.test.ts`

Expected: PASS.

Run: `corepack pnpm --filter @fc/web test:run`

Expected: PASS.

Run: `corepack pnpm --filter @fc/web typecheck`

Expected: PASS.

Run: `corepack pnpm --filter @fc/web build`

Expected: PASS.

```bash
git add apps/web/src/features/dashboard apps/web/src/app packages/domain
git commit -m "feat: add cashflow dashboard"
```

---

### Task 9: Prove the manual journey with E2E, CI, and local documentation

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/global-setup.ts`
- Create: `apps/web/e2e/manual-cashflow.spec.ts`
- Create: `.github/workflows/ci.yml`
- Create: `README.md`
- Create: `docs/INSTALLATION.md`
- Create: `docs/SECURITY_LOCAL.md`
- Modify: `package.json`
- Modify: `apps/web/package.json`
- Modify: `.gitignore`
- Modify: `.env.example`

**Interfaces:**
- Consumes: every Jalon 1 feature.
- Produces: reproducible local setup, automated complete journey, continuous integration, and a Jalon 1 acceptance record.

- [ ] **Step 1: Write the failing Playwright journey**

Global setup uses the local service-role key to create `owner@example.test` with a random runtime password and deletes any prior test user/settings. It writes only the generated password to Playwright process environment, never to disk or logs.

The test performs these exact actions:

```ts
test("owner completes the manual cashflow journey", async ({ page }) => {
  await loginAsOwner(page);
  await completeOnboarding(page, { openingBalance: "42380,00", safetyThreshold: "20000,00" });
  await createCustomer(page, "Atelier Bleu");
  await createOpportunity(page, { name: "Mission conseil", amountHt: "10000,00", probability: "80" });
  await convertOpportunity(page, "Mission conseil");
  await addBillingSchedule(page, { label: "Acompte", amountHt: "5000,00" });
  await createInvoice(page, { number: "F-2026-001", amountHt: "5000,00", vat: "1000,00" });
  await recordPayment(page, { invoice: "F-2026-001", amount: "6000,00" });
  await createRecurringExpense(page, { label: "Rémunération", amount: "3500,00", frequency: "monthly" });
  await expect(page.getByRole("heading", { name: /Bonjour/ })).toBeVisible();
  await expect(page.getByText("Solde projeté")).toBeVisible();
  await expect(page.getByText("Runway")).toBeVisible();
});
```

- [ ] **Step 2: Run E2E and verify the first failure**

Run: `corepack pnpm --filter @fc/web exec playwright install chromium`

Run: `corepack pnpm --filter @fc/web e2e`

Expected: FAIL at the earliest missing or incorrectly labeled application behavior; fix only genuine contract mismatches, not the test's validated journey.

- [ ] **Step 3: Make the complete journey pass**

Add missing stable selectors through accessible roles and labels. Ensure all mutations await navigation/revalidation, the dashboard uses created records, and the test makes no direct database mutation except test-user lifecycle in global setup.

Run: `corepack pnpm --filter @fc/web e2e`

Expected: PASS in Chromium.

- [ ] **Step 4: Add CI and secret scanning**

CI runs on pushes and pull requests with jobs for:

```text
install → lint → typecheck → unit tests → build
supabase start → db reset --local → supabase test db
gitleaks scan
playwright chromium E2E
```

Pin official GitHub Action major versions, use only test credentials, and never pass production values. Add `.superpowers/`, `.env*` except `.env.example`, Supabase temp directories, Playwright artifacts, and coverage output to `.gitignore`.

- [ ] **Step 5: Write reproducible local documentation**

`README.md` explains the product, current Jalon 1 scope, architecture, screenshots/reference, prerequisites, commands, absence of Qonto until Plan 2, and open-source publication status. `docs/INSTALLATION.md` includes Node 24, pnpm 10, Docker, Supabase start/reset, env copying, app start, tests, and shutdown. `docs/SECURITY_LOCAL.md` explains local keys, service-role restrictions, fake data, log hygiene, and secret rotation.

- [ ] **Step 6: Run the complete Jalon 1 verification**

Run: `corepack pnpm lint`

Expected: PASS.

Run: `corepack pnpm typecheck`

Expected: PASS.

Run: `corepack pnpm test:run`

Expected: PASS.

Run: `corepack pnpm build`

Expected: PASS.

Run: `corepack pnpm dlx supabase db reset --local`

Expected: PASS.

Run: `corepack pnpm dlx supabase test db`

Expected: PASS.

Run: `corepack pnpm --filter @fc/web e2e`

Expected: PASS.

- [ ] **Step 7: Commit the validated manual vertical**

```bash
git add .github README.md docs package.json apps/web .gitignore .env.example
git commit -m "test: verify manual cashflow vertical"
```

---

## Jalon 1 Exit Gate

Do not start the Qonto plan until all of the following are true:

- a new local owner can complete onboarding;
- owner isolation passes pgTAP tests;
- the complete commercial-to-dashboard journey passes Playwright;
- manual and CSV invoice paths work without an external provider;
- the dashboard displays only persisted data and deterministic projections;
- lint, typecheck, unit tests, database tests, build, and E2E all pass;
- the repository contains no secret and local setup is reproducible from the documentation.

After this gate, create `docs/superpowers/plans/2026-09-05-qonto-integration.md` from the approved design and execute it with the same subagent-driven review workflow. After Qonto passes a real-account read-only validation, create the final deployment/hardening plan.
