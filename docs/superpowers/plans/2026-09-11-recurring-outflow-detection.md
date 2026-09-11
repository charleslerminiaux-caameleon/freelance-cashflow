# Monthly Outflow Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect monthly Qonto outflows, persist reviewable suggestions, and project confirmed expenses without counting paid months twice.

**Architecture:** A pure domain engine proposes series from a coherent published banking snapshot. Service-only analysis RPCs persist estimates separately from owner decisions; owner RPCs atomically confirm/link/dismiss and preserve deletion suppression. Existing expenses and forecast consume confirmed links and current payment evidence.

**Tech Stack:** Existing TypeScript, Vitest, Next.js 16, Zod, PostgreSQL/Supabase, pgTAP, Playwright; no new production dependency.

**Spec:** `docs/superpowers/specs/2026-09-11-recurring-outflow-detection-design.md` (approved by user).

## Global Constraints

- L’application sert à projeter la trésorerie. Les soldes publiés par Qonto constituent le point de départ ; les transactions historiques ne sont jamais rejouées pour reconstruire ce solde.
- Une suggestion ne produit aucun événement financier avant confirmation.
- L’analyse ne remplace jamais une décision ou des champs édités.
- Les tests utilisent exclusivement la stack jetable dédiée. Do not read/copy `.env.local`, call real Qonto, reset or migrate hosted Supabase, or use its linked CLI commands. Only `.isolated-tests/`, project `jalon-2-qonto-tests`, API 56321/DB 56322 is authorized for tests.
- No secrets, financial payloads, individual amounts or labels in logs/fixtures/reports; all fixtures synthetic. Existing user files and running app port 3001 are not test fixtures. No push/merge/deploy.
- Monthly detection only: six calendar months, >=3 consecutive months, exactly one completed positive outflow/month, active/current account, projection currency; ±10% median, ±3 calendar days, latest expected date +7 days freshness. Integer cents, owner timezone dates.
- New hosted migration requires separate explicit authorization after review. Earlier authorization for twelve migrations does not cover this work.

## File structure and task order

1. Pure engine/types in `packages/domain/src/recurring-detection{,-types}.ts`, tests and domain exports.
2. Persistence in `supabase/migrations/202609110001_recurring_detection.sql` and `202609110002_recurring_detection_functions.sql`; pgTAP `recurring_detection.test.sql`.
3. Server orchestration/repositories/schemas in `apps/web/src/features/recurring-detection/`; hook successful banking sync; forecast paid-month exclusion.
4. Owner actions/components and existing expenses screen/form integration.
5. Actual RPC/HTTP/browser acceptance and hosted validation documentation; no remote mutation.

### Task 1: Pure monthly detection and paid-month engine

**Files:** Create `packages/domain/src/recurring-detection-types.ts`, `recurring-detection.ts`, `recurring-detection.test.ts`; modify `packages/domain/src/index.ts`. A separate `recurring-detection-dates.ts` is allowed for calendar helpers if needed.

**Interfaces:** Export these exact shapes from domain root:
```ts
export type DetectionTransaction = {
 id: string; accountId: string; currency: string; label: string;
 amountCents: number; direction: 'inflow'|'outflow'; status: string; transactionDate: string;
};
export type DetectionAccount = {id:string; currency:string; active:boolean; current:boolean};
export type RecurringCandidate = {
 accountId:string; currency:string; normalizedLabel:string; label:string;
 amountCents:number; dayOfMonth:number; transactionIds:string[];
 lastPaymentDate:string; nextDate:string;
};
export type MonthlyDetectionInput = {today:string; currency:string; accounts:DetectionAccount[]; transactions:DetectionTransaction[]};
export function normalizeRecurringLabel(label:string):string;
export function detectMonthlyOutflows(input:MonthlyDetectionInput):RecurringCandidate[];
export function nextRecurringDate(dayOfMonth:number,lastPaymentDate:string,today:string):string;
export function paidMonthsForSeries(series:Pick<RecurringCandidate,'accountId'|'currency'|'normalizedLabel'|'amountCents'>,transactions:DetectionTransaction[]):string[];
```
Dates validate through shared localDate; IDs are opaque nonempty strings in pure engine. `paidMonthsForSeries` returns unique sorted YYYY-MM strings for same account/currency/normalized label, completed positive outflow within ±10% observed series median. No day-window restriction for fulfilled months (early payment counts). It uses current published evidence, so reversed rows no longer count. Provider identity/owner partition and authorization belong to server/SQL tasks.

