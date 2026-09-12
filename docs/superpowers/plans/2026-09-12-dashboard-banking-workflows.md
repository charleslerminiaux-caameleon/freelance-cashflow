# Dashboard and Banking Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make categories discoverable, create recurring charges from a bank debit, automatically refresh stale Qonto data while the app is open, and repair dashboard/navigation presentation.

**Architecture:** Extend existing owner actions and recurring series identity rather than add a second financial engine. Atomic SQL decisions protect manual history confirmation and automatic sync acquisition; small client controls trigger authenticated actions and render status.

**Tech Stack:** Existing Next.js16, React19, TypeScript, Zod, PostgreSQL/Supabase, Vitest, pgTAP, Playwright; no new production dependency.

**Spec:** docs/superpowers/specs/2026-09-12-dashboard-banking-workflows-design.md (approved).

## Global Constraints

- Le solde publié par Qonto reste le point de départ, les transactions historiques ne sont jamais rejouées comme événements prévisionnels.
- L’application fermée ne synchronise pas ; worker, Scaleway et déploiement cloud restent hors périmètre.
- Toutes les mutations restent côté serveur ou dans des RPC propriétaires avec RLS, contrôles d’appartenance et search_path fixé.
- Aucune clé dans Git, HTML, URL, fixtures, logs ou comptes rendus. Logs par liste blanche, sans libellé, montant individuel, IBAN ou payload brut.
- Les migrations déjà appliquées ne sont pas éditées. L’application de toute nouvelle migration sur Supabase hébergé fera l’objet d’une autorisation explicite sur les fichiers préparés et revus ; les autorisations précédentes ne sont pas réutilisées.
- Tests only via dedicated jalon-2-qonto-tests (.isolated-tests), API56321/DB56322/Next3200. Never read/copy actual .env.local, use linked/default CLI for tests, call real Qonto, mutate hosted Supabase, push/merge/deploy. User files untouched. Coordinate .next with controller-owned app3001.
- Read apps/web/AGENTS.md and installed Next guides before web code. Monthly history creation does not lower automatic detection's three-payment threshold. Preserve edits/deletion suppression, published snapshot coherence, stable error codes and existing bounded cancellation.

## File structure and order

1. Categories: reusable picker and existing expense/suggestion forms/actions.
2. History decision: additive SQL, typed owner repository/schema and provenance-aware reads.
3. History UI: dedicated owner page and action, banking row entry, existing category picker.
4. Auto refresh: additive SQL admission, store/orchestrator option, action/client coordinator in layout.
5. Dashboard/navigation: accessible active links, scenario CSS, Qonto badge using Task4 coordinator state.
6. Acceptance/docs: real RPC/browser concurrency/lifecycle and responsive visual checks, no real data.

### Task 1: Category creation in context

**Files:** create apps/web/src/features/expenses/category-picker.tsx and category-picker.test.tsx; modify expenses/actions.ts, expense-form.tsx, their tests; recurring-detection/suggestion-form.tsx and tests; app/(app)/expenses/page.tsx; globals.css only category styles.

**Interfaces:** Extend ExpenseActionState with optional category:{id:string;name:string}. createCategoryAction returns this public object on success while existing messages remain. Export CategoryPicker({categories: {id:string;name:string}[], defaultValue?:string, id:string, name?:string, createAction:ExpenseFormAction}): JSX.Element. Default name categoryId. Picker owns selected value/options, inline creation state, no nested form. Existing forms receive optional createCategoryAction prop; server pages/panel thread actual action. Task3 reuses it.

- [ ] RED accessible picker test with simulated successful action and a parent expense form:
```tsx
expect(screen.getByLabelText('Catégorie')).toHaveValue('');
await user.click(screen.getByRole('button',{name:'Créer une catégorie'}));
// Fill the separately associated category form; submit category only.
expect(screen.getByLabelText('Catégorie')).toHaveValue('new-category-id');
expect(screen.getByLabelText('Libellé')).toHaveValue('Synthetic charge');
expect(document.querySelector('form form')).toBeNull();
```
Use fireEvent if userEvent not installed. Test failure preserves draft/selection, cancel/focus restoration, action owner validation, existing category CRUD/protected system behavior unchanged.
- [ ] Run focused expenses form/actions and suggestion form suites before implementation; record behavioral RED.
- [ ] Return actual inserted category from existing action. Build picker using a separate form outside parent (portal/dialog or form attribute association with a sibling; valid HTML), controlled category select, dedup options byid. Preserve other uncontrolled fields across revalidation.
```ts
const category = await createCategory(client,userId,command);
return {success:true,message:'Catégorie ajoutée.',category:{id:category.id,name:category.name}};
```
- [ ] Add visible Gérer les catégories anchor to existing management panel; open its details if needed. Thread action into create/edit planned/recurring and suggestion confirmation forms, without importing server runtime into client utilities.
- [ ] Run covering unit tests, web typecheck/lint; commit and report exact public props and RED/GREEN.

