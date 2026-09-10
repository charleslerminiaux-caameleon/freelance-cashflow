# Qonto and Tiime Milestone Two Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the read-only Qonto connection and actionable Tiime preparation, leaving the real Tiime connector explicitly dependent on official API access.

**Architecture:** Server-only Qonto adapter returns normalized pages. A reusable sync service persists pages into hidden staging under a fenced database lease, then atomically publishes the complete run. Next.js actions authorize the owner, trigger the service, and refresh owner-only views; Tiime remains visibly awaiting API access.

**Tech Stack:** Existing pnpm 10.17.1 monorepo, TypeScript, Next.js 16, React, Supabase PostgreSQL 17, Zod, Vitest, pgTAP, Playwright. Supabase CLI 2.116.0.

**Spec:** `docs/superpowers/specs/2026-09-10-qonto-readonly-design.md` (Qonto and Tiime scope approved in conversation).

## Global Constraints

- One owner per installation; no organizations, teams, SaaS tenancy, or new permanent service.
- Every sensitive row has `owner_user_id`, RLS and owner-consistent foreign keys.
- Money is safe integer cents in TypeScript and bounded BIGINT in PostgreSQL. Business dates are ISO dates; technical instants use timestamptz.
- Static Qonto secrets are named `QONTO_LOGIN` and `QONTO_SECRET_KEY`; server memory only. No real secrets, raw financial payloads, full IBANs or sensitive labels in logs, fixtures, reports or Git. No environment dumps.
- All network Qonto operations are allowlisted GET requests to the fixed official HTTPS origin, no redirects or Next.js caching. Tests inject transport; production never injects mock financial data.
- Stable errors: PROVIDER_AUTH_EXPIRED, PROVIDER_RATE_LIMIT, PROVIDER_UNAVAILABLE, PROVIDER_INVALID_RESPONSE, SYNC_LOCKED, DATABASE_ERROR.
- Visible banking data changes only at successful full publication. Page staging and checkpoint advancement commit atomically. A stale lease holder cannot mutate anything.
- Initial history is six calendar months; subsequent modified-time windows overlap by five minutes. Read all four transaction statuses. No automatic invoice/bank reconciliation.
- Tiime preparation is deliverable now; do not invent Tiime endpoints, response schemas, credentials or authentication. Do not claim milestone two complete before both providers have real validation.
- Keep existing manual/CSV flows and forecast behavior; imported transactions are not re-added to a bank balance that already includes them.
- Existing user files and existing Supabase stacks are out of bounds for writes/resets. Tests use a dedicated ignored stack configured with project ID `jalon-2-qonto-tests` and ports in the 563xx range.
- TDD: observe RED before implementation, then GREEN. Use systematic-debugging for unexpected failures. One fresh implementer per task, a spec/quality review after each, and final whole-branch review.

## File map and shared contracts

Task 1 owns `packages/integrations/src/banking.ts`, `errors.ts`, `qonto/{schemas,normalize,client}.ts`, `server.ts`, their tests/fixtures, and package exports. Task 2 owns banking SQL and tests. Task 3 owns `packages/integrations/src/sync/{contracts,service,logger}.ts` plus `apps/web/src/features/integrations/{sync-repository,qonto-config,sync-qonto}.ts`. Task 4 owns UI, banking reads and dashboard consumers. Task 5 owns executable integration/E2E verification, test harness, security checks and guides.

Use these TypeScript boundary contracts (minor refinements must be coordinated before dependent tasks):