- [ ] Write synthetic failing behavioral tests before implementation:
```ts
const transactions = ['2026-07-05','2026-08-06','2026-09-05'].map((transactionDate,i)=>({id:`t${i}`,accountId:'a',currency:'EUR',label:'ACME CLOUD',amountCents:1000,direction:'outflow' as const,status:'completed',transactionDate}));
expect(detectMonthlyOutflows({today:'2026-09-11',currency:'EUR',accounts:[{id:'a',currency:'EUR',active:true,current:true}],transactions})).toMatchObject([{amountCents:1000,nextDate:'2026-10-05',transactionIds:['t0','t1','t2']}]);
expect(detectMonthlyOutflows({today:'2026-09-11',currency:'EUR',accounts:[{id:'a',currency:'EUR',active:true,current:true}],transactions:transactions.slice(1)})).toEqual([]);
```
- [ ] Run `corepack pnpm --filter @fc/domain test:run src/recurring-detection.test.ts`, capture behavioral RED.
- [ ] Implement exact spec algorithm. Window begins same calendar day six months before today, clamped to month end. Deduplicate by transaction id; conflicting duplicates reject group. Group by account/currency/normalized label; preserve digits. Build runs of consecutive singleton months; choose the latest maximal run, require >=3; reject this run if amount/day/freshness checks fail (do not fall back to older runs). Median uses BigInt sums for even counts; percentage comparisons use BigInt. Choose 1..31 minimizing total calendar-day error after month clamping, largest day on ties. All output deterministic regardless input order. Suggested label comes from latest payment, safely limited to expense form max160. Compute nextDate as earliest recurrence strictly after today and in a month after lastPaymentDate.
- [ ] Add cases: window bounds, malformed dates, permutation, accents/punctuation/numeric references, duplicates and multiple monthly debits, interrupted/ambiguous sequences, zero/inflow/status/FX/closed/noncurrent exclusion, ±10% boundaries/unsafe cents, ±3-day and leap/end-month rules, ±7-day freshness, confirmed paid month and reversed exclusion.
- [ ] Run domain tests and typecheck; self-review and commit.

### Task 2: Owner-safe suggestion state and atomic decisions

**Files:** Create two migrations above and `supabase/tests/database/recurring_detection.test.sql`. Optional `scripts/test-recurring-concurrency.mjs` for real connection contention, using existing isolated guards. No hosted commands.

**Interfaces:** SQL snake_case candidate items correspond exactly to Task1 fields. All timestamp markers use unmodified integrations.last_success_at timestamptz.

Tables:
- `recurring_detection_runs`: one row per owner/integration, lease run UUID + expires_at (60 seconds), analyzed publication, last success/attempt/error metadata. Owner SELECT only; analysis service RPC only.
- `recurring_suggestions`: UUID id, owner/integration/account composite ownership, currency, normalized_label, frequency monthly, state pending/confirmed/dismissed, eligible boolean, observed amount/day/last_payment_date/next_date, display label, source_publication, rules_version integer1, linked recurring_cashflow id nullable, timestamps. Unique(owner,integration,account,currency,normalized_label,frequency) is canonical series identity; no amount/day/version in identity. Preserve decisions on repeated analysis. Composite FK to owner recurring row; link deletion uses trigger described below. Unique nonnull linked charge prevents multiple series claiming same expense in V1.
- `recurring_suggestion_evidence`: owner/integration/suggestion/transaction composite FKs; references, no raw payload duplicates.

