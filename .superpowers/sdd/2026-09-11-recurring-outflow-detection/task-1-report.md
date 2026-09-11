# Task 1 report: pure monthly detection and paid-month engine

## Implemented

- Added the exact public detection input, account, transaction, and candidate types and exported them from `@fc/domain`.
- Added conservative label normalization, monthly candidate detection, future recurrence calculation, and paid-month matching as pure domain functions.
- Detection validates all calendar dates with shared `localDate` and rejects empty account or transaction IDs.
- Detection uses the inclusive six-calendar-month window with month-end clamping, exact-ID deduplication, group rejection on conflicting duplicates, active/current projection-currency accounts, completed positive safe-integer outflows, and deterministic group/evidence ordering.
- Candidate selection uses the latest maximal run of consecutive singleton months, requires at least three months, computes an upward-rounded median with `BigInt`, compares the inclusive percentage tolerance with `BigInt`, fits days 1 through 31 after month-end clamping with the larger day winning ties, enforces the day and freshness limits, and never falls back to an older run.
- Candidate labels come from the latest payment and are limited to the expense form's 160-character maximum. The next date is in a month after the last observed payment and strictly after today.
- Paid-month matching has no time/day window. It returns unique sorted months only for same-account, same-currency, same-normalized-label, completed positive outflows within the inclusive amount tolerance. Reversed current rows do not count.

## Normalization contract for SQL parity

The JavaScript pipeline is exactly:

1. `label.normalize("NFD")`
2. `.replace(/\p{M}+/gu, "")` to remove Unicode combining marks
3. `.toLowerCase()`
4. `.replace(/[^\p{L}\p{N}]+/gu, " ")` to replace every run outside Unicode Letter or Unicode Number categories with one ASCII space
5. `.trim()`

This preserves all characters in Unicode category `N`, not only ASCII or Unicode decimal digits. SQL normalization must match that distinction as well as the NFD order.

## TDD evidence

RED was run before any production implementation:

```text
corepack pnpm --filter @fc/domain test:run src/recurring-detection.test.ts
Test Files  1 failed (1)
Tests  17 failed (17)
Representative failure: TypeError: detectMonthlyOutflows is not a function
```

This was the expected behavioral failure because the requested public functions did not yet exist. An initial harness error from a missing Vitest import was corrected before capturing the behavioral RED above.

Focused GREEN after implementation:

```text
corepack pnpm --filter @fc/domain test:run src/recurring-detection.test.ts
Test Files  1 passed (1)
Tests  17 passed (17)
```

After self-review tightened two sequence fixtures, the same focused command remained 17/17 passing.

Full domain verification, run once after focused GREEN:

```text
corepack pnpm --filter @fc/domain test:run
Test Files  6 passed (6)
Tests  56 passed (56)
```

```text
corepack pnpm --filter @fc/domain typecheck
tsc --noEmit
Exit status 0
```

`git diff --check` also completed with no errors.

## Files changed

- `packages/domain/src/recurring-detection-types.ts`
- `packages/domain/src/recurring-detection-dates.ts`
- `packages/domain/src/recurring-detection.ts`
- `packages/domain/src/recurring-detection.test.ts`
- `packages/domain/src/index.ts`
- `.superpowers/sdd/2026-09-11-recurring-outflow-detection/task-1-report.md`

## Self-review

- Confirmed all required root exports have the exact requested names and structural shapes.
- Confirmed the detector is insensitive to transaction input ordering, including identical duplicate rows and conflict rejection.
- Confirmed boundary coverage for the calendar window, percentage tolerance, calendar-day tolerance, freshness grace, month ends, leap years, and strictly-future recurrence.
- Tightened interrupted-run fixtures during review so the older run is genuinely long enough to distinguish sequence selection intent.
- No unrelated files were changed. No external API, Qonto account, hosted database, environment file, or running application was accessed.

## Concerns

None.