```ts
export type NormalizedBankAccount = {
  externalId: string; name: string; ibanMasked: string | null;
  currency: string; currentBalanceCents: number; availableBalanceCents: number | null;
  status: 'active' | 'closed'; updatedAt: string;
};
export type NormalizedBankTransaction = {
  externalId: string; accountExternalId: string; currency: string;
  amountCents: number; direction: 'inflow' | 'outflow';
  status: 'pending' | 'completed' | 'declined' | 'reversed';
  label: string; counterparty: string | null;
  transactionDate: string; valueDate: string | null; updatedAt: string;
};
export type BankingPage<T> = { items: T[]; nextPage: number | null };
export type TransactionWindow = {
  accountExternalId: string; page: number; updatedFrom: string;
  updatedTo: string; initialCreatedFrom: string | null; timezone: string;
};
export interface BankingProvider {
  listAccounts(page: number): Promise<BankingPage<NormalizedBankAccount>>;
  listTransactions(window: TransactionWindow): Promise<BankingPage<NormalizedBankTransaction>>;
}
```

Qonto field specifics must be checked against official documentation, not inferred from these normalized types. Schema failures never expose the rejected value. The package's existing CSV export must remain usable without importing server-only modules.

---

### Task 1: Validated read-only Qonto adapter

**Files:**
- Create: `packages/integrations/src/banking.ts`, `errors.ts`, `server.ts`
- Create: `packages/integrations/src/qonto/schemas.ts`, `normalize.ts`, `client.ts`
- Create: `packages/integrations/src/qonto/client.test.ts`, `normalize.test.ts`, `fixtures.ts`
- Modify: `packages/integrations/package.json` (dedicated server export; add server-only dependency only if needed), lockfile if required

**Interfaces:** consumes shared money/date primitives; produces contracts above and `createQontoProvider({ login, secretKey, fetch?, sleep?, now? }): BankingProvider`. Export `IntegrationError` with only a stable `code` and predefined message; never retain arbitrary causes/payloads.

- [ ] **Step 1: Write behavior tests and observe RED.** Use synthetic account/transaction fixtures including documented unused fields to prove stripping. Assert safe cents, negative account balances, nullable unsettled date, Paris midnight, masked IBAN, all four statuses. Reject unsafe cents, invalid dates/currency, missing required balance, invalid metadata and account mismatch when present.

```ts
expect(normalizeAccount(fakeAccount).currentBalanceCents).toBe(123456);
expect(normalizeAccount(fakeAccount).ibanMasked).not.toContain(fakeAccount.iban);
expect(normalizeTransaction(fakePending, 'account-fake', 'Europe/Paris').valueDate).toBeNull();
```

Run `corepack pnpm --filter @fc/integrations test:run`; first failure must be missing behavior, not a typo. Record evidence.

- [ ] **Step 2: Implement schemas and normalization.** Use `amount_cents`, `balance_cents`, `authorized_balance_cents`; verify documented availability of account status/updated fields. Business dates derive from validated instants in the given timezone. Do not carry provider organization, transfer details, note, attachments or raw payload into normalized output. For unavailable counterparty use null, not an invented name.

- [ ] **Step 3: Write and run RED HTTP contract tests.** Fake fetch records request method, origin, path, header presence (assert with fictitious strings only), query parameters, `redirect: 'error'`, `cache: 'no-store'`. Return paginated `Response` instances. Exercise absent account meta using page length termination, transaction next_page metadata, empty final page, repeated/backward next page and malformed JSON. No real network.

```ts
expect(request.method).toBe('GET');
expect(new URL(request.url).searchParams.getAll('status[]')).toEqual(['pending','completed','declined','reversed']);
expect(await provider.listAccounts(1)).toMatchObject({ nextPage: 2 });
```

- [ ] **Step 4: Implement bounded transport and retries.** Fixed production origin `https://thirdparty.qonto.com`; GET `/v2/bank_accounts` and `/v2/transactions`; page size 100; account ID in query; modified-time filters and `sort_by=updated_at:asc`. Three total attempts; exponential waits 500ms then 1000ms; each attempt timeout 10 seconds; maximum allowed Retry-After wait 5 seconds, otherwise fail without early retry. Retry only 429, 408, 500/502/503/504 and network timeout/unavailability. 401/403 map to AUTH_EXPIRED, other invalid HTTP/JSON/schema conditions to INVALID_RESPONSE. Validate config without exposing it. Throw only sanitized errors. Response body parsing stays covered by the abort deadline; bound body size to 5 MB.

