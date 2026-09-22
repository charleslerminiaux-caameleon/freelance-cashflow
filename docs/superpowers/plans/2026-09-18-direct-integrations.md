# Direct integrations implementation plan

**Goal:** Add usable read-only Pennylane, Revolut Business and bunq integrations without an aggregator.
**Architecture:** Server-only adapters normalize official API responses. Banking adapters reuse atomic staging/publication with provider-scoped locks. Pennylane uses a single atomic invoice/customer publication RPC with external identities and prevents local payment edits on imported invoices. Server actions require the owner and never accept credentials from the browser. Existing Qonto behavior remains intact.
**Tech Stack:** Next.js, TypeScript, Zod, Supabase/PostgreSQL, Vitest.
**Spec:** User approval in current conversation: integrate Pennylane and directly accessible banks without Bridge; local installation by a freelancer.

## Constraints and decisions
- Keep existing uncommitted work in the current checkout; no commits or deployment of unrelated changes.
- No live financial API calls without user credentials/configuration; fixtures use documented contracts.
- Pennylane Company API v2, Essential or higher; Revolut Business Grow or higher; bunq production API key from the user's app.
- Exclude traditional banks whose documented access requires a regulated third party.
- No payments initiated. No raw API payloads, secrets or full IBANs persisted/logged.
- No production database migration applied in this task. Verify migrations in an isolated test database where available.

## Tasks
- [x] API adapters: tests first for Pennylane invoices/customer lookup, exact decimal money, pagination, auth failures and malformed data. Export a complete normalized snapshot plus skipped draft/credit-note counts. Abort rather than partially publish on failure.
- [x] Banking adapters: tests first for Revolut (READ OAuth with refresh) and bunq (installation/device/session authentication). Normalize accounts/transactions; bound pagination, timeout and response sizes; preserve currencies and stable external IDs.
- [x] Database: provider-scoped banking acquire/lock/publish/fail; Pennylane atomic publication mapping customers and invoices by external ID, reject conflicting invoice numbers and local payment overrides; owner isolation and replay/concurrency tests.
- [x] App: environment config, owner-authenticated actions, status and configuration guides for each connector, invoices read-only when provider managed, banking views accept the new providers.
- [x] Verification: adapter and UI suites, typecheck/lint, isolated database tests, code review and fixes. Document setup, entitlement requirements, unsupported cases and live validation remaining.

## Verification record

- Adapter unit tests, owner actions, SQL persistence guards and multi-bank snapshot tests pass.
- Dedicated SQL stack: 659 assertions and banking/recurring contention + restore probes pass.
- Actual Supabase RPC integration: 10 tests pass across 5 suites, including new Pennylane/Revolut HTTP fixtures.
- Production build and browser bundle server-boundary inspection pass.
- Review findings fixed: Revolut equal-timestamp boundary overlap; Pennylane ambiguous publication response retry using the same run ID.
- No production migration or live financial credential validation performed.
- Final unit/tooling verification: 848 tests pass; lint and workspace typecheck pass. Chromium integration-card/Qonto regression passes.