RPC contracts:
```sql
-- service_role only; verify actual app owner, lock integration then detection row consistently
acquire_recurring_analysis(p_owner_user_id uuid,p_run_id uuid) returns jsonb
-- {integration_id, source_publication, lease_expires_at}; SOURCE_UNAVAILABLE when no banking publication
publish_recurring_analysis(p_owner_user_id uuid,p_run_id uuid,p_source_publication timestamptz,p_candidates jsonb) returns void
fail_recurring_analysis(p_owner_user_id uuid,p_run_id uuid,p_error_code text) returns void
-- authenticated only, owner derived from auth.uid(); all mutations take integration then detection/suggestion locks, same order
confirm_recurring_suggestion(p_suggestion_id uuid,p_source_publication timestamptz,p_command jsonb,p_existing_expense_id uuid default null,p_allow_duplicate boolean default false) returns uuid
set_recurring_suggestion_state(p_suggestion_id uuid,p_action text) returns void
-- action dismiss (pending), reexamine (dismissed -> pending eligible false, requires fresh analysis)
```
Confirm command snake_case: label,amount_cents,day_of_month,start_date,category_id,cashflow_kind (`expense`),certainty,probability_basis_points; monthly active creation no end_date. Confirm associated existing charge must belong to owner, outflow expense monthly; never modify it. Validate source matches current bank publication and current eligible suggestion; strict future start in owner timezone and month after last observed payment. Replay confirmed returns same existing link without duplicate insertion. Similar unlinked expenses by normalized label and ±10% amount require p_allow_duplicate=true unless association selected. PostgreSQL label normalization must match TypeScript via normalize/unaccent available extension or explicit tested equivalent; never accidentally expose untrusted search_path. Implement shared SQL helper for matching, restricted execute.

- [ ] Write pgTAP tests for tables/RLS + acquire/stage outcomes before migration. Follow existing test owner setup, run in disposable dedicated stack and record RED.
- [ ] Implement additive tables, constraints, grants, RLS and RPCs. Service publication verifies source still current under integration lock, live run fencing/expiry after lock, all candidate/evidence ownership and amounts/dates. Whole analysis atomic; candidate batches bounded at service (Task3). Mark absent pending ineligible, update estimates/evidence for pending; never overwrite state/link or edited recurring fields for confirmed/dismissed. Preserve confirmed observed matching metadata to avoid reinterpreting user edits. Reject duplicated/malformed candidate arrays atomically.
- [ ] Add BEFORE DELETE trigger on recurring_cashflows: under compatible locks mark associated suggestion dismissed and unlink, then allow existing deletion. Ensure concurrent confirm/analyze/delete cannot resurrect or deadlock; update optional script if real backend probe is needed. Reexamine changes decision only, next analysis may present it again. Expired/failed analysis never rolls back a banking publication or valid prior suggestions.
- [ ] Run tests for foreign owner/account/transaction/category/expense, double confirmation, same-series upsert, source changed, expired/replaced lease, refusal and edited-field persistence, delete suppression, association no mutation, duplicate guard, future date validation, rollback on invalid evidence, grants/search_path.
- [ ] Run `node scripts/run-isolated-tests.mjs db` with escalation only for dedicated Docker; self-review and commit. RPC payload/error contract documented in report for Task3. Error codes: DETECTION_LOCKED, DETECTION_STALE, DETECTION_INVALID, DETECTION_DUPLICATE, DETECTION_NOT_FOUND, DETECTION_SOURCE_UNAVAILABLE; external DB errors normalized by TS.

### Task 3: Coherent analysis orchestration and projection integration