- [ ] **Step 5: Verify retry outcomes.** Tests prove transient recovery, three-attempt exhaustion, no auth/schema retry, respect seconds and HTTP-date Retry-After, no redirect forwarding, redacted thrown errors and no response body leak. Use fake clocks/waits.

- [ ] **Step 6: Run package tests and typecheck, self-review, commit.** `corepack pnpm --filter @fc/integrations test:run` and `corepack pnpm --filter @fc/integrations typecheck`. Commit `feat: add validated read-only Qonto adapter`.

---

### Task 2: Atomic banking storage with fenced leases

**Files:**
- Create: `supabase/migrations/202609100001_banking_sync.sql` (tables, constraints, privileges, RLS)
- Create: `supabase/migrations/202609100002_banking_sync_functions.sql` (atomic RPCs)
- Create: `supabase/tests/database/banking_schema.test.sql`, `banking_sync.test.sql`, `banking_rls.test.sql`
- Create: `scripts/test-banking-concurrency.mjs` and tests/harness dependencies if needed

**Interfaces:** consumes normalized account/transaction contracts, serialized as snake_case columns for RPC JSON input. Produces RPCs (service_role only, explicit owner argument verified against singleton):

```text
acquire_banking_sync(p_owner_user_id uuid, p_run_id uuid)
  -> jsonb {integration_id, run_id, initial_created_from, updated_from, updated_to}
renew_banking_sync(p_owner_user_id uuid, p_run_id uuid) -> void
stage_banking_page(p_owner_user_id uuid, p_run_id uuid, p_kind text,
                  p_account_external_id text, p_page integer,
                  p_next_page integer, p_items jsonb) -> void
publish_banking_sync(p_owner_user_id uuid, p_run_id uuid) -> jsonb {created,updated}
fail_banking_sync(p_owner_user_id uuid, p_run_id uuid, p_error_code text,
                 p_connection_succeeded boolean) -> void
```

Database time controls leases. On acquisition, database time defines the upper sync bound. `updated_from` is last published bound minus 5 minutes, or initial six-month bound. Reacquisition creates a new run and restarts unpublished windows; previous staging is deleted after marking the old run interrupted. Keep the original initial date to avoid a shrinking history on retry.

- [ ] **Step 1: Write failing pgTAP tests.** Assert banking tables plus hidden staging tables, safe monetary checks, unique provider identities, composite owner relationships, published-only SELECT for owner, no reads for anon/nonowner, no direct client writes and RPC execute denied to authenticated. The existing singleton and auth-user deletion must still work.

```sql
select has_table('public', 'bank_accounts');
select has_table('public', 'sync_runs');
select throws_ok($$ select public.acquire_banking_sync('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002') $$, '42501');
```

- [ ] **Step 2: Prepare isolated test stack and observe RED.** Work only in `.superpowers/...` ignored harness; copy config/migrations/tests there, change project id to `jalon-2-qonto-tests`, ports 553xx to 563xx, analytics/vector disabled if not needed. Never start/reset `manual-cashflow-vertical` or `bardda`. Use CLI 2.116.0 and capture status values in memory, never print keys. Record exact safe commands in report for later tasks. Start a dedicated stack, apply existing migrations, prove new schema tests fail.

- [ ] **Step 3: Implement schema.** Seven tables: integrations, sync_runs, bank_accounts, bank_transactions, provider_object_mappings, bank_account_staging, bank_transaction_staging. Additional page bookkeeping may use an eighth small table if needed for strong completion validation. Provider enum/check permits qonto and tiime in shared control tables; acquisition only qonto until Tiime documented. No token columns. Integrations unique owner/provider, lease run id and expiry, last_connection_succeeded nullable, last_success_at and initial import date. Runs store safe counts/checkpoints/error only. Stage is service-only even for owner. Published bank accounts have `is_current` inventory membership and stable internal UUIDs; transactions refer to owner/account consistently. Foreign key deletion must preserve owner deprovisioning semantics.