### Task 2: Atomic history-to-recurring decision and provenance

**Files:** create supabase/migrations/202609120001_history_recurring_decisions.sql and supabase/tests/database/history_recurring.test.sql; create apps/web/src/features/recurring-detection/history-schema.ts, history-repository.ts and tests; modify schema.ts/workspace.ts repository reads/provenance types and minimal dependent fixtures. Existing migration files unchanged.

**Interfaces:** Add recurring_suggestions.creation_source text NOT NULL DEFAULT 'detected', allowed detected|history. RPC confirm_recurring_from_transaction(p_transaction_id uuid,p_source_publication timestamptz,p_command jsonb,p_existing_expense_id uuid DEFAULT NULL,p_allow_duplicate boolean DEFAULT false,p_allow_recreate boolean DEFAULT false) RETURNS uuid. Only authenticated owner; command exact existing confirmation command shape. Return linked recurring id for repeated confirmation of already-confirmed identity, without overriding its fields. Stable existing DETECTION_* codes; dismissed without allow_recreate returns DETECTION_INVALID. No new secret/error payload.

Export HistoryRecurringInput = {transactionId:string;sourcePublication:string;command:ConfirmSuggestionInput['command'];existingExpenseId?:string|null;allowDuplicate?:boolean;allowRecreate?:boolean}; confirmRecurringFromTransaction(client:SupabaseClient,ownerUserId:string,input:HistoryRecurringInput):Promise<string>.
Export getHistoryRecurringWorkspace(client,ownerUserId,transactionId):Promise<HistoryRecurringWorkspace> with {transactionId,sourcePublication,label,amountCents,dayOfMonth,nextDate,currency,seriesState:'pending'|'confirmed'|'dismissed'|null,linkedExpenseId:string|null,possibleDuplicates:{id,label,amountCents}[],existingExpenses:{id,label,amountCents}[],categories:{id,name}[]}. Owner/current publication/timezone required. Use same safe label normalization/truncation and next-date helpers. Whitelist browser fields. RecurringSuggestion.creationSource:'detected'|'history'; propagate origin to existing linked badges without exposing unnecessary identity/evidence ids.

- [ ] RED pgTAP for owner/foreign user, one eligible transaction enough, zero/inflow/pending/reversed/FX/noncurrent rejected, stale publication rejected, positive safe cents and future/later-month date, same-identity double confirmation idempotent, dismissed explicit recreate, existing-charge association unchanged, similar duplicate override, delete suppresses and later analysis preserves decision, one proof counts paid month, automatic publisher still rejects <3proofs.
```sql
select is((select count(*)::int from public.recurring_cashflows),1,'double submit creates one charge');
-- Call as foreign auth.uid and assert rejected; service role cannot bypass owner decision.
```
- [ ] Implement additive column and atomic RPC with integration-first locks compatible with delete statement trigger; reuse normalized-label helper, full-text collision rejection, identity/link uniqueness, category ownership/type validation, explicit duplicate guard. Validate all inputs BEFORE persistent changes. Selection's observed amount remains matching baseline; edited charge amount separate. Pending→confirmed history uses selected proof, detected publisher preserves confirmed/dismissed rows; no fabricated detection evidence. Preserve owner deletion cascade.
- [ ] Add Zod input/workspace parsing and ownership reads; resolve current transaction/account/settings/series under publication bracket, allow only correct projection currency. Reuse page caps/full marker precision. Unit tests validate RPC argument names, unsafe input rejection and safe errors.
```ts
await confirmRecurringFromTransaction(client, ownerId, {transactionId,sourcePublication,command,allowRecreate:false});
// RPC receives p_transaction_id, no browser-supplied owner.
```
- [ ] Run dedicated harness db (including existing concurrency), focused web tests/typecheck; commit and report final contract. Modify exact RLS inventory only if necessary, no weakened assertions.

### Task 3: User creates a recurring charge from bank history

**Files:** create apps/web/src/app/(app)/cashflow/recurring/[transactionId]/page.tsx; create features/recurring-detection/history-actions.ts, history-form.tsx and tests; modify banking/banking-view.tsx/tests and expenses page origin badges. Reuse Task1 CategoryPicker and Task2 owner workspace/RPC.

**Interfaces:** createHistoryRecurringAction(previous:{success:boolean;message:string|null;expenseId?:string},formData:FormData):Promise<same>. Server derivesowner, parses only command and internaltransactionid/publication, invokesTask2RPC, revalidatesexpenses/cashflow/dashboard, returns safe id/message. HistoryForm receives Task2 workspace +action +createCategoryAction; no account/external ids or raw payload props. History page requiresOwner; errors render safe recoverable message/backlink.

