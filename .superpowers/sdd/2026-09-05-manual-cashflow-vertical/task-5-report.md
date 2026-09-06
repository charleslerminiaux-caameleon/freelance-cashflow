# Task 5 — Commercial cashflow journey

## Status

DONE. Implemented from base `1dd4d8f80d4f83d977ac68a121b8187b93df0eae` in the assigned worktree.

## What was implemented

- Pure commercial domain conversion with branded integer cents, integer basis-point VAT, documented half-up rounding, terminal-status rejection, and commercial boundary checks.
- Zod boundaries for customers, opportunities, conversions, and billing schedule items. Euro amounts are parsed without floating-point arithmetic; probabilities use integer basis points; business dates are validated ISO dates.
- Owner-scoped customer and opportunity CRUD repositories/actions. Every Task 5 Server Action calls `requireOwner()` before reading `FormData` or commercial data. Inserts carry `owner_user_id`; reads, updates, deletes, and ownership checks explicitly filter `owner_user_id`.
- Owner-scoped engagement list/detail and billing schedule creation, using only the authenticated Supabase server client under RLS.
- `public.convert_opportunity(...)` as a `SECURITY INVOKER` RPC with a locked search path, explicit `auth.uid()` and singleton-owner checks, row locking, stable errors, one engagement insert, and linked opportunity update in one transaction.
- A row-locking billing-schedule trigger that prevents concurrent active schedule totals from exceeding the engagement TTC amount.
- Real `/opportunities`, `/engagements`, and `/engagements/[id]` pages with empty states, customer/opportunity creation, inline editing, eligible conversion controls, engagement contract values, multi-item schedules, and desktop/mobile layouts. No mock records and no Qonto code were introduced.

## Adjacent files justified

- `apps/web/src/features/commercial-schema.ts` centralizes the money/date/percentage Zod primitives shared by the three requested feature areas.
- `apps/web/src/features/repository-error.ts` strips raw database details while retaining allow-listed stable `FC_*` codes for safe UI messages.
- `customer-form.tsx` and `billing-schedule-form.tsx` are the minimal client components required to provide the requested customer creation/edit and schedule creation with inline action feedback.
- `apps/web/package.json` and `pnpm-lock.yaml` add the required workspace dependency from the web conversion action to `@fc/domain`.
- `apps/web/src/app/globals.css` supplies the responsive commercial UI styling within the existing global style architecture.
- The schedule-total trigger is colocated in the requested Task 5 migration because an application-only sum check would race under concurrent inserts.

## TDD evidence

### RED

1. Domain module:
   - Command: `corepack pnpm --filter @fc/domain test:run src/commercial.test.ts`
   - Result: failed suite; `Cannot find module './commercial'`.
   - Expected reason: the pure conversion module did not exist.

2. Web schemas and conversion controls:
   - Command: `corepack pnpm --filter @fc/web test:run src/features/customers/schema.test.ts src/features/opportunities/schema.test.ts src/features/engagements/schema.test.ts src/features/opportunities/opportunity-form.test.tsx`
   - Result: 4 failed suites; each requested schema/form module was unresolved.
   - Expected reason: customer/opportunity/schedule validation and conversion controls did not exist.

3. Customer and billing schedule forms:
   - Command: `corepack pnpm --filter @fc/web test:run src/features/customers/customer-form.test.tsx src/features/engagements/billing-schedule-form.test.tsx`
   - Result: 2 failed suites; both component modules were unresolved.
   - Expected reason: the user-facing creation forms did not exist.

4. Conversion database RPC:
   - Command: `corepack pnpm dlx supabase test db supabase/tests/database/convert_opportunity.test.sql`
   - Result: pgTAP failed because `public.convert_opportunity(uuid,text,date,bigint,integer)` did not exist.
   - Expected reason: the atomic RPC migration had not been implemented.

5. Schedule total invariant:
   - Command: `corepack pnpm dlx supabase test db supabase/tests/database/convert_opportunity.test.sql`
   - Result: 2 failures of 28; an over-allocation raised no exception and left 3 rows instead of 2.
   - Expected reason: the database did not yet enforce the engagement TTC ceiling.

6. Domain invalid-value boundary:
   - Command: `corepack pnpm --filter @fc/domain test:run src/commercial.test.ts`
   - Result: 2 failures of 6; negative HT and 366-day terms were accepted.
   - Expected reason: commercial value validation had not yet been added.

### GREEN

- Focused domain: `corepack pnpm --filter @fc/domain test:run src/commercial.test.ts` — 6/6 passed.
- Focused web schemas/components: 12/12 passed across customer, opportunity, conversion, and schedule files before the final workspace run.
- Focused database: 28/28 pgTAP assertions passed after a clean migration reset.

## Final verification evidence

- `corepack pnpm test:run` — exit 0; shared 10/10, domain 15/15, web 53/53 (78/78 total).
- `corepack pnpm lint` — exit 0; web ESLint clean.
- `corepack pnpm typecheck` — exit 0; shared, domain, and web typechecks passed; Next route types generated.
- `corepack pnpm dlx supabase db reset` — exit 0; all four migrations replayed from zero in chronological order.
- `corepack pnpm dlx supabase test db` — exit 0; 5 files and 86/86 pgTAP assertions passed, including the Task 4 RLS suites.
- Web build with local test-only Supabase environment values — exit 0; optimized Next build compiled and generated `/opportunities`, `/engagements`, and `/engagements/[id]`.
- `git diff --check` — no output.
- Modified/untracked-file scans for JWT/key patterns, explicit TypeScript `any`, and trailing whitespace — no matches.

## Files changed

- Domain: `packages/domain/src/commercial.ts`, `commercial.test.ts`, `index.ts`.
- Validation/shared web support: `apps/web/src/features/commercial-schema.ts`, `repository-error.ts`, and tests.
- Customers: schema, repository, actions, form, and tests.
- Opportunities: schema, repository, actions, form, and tests.
- Engagements: schema, repository, actions, billing schedule form, and tests.
- Routes: opportunities list/editor, engagements list, engagement detail.
- Database: conversion/schedule migration and 28-assertion pgTAP test.
- UI/dependencies: global commercial styles, web workspace dependency, lockfile.

## Self-review

- Completeness: checked each Task 5 file/interface and the controller’s security constraints against the diff.
- Security: no service-role client is imported or used; the RPC is invoker-mode; singleton owner and `auth.uid()` are checked; composite owner foreign keys and Task 4 RLS remain intact; raw database messages are not shown.
- Data correctness: cents stay safe integers at TypeScript boundaries and `BIGINT` in PostgreSQL; VAT uses exact integer arithmetic; dates are ISO business dates; cross-owner references remain impossible.
- Atomicity: opportunity conversion is one database function transaction with source-row locking; double conversion has a stable refusal; schedule total enforcement locks the parent engagement before summing.
- UX: no fake data; empty states are explicit; conversion controls disappear for `won`/`lost`; all task forms surface action messages inline; layouts collapse to one column on mobile.
- Scope: no unrelated refactor, provider integration, invoicing, or dashboard work was added.

## Residual risk

- A fully authenticated browser journey is intentionally not added here because the plan assigns end-to-end Playwright coverage to a later task. Task 5 covers the UI controls with component tests, the routes with type generation/build, and all transactional/security behavior with real PostgreSQL pgTAP tests.