- [ ] **Step 4: Write failing atomicity and lease tests.** Stage page then inspect published tables (unchanged). Replay same page (idempotent counts). Reject wrong next page, unfinished account or transaction pagination, missing account transaction stream, lease expiry, foreign run, stale holder. Force failure inside publication (invalid staged transaction) and assert old accounts/transactions/mappings/bound remain unchanged. Successful publication then repeated publication returns same counts, preserving identifiers.

- [ ] **Step 5: Implement RPC transactions.** Acquire locks integration row; lease 60 seconds renewed before each provider page and after persistence. SQL owns page ordering: expected page per stream starts 1; final page marks stream complete. Publication requires full account stream and completed transaction stream for each staged account. SQL revalidates normalized fields, money limits and ownership. Duplicate staged pages must not inflate counters or move cursor twice. JSON raw payload is not stored; extract allowlisted columns. Publication performs idempotent upserts, marks absent accounts not current without deleting history, creates/updates mappings, records counts, publishes watermark, clears staging and lease. Run success replay is safe even after a newer run; never modify newer lease. Failure/expiry cannot alter published data or clear someone else's lease. All functions fixed search_path, revoked PUBLIC/anon/authenticated rights, explicit service_role grants, owner guard.

- [ ] **Step 6: Prove concurrent calls.** Implement executable test with two actual database connections (pg dependency allowed for test harness). Race acquisition; exactly one success and one SYNC_LOCKED. Expire old lease, acquire replacement, reject old staging/publication/release. Verify resulting rows, not merely rejected promises. Use fabricated owners in dedicated test DB, clean only those records.

- [ ] **Step 7: Run all pgTAP and concurrency checks, self-review, commit.** Document actual RPC signatures for task 3. Commit `feat: add atomic owner-scoped banking synchronization storage`.

---

### Task 3: Reusable sync orchestration and secure web composition

**Files:**
- Create: `packages/integrations/src/sync/contracts.ts`, `service.ts`, `logger.ts`, `service.test.ts`, `logger.test.ts`
- Modify: `packages/integrations/src/server.ts`
- Create: `apps/web/src/features/integrations/qonto-config.ts`, `qonto-config.test.ts`, `sync-repository.ts`, `sync-repository.test.ts`, `sync-qonto.ts`
- Modify: `.env.example`

**Interfaces:** consumes Task 1 provider and Task 2 RPCs. Produces:

```ts
export type IntegrationErrorCode = 'PROVIDER_AUTH_EXPIRED' | 'PROVIDER_RATE_LIMIT' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_INVALID_RESPONSE' | 'SYNC_LOCKED' | 'DATABASE_ERROR';
export type SyncLogEvent = { event: 'sync_started'|'page_staged'|'sync_succeeded'|'sync_failed'; runId: string; durationMs?: number; count?: number; code?: IntegrationErrorCode };
export type SyncResult = { success: true; created: number; updated: number }
  | { success: false; code: IntegrationErrorCode };
export interface BankingSyncStore {
  acquire(ownerUserId: string, runId: string): Promise<{
    integrationId: string; initialCreatedFrom: string; updatedFrom: string; updatedTo: string;
  }>;
  renew(ownerUserId: string, runId: string): Promise<void>;
  stageAccounts(ownerUserId: string, runId: string, page: number, nextPage: number|null, items: NormalizedBankAccount[]): Promise<void>;
  stageTransactions(ownerUserId: string, runId: string, accountExternalId: string, page: number, nextPage: number|null, items: NormalizedBankTransaction[]): Promise<void>;
  publish(ownerUserId: string, runId: string): Promise<{created:number;updated:number}>;
  fail(ownerUserId: string, runId: string, code: IntegrationErrorCode, connectionSucceeded: boolean): Promise<void>;
}
export function synchronizeBanking(input: {
 ownerUserId: string; runId: string; timezone: string; provider: BankingProvider;
 store: BankingSyncStore; now?: () => number; log?: (event: SyncLogEvent) => void;
}): Promise<SyncResult>;
// Web composition requires an already verified owner; its caller is a server action.
export function synchronizeQontoForOwner(ownerUserId: string): Promise<SyncResult>;
```