- [ ] RED tests: action shown only eligible completed positive outflow active/current account matching currency; href contains internalid only; form defaults monthly/committed, editable values, category creation, explicit recreate warning, association/duplicateoverride, alreadylinked open-existing control, no event before submit.
```tsx
expect(screen.getByRole('link',{name:/Créer une charge récurrente/})).toHaveAttribute('href',`/cashflow/recurring/${transactionId}`);
```
- [ ] Implement row action column and dedicated route; server reloads authoritative source, no financial values in querystring. Use same command fields/certainty semantics as suggestion form. Alreadyconfirmed displays link to existing charge rather than duplicate create. Dismissed requires unchecked explicit recreation consent; duplicates require existing override. Keep return-to-history navigable.
- [ ] Distinguish Créée depuis Qonto vs Détectée depuis Qonto on existing charges, using Task2 provenance. Preserve edit/delete/disable forms and paid-month logic (same existing series identity path).
- [ ] Run covering action/form/banking/page-boundary tests and web typecheck/lint; commit.

### Task 4: Server-admitted automatic Qonto refresh while visible

**Files:** create supabase/migrations/202609120002_automatic_qonto_admission.sql and pgTAP automatic_qonto.test.sql; modify integrations sync-repository.ts/sync-qonto.ts plus packages/integrations/src/sync/contracts.ts/service.ts only compatible optional mode/neutral skip plumbing; create integrations/auto-sync-action.ts, auto-sync-coordinator.tsx, auto-sync-policy.ts/tests; wire app/(app)/layout.tsx. Integration repository may expose only safe freshness/status fields.

**Interfaces:** SQL acquire_automatic_banking_sync(ownerUUID,runUUID) service-only returns same acquire JSON or NULL skip, atomically under integrationlock checks owner, last_success_at>=24hoursold, no live lease, last_auto_attempt_at>=15minold; firstever missingpublication skips. Add integrations.last_auto_attempt_at nullable finite timestamp. After checks, invoke existing acquire RPC in same transaction/lock then stamp automatic attempt, no run onskip. Manual acquire unchanged. No stale unlock/duplicate publication race.

createBankingSyncStore(client,{mode?:'manual'|'automatic'}?) chooses acquire RPC; allow acquire return null forskip. SyncResult adds {success:true;skipped:true} with no created/updated; ordinarysuccess carries optional skipped?:false for compatible narrowing. synchronizeBanking exits neutrally after null before provider/log-success/analysis, still bounded. synchronizeQontoForOwner(owner,{mode?:'manual'|'automatic'}?) carries skip without analysis; adapt current manualaction/hooks/tests safely.

AutoSyncState={phase:'idle'|'checking'|'syncing'|'error';lastErrorCode?:string}; provider/coordinator exposes state to Task5 via useAutoSyncStatus(), default idle outside provider. autoSyncQontoAction():Promise<{status:'skipped'|'synced'|'error';code?:IntegrationErrorCode}>; requireOwner, serverconfigured check, invokeautomaticmode, revalidateviews on bankpublication, preserve separate analysis feedback. Browser cannot selectowner/timestamp/mode. No bankcall fromGET/render.

- [ ] RED SQL admission boundaries: 23:59:59skip,24hexactrun, firsteverskip, futuredate skip,15mincooldown, existingmanuallease skip; simultaneousconnectionsonewinner; a queued contender afterwinnerpublication skips, notsequentialdoublesync.
- [ ] Implement SQL admission and typedskip/cancellation with focused service/store tests. In atomicgate never acquire unconfigured Qonto; configuration checkedserverbeforeRPC. No new retry policy in sharedprovider.
```ts
const result = await synchronizeBanking({...input,store:automaticStore});
expect(result).toEqual({success:true,skipped:true});
expect(provider.listAccounts).not.toHaveBeenCalled();
```
- [ ] Add coordinator mounting once per authenticated layout, checks onmount/focus/visibility andevery300000ms onlyvisible, singleflightref, cleanup, no effect dependency revalidate-loop; stateerror stable, respects servercooldown. Manualbutton sharesSQLlock. Do not falsely mark green oncheck/skip; aftersync refreshrouter without disrupting activeformvalues.
- [ ] Fake-timer component tests: hidden no calls, visiblefocus onecall, five-minuteinterval, unmountcleanup, errorsnotinstantretry, refreshonceonactualsuccess. Safeactionowner/codes and existing120s cancellation/hook tests.
- [ ] Dedicated SQL and actualcontention probes (extend scripts/test-banking-concurrency.mjs or new fixed-container probe wiredharness), focusedunit/typecheck/lint. Commit/reportfinaltypes.