**Files:** Create `apps/web/src/features/recurring-detection/{schema,repository,service,forecast}.ts` and focused tests. Modify `features/integrations/sync-qonto.ts`, its tests, `features/dashboard/query.ts`, banking repository only as necessary for whole-history coherent snapshot and matching tests. Add internal modules within this feature by responsibility if needed.

**Interfaces:** Consumes Task1 exports, Task2 RPCs. Produces:
```ts
export type AnalysisResult = {success:true;count:number}|{success:false;code:'DETECTION_LOCKED'|'DETECTION_STALE'|'DETECTION_INVALID'|'DETECTION_DUPLICATE'|'DETECTION_NOT_FOUND'|'DETECTION_SOURCE_UNAVAILABLE'|'DATABASE_ERROR'};
export function analyzeRecurringForOwner(ownerUserId:string):Promise<AnalysisResult>;
export function getRecurringSuggestionWorkspace(client:SupabaseClient,ownerUserId:string):Promise<RecurringSuggestionWorkspace>;
// workspace {suggestions: RecurringSuggestion[], ignored: RecurringSuggestion[], lastAnalyzedAt:string|null, analysisError:string|null}
// Suggestion: id,state,eligible,label,amountCents,dayOfMonth,nextDate,lastPaymentDate,sourcePublication,linkedExpenseId, accountId,currency,normalizedLabel, evidence:[{id,label,amountCents,transactionDate}], possibleDuplicates:[{id,label,amountCents}]. Schema module exports these types.
```
Future Task4 calls owner-authenticated client.rpc confirm and set_state via repository wrappers taking exact Task2 payload. Provide `confirmSuggestion(client,ownerId,input):Promise<string>` and `setSuggestionState(client,ownerId,id,action):Promise<void>`; validate with Zod and sanitize errors. OwnerId never substitutes for auth authorization. Analysis tests inject provider/store/time dependencies without loading real env; server-only wrapper creates admin client.

- [ ] RED tests for coherent full-history pagination (>1000 rows), stale publication rejection, no source, lease contention, timeout/page cap, preserving earlier suggestions on failure, and success-hook failure isolation.
- [ ] Implement six-month read with before/after marker checks, exact owner/integration filters, accounts/history pagination1000, abortSignal to bypass Next memoization. Bound analysis <=45seconds (less than60 lease), <=100000 transactions and <=10000 candidates; overflow fails sanitized without partial persistence. Final write checks active lease and exact marker again. Reads and algorithms do not emit financial data to logs. Acquire lock before snapshot; call fail only while run owns lease. Use existing strict logging pattern with separate allowlisted detection events/counts/codes if needed.
- [ ] Implement successful sync hook:
```ts
const bankingResult = await synchronizeBanking(/* existing input */);
if (bankingResult.success) { await analyzeRecurringForOwner(ownerUserId); }
return bankingResult;
```
Retain banking success even if analysis fails; persist/show analysis failure separately. Guard thrown analysis failures; never mask original banking failures. Manual analyze returns stable result for Task4.
- [ ] Implement workspace loading with pagination, safe evidence columns and owner checks, ignored list, matching duplicate computation; do not expose normalized internal identity unnecessarily in browser props beyond required server use.
- [ ] RED forecast tests: pending neutral, confirmed adds future expense, paid month excluded, reversed restores, nonmonthly linked untouched, manual untouched, zero Qonto starting balance retained, no history replay.
- [ ] Build projection exclusion from confirmed linked suggestions and a coherent current banking snapshot using Task1 `paidMonthsForSeries`. Pass a map of recurring cashflow IDs to paid YYYY-MM through a backward-compatible optional argument in `buildCashflowEvents` if necessary; only monthly recurrence origin excludes. Do not rely on prior analysis success. Bank balance and evidence must share publication; extend existing snapshot API for complete history rather than using UI50-item page. Query wiring must preserve existing cashflow-snapshot reuse.
- [ ] Run domain and affected web tests/typecheck/lint; self-review and commit with final interfaces reported.