- [ ] **Step 1: RED service tests with real adapter and fake transport/store.** Prove accounts complete before per-account transactions; zero accounts publishes valid empty inventory; many accounts/pages; no fetch on locked acquisition; stage failure stops immediately and leaves published data unchanged; no publish before every stream ends. Fake store models visible vs staged state to assert outputs. Use the real SQL harness in Task 5 for actual transactional behavior.

```ts
expect(result).toEqual({ success: false, code: 'DATABASE_ERROR' });
expect(store.visibleAccounts).toEqual(previousAccounts);
expect(store.publishedThrough).toBe(previousBound);
```

- [ ] **Step 2: Implement orchestration.** Generate run ID at server composition (`crypto.randomUUID`). Acquire before calling Qonto, renew before each request; process sequential pages; stage before advancing local page number; reject non-progressing page metadata and repeated account IDs across pages; 120-second overall sync budget and 10,000-page hard cap return PROVIDER_UNAVAILABLE/INVALID_RESPONSE respectively, preserving visible data. Pass persisted initial history filter on every transaction run so updated old in-scope objects are re-read. Catch cleanup errors without replacing primary error. Never convert an acknowledged publish success into failure due to logging. Reconcile an ambiguous publication result via idempotent publish retry only for classified transient DB failures, otherwise preserve run for next inspection (do not mark a committed run failed).

- [ ] **Step 3: RED logger and config tests.** Logger rejects arbitrary event names/fields; strip injected headers, messages, amounts, IBAN, label and raw errors. Validate values as well as field names: UUID identifiers, finite nonnegative durations/counters, enum codes. Config absent/incomplete => unconfigured, doesn't break manual app. Whitespace/control-character credentials invalid; never stringify credentials in failure.

- [ ] **Step 4: Implement logger and composition.** Server-only qonto config loader reads exactly the two Qonto env values lazily, returns private config or null; separate public boolean accessor. RPC repository serializes only allowlisted snake_case normalized values, parses returned data using web Zod, maps errors to stable code without raw cause. Explicit owner filter on read/write and singleton verification in SQL remain mandatory even with admin client. Use owner timezone from existing settings. Existing public Supabase config remains unchanged. Add empty Qonto entries with explanatory comments in `.env.example` and no Tiime credentials.

- [ ] **Step 5: Verify tests, typecheck, self-review and commit.** Run focused integrations/web tests, then full relevant package suites. Commit `feat: orchestrate secure manual banking synchronization`.

---

### Task 4: Owner UI, bank-backed dashboard and Tiime preparation

**Files:**
- Create: `apps/web/src/features/integrations/actions.ts`, `actions.test.ts`, `repository.ts`, `repository.test.ts`, `integration-panel.tsx`, `integration-panel.test.tsx`
- Create: `apps/web/src/app/(app)/integrations/page.tsx`, `page.test.tsx`
- Create: `apps/web/src/features/banking/repository.ts`, `repository.test.ts`, `banking-view.tsx`, `banking-view.test.tsx`
- Modify: `apps/web/src/features/dashboard/query.ts`, `view-model.ts`, their tests; `apps/web/src/app/(app)/cashflow/page.tsx` and its test
- Modify: `apps/web/src/components/app-shell.tsx`, its test and app layout if needed; `apps/web/src/app/globals.css`
- Create: `packages/integrations/src/invoicing.ts`, `invoicing.test.ts` (normalized Tiime-ready domain contract only)

