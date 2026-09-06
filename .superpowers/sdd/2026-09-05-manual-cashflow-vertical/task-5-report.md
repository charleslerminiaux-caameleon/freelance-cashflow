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

## Fix round — commercial invariants and deletions

### Review findings verified

1. The original RPC accepted a browser-computed TTC amount. That allowed stale or manipulated client state to diverge from the locked opportunity HT. The replacement RPC accepts integer VAT basis points, derives TTC from the current locked HT with the same half-up rule, bounds VAT to 0–100%, rejects bigint overflow before persistence, and drops the old overload.
2. The original child trigger serialized schedule inserts but a direct parent reduction could still move an engagement TTC below its active schedule total. A parent UPDATE trigger now rejects that reduction, permits equality, excludes cancelled items, and composes with the existing reactivation check.
3. Owner RLS allowed a converted opportunity to be edited, unlinked, or deleted after the RPC committed. A database trigger now preserves won status, the reciprocal engagement link, and every commercial field while permitting notes; repository UPDATE/DELETE queries also require a null conversion link so a conversion race becomes a stable refusal. The form no longer offers won as an editable status, and edit/delete/convert controls are hidden once `converted_engagement_id` is non-null.
4. Customer and opportunity deletion actions previously swallowed every error and returned no state. They now return `CommercialActionState`, distinguish success from expected FK/converted refusals, sanitize malformed UUIDs and unexpected failures, and render accessible success/refusal feedback through dedicated delete controls.

### Fix-round TDD evidence

- Authoritative conversion RED: `corepack pnpm dlx supabase test db supabase/tests/database/convert_opportunity_authority.test.sql` failed before the replacement RPC; GREEN: 17/17 assertions passed, including changed source HT, VAT bounds, overflow rollback, privileges, and absence of the stale overload.
- Parent ceiling RED: `corepack pnpm dlx supabase test db supabase/tests/database/engagement_schedule_invariants.test.sql` failed before the parent trigger; GREEN: 6/6 assertions passed for below-total refusal, equality, cancelled exclusion, and reactivation.
- Converted immutability RED: after a clean reset, `corepack pnpm dlx supabase test db supabase/tests/database/converted_opportunity_immutability.test.sql` failed 9/13 assertions before the trigger. A reciprocal-link mutation was separately proven RED at 2/15 failures with that guard removed. GREEN: 15/15 assertions passed.
- Repository/UI/deletion RED: the focused web run failed 9 behavioral tests plus the unresolved repository test harness before implementation; after adding the test-only `server-only` alias, the repository contract failed 3/3 for stale TTC input and missing conversion guards. Deletion action, form feedback, won-status reservation, no-row outcomes, and safe converted-edit messaging were each observed failing before their minimal implementation.
- Repository/UI/deletion GREEN: focused repository suites passed 6/6; focused customer/opportunity form suites passed 8/8; action/schema/component/repository coverage is included in the 73-test web suite.

### Final fix-round verification

- `corepack pnpm dlx supabase db reset --local && corepack pnpm dlx supabase test db` — exit 0; all five migrations replayed and 124/124 assertions passed across 8 files.
- `corepack pnpm test:run` — exit 0; shared 10/10, domain 15/15, web 73/73 (98/98 total).
- `corepack pnpm lint` — exit 0; ESLint clean.
- `corepack pnpm typecheck` — exit 0; all three workspace projects passed.
- Build with test-only `NEXT_PUBLIC_SUPABASE_URL`, anonymous key, and service-role key values — exit 0; Next compiled and generated all routes.
- `git diff --check` and explicit secret/unsafe-TypeScript/trailing-whitespace scans — no findings.

### Deferred concurrency note

- The current application only inserts billing schedule items. If schedule-item UPDATE or reassignment is added later, its locking protocol must be designed and stress-tested with a deterministic global parent-lock order. The current child-row-then-parent lock path could otherwise deadlock against parent deletion/cascade or cross-engagement moves. This is deliberately deferred rather than broadening Task 5; add it to the dependency ledger when schedule editing enters scope.

## Fix round 2 — reciprocal links and destructive-action confirmation

### Review findings verified

1. The opportunity-side immutability trigger alone did not protect the reciprocal link: an authenticated owner could clear or reassign `engagements.opportunity_id` directly. A new additive migration guards UPDATE and DELETE of an engagement only when its old row has the exact reciprocal opportunity link. It has no client-controlled bypass and intentionally has no INSERT trigger, so the conversion RPC can still create the engagement before linking the opportunity.
2. Customer and opportunity deletion controls submitted on their first click. Both controls now expose an accessible, inline two-step confirmation with explicit confirm and cancel actions. The first click and cancellation do not submit; only the confirmation button invokes the existing structured deletion action.

### Fix-round-2 TDD evidence

- Reciprocal-link RED: after adding `reciprocal_conversion_links.test.sql` but before the migration, 5/9 assertions failed. Clearing and reassignment succeeded and broke their links; deletion was refused only indirectly with the opportunity-side error instead of the dedicated reciprocal-link refusal.
- Reciprocal-link GREEN: after `202609060003_protect_reciprocal_conversion_links.sql`, 9/9 assertions passed. The suite proves RPC conversion still succeeds, all three conversions establish exact reciprocal links, NULL/reassignment/delete are rejected with `FC_CONVERSION_LINK_IMMUTABLE`, rejected mutations preserve rows and links, and unrelated engagement fields remain editable.
- Deletion-confirmation RED: the focused customer/opportunity component run failed 7 tests before the two-step UI existed; first clicks submitted immediately and confirm/cancel controls were absent.
- Deletion-confirmation GREEN: the focused component run passed 13/13 tests after implementation, including first-click non-submission, confirmed submission, cancellation/restoration, success status, and sanitized refusal alert.

### Final fix-round-2 verification

- `corepack pnpm dlx supabase db reset --local && corepack pnpm dlx supabase test db` — exit 0; all six migrations replayed and 133/133 assertions passed across 9 files.
- Focused conversion and reciprocity pgTAP run — exit 0; 52/52 assertions passed across 3 files.
- `corepack pnpm test:run` — exit 0; shared 10/10, domain 15/15, web 78/78 (103/103 total).
- `corepack pnpm lint` — exit 0; ESLint clean.
- `corepack pnpm typecheck` — exit 0; all three workspace projects passed.
- Build with test-only `NEXT_PUBLIC_SUPABASE_URL`, anonymous key, and service-role key values — exit 0; optimized Next build compiled and generated all routes.
- `git diff --check` and explicit changed-file scans for secret-shaped values, unsafe TypeScript `any`, trailing whitespace, and `window.confirm` — no findings.

### Deferred concurrency note

- Unchanged from the first fix round: schedule-item UPDATE/reassignment remains outside the current insert-only application path. Before that path is introduced, define and stress-test a deterministic global parent-lock order to avoid deadlock with parent deletion/cascade or cross-engagement moves, and record that work in the dependency ledger.