### Task 4: Owner suggestion review and expense editing UI

**Files:** Create `features/recurring-detection/{actions,suggestion-panel,suggestion-form}.tsx/ts` with tests (actions.ts, components.tsx as appropriate); modify `app/(app)/expenses/page.tsx`, existing expense workspace/components and tests, integration panel feedback if needed. Read apps/web/AGENTS.md and installed Next guides before modifying framework behavior.

**Interfaces:** Consumes Task3 workspace/result/repository API and Task2 owner RPC contract. Actions derive owner via requireOwner; forms provide no trusted owner. Successful actions revalidate expenses/dashboard/cashflow/integrations. Reuse existing expense form validation and types where applicable, including category/certainty fields.

- [ ] Write RED component/action/page tests for empty vs pending state, evidence details, default committed/category empty, form corrections, pending submission, confirm/associate/explicit duplicate create, dismiss, ignored reexamine, manual analyze result, auth rejection and normalized errors.
- [ ] Implement French UI: section « Récurrences à confirmer », no financial impact until confirmation, cards with future monthly estimate and evidence count, details disclosure. Confirm editable label/amount/day/start/category/certainty; association dropdown of eligible existing charges; separate explicit override checkbox when duplicates. Ignore action and secondary ignored list/Reexaminer. Manual button « Analyser les transactions importées ». Error text distinguishes successful banking refresh from failed analysis. Never render raw SQL error/payload or secrets.
- [ ] Existing recurring list shows « Détectée depuis Qonto » for linked charges, retains edit/deactivate/delete; editing a linked frequency away from monthly warns monthly paid-exclusion no longer applies. Deletion goes through Task2 trigger, suppression survives.
- [ ] Tests assert loading/errors/accessibility and actual submit payload behavior, not snapshots mirroring markup. Verify pending suggestion never changes projected totals, success revalidation and stale suggestion messaging instructing reanalysis.
- [ ] Run affected web tests and lint/typecheck; self-review and commit.

### Task 5: Full acceptance, documentation and final safety gates

**Files:** Extend `apps/web/e2e/qonto.integration.ts` or add dedicated integration file covered by config; add `apps/web/e2e/recurring-detection.spec.ts`, synthetic preload fixtures as needed, update `scripts/run-isolated-tests.mjs` E2E file list and corresponding tooling test. Add `docs/RECURRING_DETECTION.md`; amend docs/QONTO.md/README for workflow and pending hosted migration. No production demo routes/flags, no new dependency.

**Interfaces:** All prior tasks. Dedicated harness owns test data, credentials captured in memory; foreign URL guards stay in place. No read/copy actual `.env.local`; all tests run with explicit fake provider and dedicated Supabase config.

- [ ] RED actual integration scenario: published synthetic three-month series -> analyze -> pending -> confirm -> forecast future entry -> update amount -> resync preserves override -> delete -> resync stays suppressed -> reexamine -> pending; add existing association, duplicate protection, reversed-month behavior and failure preserving bank success.
- [ ] Add real concurrent RPC calls (separate requests/backends) to demonstrate one lease winner and one confirmed charge under double submit; RLS/owner tests remain pgTAP. Cover stale source and >1000 rows via fixtures without raw logs.
- [ ] Browser journey uses mocked fixed-origin Qonto, fresh dedicated owner, visits Sorties after sync, opens evidence, confirms/edits/deletes/reexamines and verifies forecast effect. Screenshots/traces/video disabled. Extend explicit harness list so CI runs it.
- [ ] Document rules/limitations, how to analyze already imported history, confirmation/association/refusal, paid-month behavior, and hosted migration step awaiting authorization; no claim of real-provider acceptance from synthetic runs.
- [ ] Run isolated all, full unit/lint/typecheck, fake-canary build and client scan. These commands must not use live server3001; coordinate with controller before builds because existing `.next` is shared. Run secret scan on new diff/history through controller. Self-review and commit.