**Interfaces:** consumes `synchronizeQontoForOwner` and published banking tables. Produces owner-only integrations route, `syncQontoAction(previousState, formData)` and bank view. Bank selection is a pure function returning `{source:'manual'|'qonto',balanceCents,asOf,excludedCurrencies,lastSyncSucceeded}`; keep the bank balance separate from `manualCurrentBalanceCents` in source model rather than overwriting a field named manual.

- [ ] **Step 1: Read applicable AGENTS and installed Next.js docs.** Read local server action, caching/revalidatePath and server/client boundary guides from `apps/web/node_modules/next/dist/docs` before modifying app code.

- [ ] **Step 2: RED action/UI tests.** Nonowner cannot reach sync; derive owner only from requireOwner, never form. Unconfigured Qonto disables sync. State distinguishes no prior attempt, last provider connection succeeded/failed and last sync error. Clicking shows pending and prevents double-submit (database lock remains authority). Error messages fixed and actionable. Successful sync revalidates /integrations, /cashflow, /dashboard and layout state. Tiime shows exactly `Accès API à obtenir`, guide link and existing CSV route, no sync button or fake success.

- [ ] **Step 3: Implement integration views/actions and bank reads.** Explicit column selects and owner predicates, Zod parsing, stable errors. Read only published rows; avoid service-role for owner reads. Accounts current/closed and currencies clearly displayed; transaction history paginated 50 rows per page with validated query params and stable order date/id. No full IBAN, raw provider metadata or credentials in props. Financial labels escaped by React. Reuse existing visual language, accessible state labels and responsive styles.

- [ ] **Step 4: RED pure balance/forecast tests.** With manual 100000 and Qonto EUR accounts 200000+300000, start balance=500000, not 600000; account with zero balance is valid, not fallback. Foreign currency accounts excluded explicitly. Qonto failure with previous data retains bank source/date. No publication or no usable current EUR account uses manual fallback. A completed bank transaction does not add its amount to forecast. Existing forecasts/reserves remain unchanged apart from opening balance. Missing/unsafe bank balances cannot silently produce zero. Persisted data selection does not require live Qonto config so removing credentials retains valid data.

```ts
expect(model.kpis.currentBalanceCents).toBe(500000);
expect(model.openingBalanceSource).toBe('qonto');
expect(model.chart.points[0]?.certainBalanceCents).toBe(500000);
```

- [ ] **Step 5: Implement dashboard integration and bank view.** Use sum of current account balances matching instance currency, show source/date and stale status. Authorized balance displayed per account but does not redefine existing reserves KPI. Update all manual-only labels. Never include pending bank amounts again as forecast expense. Bank history is a separate section from future events.

- [ ] **Step 6: Tiime normalized contract tests then implementation.** Define a provider-agnostic normalized invoice schema with external ID, customer identity, invoice number, issued/due dates, HT/VAT/TTC integer cents, currency, normalized status, and discriminated payment knowledge `{kind:'unknown'}` or `{kind:'known',paidAmountCents,paidAt:null|string}`. Validate totals and paid<=TTC; missing payment never implies zero. No Tiime response schema/client/stub. This schema is for future adapter boundary; no changes to authority of existing invoices until API documented. Validate customer contract similarly using minimal required identity/name fields.

- [ ] **Step 7: Run web/integrations tests, lint, typecheck, self-review, commit.** Commit `feat: show Qonto banking data and prepare Tiime integration`.

---

### Task 5: Executable acceptance, safe local guides and CI

**Files:**
- Create: `apps/web/e2e/qonto-sync.spec.ts`, test-only transport bootstrap under `apps/web/e2e/`
- Create: `scripts/test-qonto-integration.mjs` or `.ts`, `scripts/run-isolated-tests.mjs`, their behavioral tooling tests where meaningful
- Modify: `apps/web/playwright.config.ts`, `apps/web/e2e/run-local.sh`, package scripts and `.github/workflows/ci.yml`
- Create: `docs/QONTO.md`, `docs/TIIME.md`
- Modify: `docs/INSTALLATION.md`, `docs/SECURITY_LOCAL.md`, `README.md`