### Task 5: Compact scenario, Qonto freshness badge and active navigation

**Files:** create components/navigation-links.tsx/tests; modify app-shell.tsx/tests; scenario-controls.tsx, kpi-strip.tsx, dashboard view-model/query minimally for ownertimezone, dashboardtests, globals.css; create integrations/qonto-freshness.ts/tests and qonto-badge.tsx/tests; add verified official local logo asset apps/web/public/qonto-logo.svg with source recorded docs/QONTO.md. UseTask4 status context.

**Interfaces:** qontoFreshness({lastSuccessAt:string|null,lastAttemptFailed:boolean,nowMs:number}):'fresh'|'stale'|'error'|'unconfigured'; fresh iff finite,notfuture,age<86400000 andnoerror; threshold86400000 is stale. Badge props lastSuccessAt,timezone,lastAttemptFailed pluscontextprogress; accessiblelocaltime/tooltip, greenonlyfresh. No rawtimestampvisible; manualdateformatted. Never embed providercredentials/externalaccountids.

- [ ] RED freshness exactthreshold/future/invalid/error test; navpathname /invoices/idactive but /invoices-extra not; queryignored; desktop/mobile aria-current; existingmanual/FXfallback visible.
```ts
expect(qontoFreshness({lastSuccessAt:'2026-09-12T12:00:00Z',lastAttemptFailed:false,nowMs:Date.parse('2026-09-13T12:00:00Z')})).toBe('stale');
```
- [ ] Implement clientonlylinklist using installedNext pathname guide, shared by desktop/mobile; keepAppShellserver. Greenlabel/backgroundvisiblefocus.
- [ ] Scenario CSS intentionaltworows:3scenariochoices plus4inclusions; intermediates2x2 andmobileonecolumn. KeepURL/filterdefaultbehavior and accessibletooltip. Fix KPI minimumwidth/wrapping, no financialsemanticschange.
- [ ] Badge uses officialasset from verifiedsource (controller maysupply path), no remoterequests orrawtimestamp, tooltipkeyboard+touchaccessible, currentclockupdates whilemounted; syncspinner/error distinguish. Localize date viaowner timezone. Do not use phraseaujourd’hui foryesterday<24h.
- [ ] Componenttests/UIassertions, lint/typecheck; commit. Actualresponsivevisual check inTask6.

### Task 6: Acceptance, responsive verification and documentation

**Files:** new apps/web/e2e/dashboard-workflows.integration.ts and dashboard-workflows.spec.ts; modify e2e/integration.config.ts, scripts/run-isolated-tests.mjs membership/tests, test-onlyfixtures/preload asneeded; docs/QONTO.md, RECURRING_DETECTION.md, INSTALLATION.md. No productiontestflags/dependencies. Docs newmigrationspendingexplicitapproval.

- [ ] RED realRPC integration: one importeddebit→manualconfirmation→nonemptyfutureevent, samepaymentmonthnotdoubled, edit/delete/resyncsuppression, explicitrecreate andforeignownerrejection; automode stale/fresh/cooldown/noinitialimport withproviderrequests counted; preservebankpublicationwhenanalysisfails.
- [ ] Add browserjourney freshsyntheticowner: createcategory inprefilledform;historycreate/association/recreate;activepage;scenarios/inclusionspreserved;forcebanklastsuccessstale ONLYdedicatedDB thenreload automaticpublication andbadgeupdates. Verify response does not exposeinternalprovidersecrets. Networkfailclosed, no realenv.
- [ ] Responsive checks 1440/1024/390width: horizontalpageoverflow absent, scenariooptions fit, badgefits, active nav works. Screenshots allowed ONLYsynthetic fixture route for explicitvisualverification; traces/videosremainoff. Controller inspect renderedsynthetic screenshots via view_image. Do not captureuser3001session.
```ts
expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
await expect(page.getByRole('link',{name:'Trésorerie',exact:true}).filter({visible:true})).toHaveAttribute('aria-current','page');
```
Use supportedPlaywrightlocatorAPI iffiltervisible unavailable perinstalleddocs.
- [ ] Wire explicit harnesslists; documentfeature flow,24h/5min/15min thresholds, no closedappworker, failurevaliddataretention,manualhistoryvsdetection, newhostedmigrationspending. Run fullunit/tooling/lint/typecheck, isolatedall, fakecanarybuild/clientscan. Reportexactresults; commit.
- [ ] Controller independentfinalverification+wholebranchreview, handleonefinalfixwave andscopedrereview; collectallRulings before scratchcleanup. Askexplicitnewhostedmigrationapproval onlyafterconcreteSQLreview. FinishbranchperSuperpowers, noautomaticpush/merge.