**Interfaces:** consumes real provider/service/RPC/UI. Produces commands for isolated database, real DB + simulated Qonto integration, both E2E journeys and documentation. Mocking HTTP must be test-only via process preload/interception; no production env flag or route that enables financial fixtures. If browser E2E cannot use external HTTP intercept, run test-specific server composition outside production build and clearly assert the production service separately with real database.

- [ ] **Step 1: Write RED acceptance tests.** With real dedicated PostgreSQL and fake Qonto HTTP, execute multi-account multi-page run; assert publication, mappings, counts, bound and dashboard source. Re-run unchanged data; verify stable IDs/no duplicate. Modify transaction status and balance; verify update. Fail page 2; visible snapshot unchanged and bound unchanged, while failure recorded. Resume and confirm no lost object. Auth failure, invalid response and rate-limit cases preserve last data. Run two concurrent manual sync calls and prove one is locked. Check client-facing error/log output contains no planted synthetic secret/IBAN/label marker.

- [ ] **Step 2: Implement reusable isolated harness.** Derive repo files into ignored dedicated directory, replace only project id and port settings in copied config, copy current migrations/tests, check dedicated identity before destructive reset, never accept nonlocal URL. Capture Supabase env in memory only. Test harness behavior against temp fixture dirs, verifying refuses unexpected identity and never mutates source config. Do not copy local env files. Pin CLI 2.116.0. Use existing full stack in CI where job owns it; document local isolated command.

- [ ] **Step 3: Write and pass Playwright Qonto flow.** Authenticate/onboard fictitious owner using existing helper pattern, visit integrations, confirm Tiime awaiting access, sync via button against simulated provider, visit Treasury and dashboard and assert synthetic balances/source. Repeat without duplicates, simulate provider failure and assert previous displayed balance. Preserve manual E2E journey. Screenshots/traces/video remain disabled; never point tests at real validation instance. Fixtures and interception live under tests only.

- [ ] **Step 4: Document exact local procedures.** Qonto guide names server env variables, official key setup, read-only code restriction, six-month history, incremental overlap, per-provider lease, atomic publication, stable errors, retry limits, stale-data UX, no automatic invoice matching, and rotate/revoke/remove config. Real-account validation uses a separate isolated installation, waits for user-filled ignored `apps/web/.env.local`, never requests a key in chat or commit. Tiime guide states requested API access, information to request, no built API client yet, exports require conversion to current CSV contract until native schema known, and anti-duplication/payment authority design for later connector. README must clearly distinguish implemented preparation from real Tiime integration and tests from real Qonto validation.

- [ ] **Step 5: CI and security verification.** CI executes new DB/integration/e2e tests with fictitious runtime credentials only. Keep Gitleaks. Add executable client-bundle/server-boundary verification with planted fake Qonto credentials for build and assert no marker appears in client artifacts; do not inspect real secrets. Do not leak secret through process errors or build logs. Tests for logger redaction use synthetic unique canaries.

- [ ] **Step 6: Full verification and self-review.** Run `corepack pnpm lint`, `typecheck`, `test:run`, `build`, isolated migrations/pgTAP/concurrency/integration, and both E2E flows. Run secret scan on branch/history using installed Gitleaks or equivalent available command; report scanner availability honestly. Commit `test: verify banking sync and document Tiime readiness`.

## Execution and exit gates

Each task must carry a report with RED/GREEN evidence, commits and scoped test commands. Reviewer reports independent spec compliance and quality. Record decisions and actual interfaces in the ignored SDD ledger, not in public reports containing financial data.

After all five tasks, request whole-branch review, resolve findings with a reviewed fix wave, run verification-before-completion, then finishing-a-development-branch. Do not merge or deploy without user authorization. Stop before real Qonto credentials are required and provide exact ignored local path. Tiime connector and full milestone completion remain pending official API access and separate real-account validation; this is an external dependency, not an excuse to leave Qonto's simulated acceptance incomplete.
