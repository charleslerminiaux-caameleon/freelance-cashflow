import { describe, expect, it } from "vitest";

import {
  detectMonthlyOutflows,
  nextRecurringDate,
  normalizeRecurringLabel,
  paidMonthsForSeries,
  type DetectionAccount,
  type DetectionTransaction,
} from "./index";

const account: DetectionAccount = {
  id: "account-a",
  currency: "EUR",
  active: true,
  current: true,
};

function transaction(
  id: string,
  transactionDate: string,
  overrides: Partial<DetectionTransaction> = {},
): DetectionTransaction {
  return {
    id,
    accountId: "account-a",
    currency: "EUR",
    label: "ACME CLOUD 42",
    amountCents: 1_000,
    direction: "outflow",
    status: "completed",
    transactionDate,
    ...overrides,
  };
}

function detect(
  transactions: DetectionTransaction[],
  overrides: Partial<{
    today: string;
    currency: string;
    accounts: DetectionAccount[];
  }> = {},
) {
  return detectMonthlyOutflows({
    today: "2026-09-11",
    currency: "EUR",
    accounts: [account],
    transactions,
    ...overrides,
  });
}

describe("normalizeRecurringLabel", () => {
  it("normalizes case, accents, punctuation, and whitespace while preserving digits", () => {
    expect(normalizeRecurringLabel("  Énergie—Café... FACTURE 0042  ")).toBe(
      "energie cafe facture 0042",
    );
  });
});

describe("detectMonthlyOutflows", () => {
  it("detects three coherent consecutive monthly outflows and rejects only two", () => {
    const transactions = ["2026-07-05", "2026-08-06", "2026-09-05"].map(
      (date, index) => transaction(`transaction-${index}`, date),
    );

    expect(detect(transactions)).toMatchObject([
      {
        amountCents: 1_000,
        dayOfMonth: 5,
        nextDate: "2026-10-05",
        transactionIds: ["transaction-0", "transaction-1", "transaction-2"],
      },
    ]);
    expect(detect(transactions.slice(1))).toEqual([]);
  });

  it("uses an inclusive six-calendar-month window with month-end clamping", () => {
    const inWindow = ["02-28", "03-31", "04-30", "05-31", "06-30", "07-31", "08-31"].map(
      (monthAndDay, index) => transaction(`in-${index}`, `2026-${monthAndDay}`),
    );

    expect(detect(inWindow, { today: "2026-08-31" })[0]?.transactionIds).toContain("in-0");
    expect(
      detect([transaction("before", "2026-02-27"), ...inWindow.slice(1)], {
        today: "2026-08-31",
      })[0]?.transactionIds,
    ).not.toContain("before");
    expect(
      detect(
        [
          transaction("jul", "2026-07-05"),
          transaction("aug", "2026-08-05"),
          transaction("future", "2026-09-05"),
        ],
        { today: "2026-08-31" },
      ),
    ).toEqual([]);
  });

  it("validates calendar dates and opaque nonempty IDs", () => {
    expect(() => detect([], { today: "2026-02-30" })).toThrow(
      "Date must be a valid ISO date",
    );
    expect(() => detect([transaction("bad-date", "2026-02-30")])).toThrow(
      "Date must be a valid ISO date",
    );
    expect(() => detect([transaction("", "2026-07-05")])).toThrow(
      "Transaction id must be nonempty",
    );
    expect(() =>
      detect([transaction("ok", "2026-07-05")], {
        accounts: [{ ...account, id: "" }],
      }),
    ).toThrow("Account id must be nonempty");
  });

  it("is deterministic across input permutations and sorts groups and evidence", () => {
    const first = ["2026-07-08", "2026-08-08", "2026-09-08"].map((date, index) =>
      transaction(`z-${index}`, date, { label: "Zulu" }),
    );
    const second = ["2026-07-04", "2026-08-04", "2026-09-04"].map((date, index) =>
      transaction(`a-${index}`, date, { label: "Alpha" }),
    );
    const ordered = detect([...first, ...second]);
    const permuted = detect([...second, ...first].reverse());

    expect(permuted).toEqual(ordered);
    expect(ordered.map((candidate) => candidate.normalizedLabel)).toEqual([
      "alpha",
      "zulu",
    ]);
    expect(ordered[0]?.transactionIds).toEqual(["a-0", "a-1", "a-2"]);
  });

  it("deduplicates identical IDs and rejects every group touched by a conflicting ID", () => {
    const base = [
      transaction("same", "2026-07-05"),
      transaction("aug", "2026-08-05"),
      transaction("sep", "2026-09-05"),
    ];
    expect(detect([base[0]!, ...base])).toHaveLength(1);
    expect(
      detect([...base, transaction("same", "2026-07-06", { amountCents: 1_100 })]),
    ).toEqual([]);
  });

  it("rejects ambiguous months and does not fall back when the latest singleton run is short", () => {
    expect(
      detect([
        transaction("jul-1", "2026-07-05"),
        transaction("jul-2", "2026-07-06"),
        transaction("aug", "2026-08-05"),
        transaction("sep", "2026-09-05"),
      ]),
    ).toEqual([]);

    expect(
      detect(
        [
          transaction("mar", "2026-03-11"),
          transaction("apr", "2026-04-11"),
          transaction("may", "2026-05-11"),
          transaction("aug", "2026-08-11"),
          transaction("sep", "2026-09-11"),
        ],
      ),
    ).toEqual([]);
  });

  it("selects the latest maximal singleton run and does not fall back after a failed check", () => {
    const oldRun = ["2026-04-30", "2026-05-30", "2026-06-30"].map((date, index) =>
      transaction(`old-${index}`, date),
    );
    const latestInvalidRun = ["2026-08-01", "2026-09-08", "2026-10-01"].map(
      (date, index) => transaction(`new-${index}`, date),
    );

    expect(detect([...oldRun, ...latestInvalidRun], { today: "2026-10-31" })).toEqual([]);
  });

  it("excludes zero, inflow, non-completed, foreign-currency, unsafe, and unavailable-account rows", () => {
    const invalidRows: Partial<DetectionTransaction>[] = [
      { amountCents: 0 },
      { direction: "inflow" },
      { status: "pending" },
      { status: "declined" },
      { status: "reversed" },
      { currency: "USD" },
      { amountCents: Number.MAX_SAFE_INTEGER + 1 },
      { amountCents: 10.5 },
    ];
    for (const [index, invalid] of invalidRows.entries()) {
      expect(
        detect([
          transaction(`invalid-${index}`, "2026-07-05", invalid),
          transaction("aug", "2026-08-05"),
          transaction("sep", "2026-09-05"),
        ]),
      ).toEqual([]);
    }

    const valid = ["2026-07-05", "2026-08-05", "2026-09-05"].map((date, index) =>
      transaction(`valid-${index}`, date),
    );
    expect(detect(valid, { accounts: [{ ...account, active: false }] })).toEqual([]);
    expect(detect(valid, { accounts: [{ ...account, current: false }] })).toEqual([]);
    expect(detect(valid, { currency: "USD" })).toEqual([]);
  });

  it("accepts inclusive ten-percent amount boundaries and rounds an even median upward", () => {
    const amounts = [901, 1_000, 1_001, 1_101];
    const dates = ["2026-06-05", "2026-07-05", "2026-08-05", "2026-09-05"];
    expect(
      detect(dates.map((date, index) => transaction(`amount-${index}`, date, { amountCents: amounts[index]! }))),
    ).toMatchObject([{ amountCents: 1_001 }]);

    expect(
      detect([
        transaction("low", "2026-07-05", { amountCents: 900 }),
        transaction("middle", "2026-08-05", { amountCents: 1_000 }),
        transaction("high", "2026-09-05", { amountCents: 1_101 }),
      ]),
    ).toEqual([]);
  });

  it("chooses the largest day on ties, clamps month ends, and enforces three-day error", () => {
    expect(
      detect([
        transaction("jun", "2026-06-04"),
        transaction("jul", "2026-07-06"),
        transaction("aug", "2026-08-04"),
        transaction("sep", "2026-09-06"),
      ]),
    ).toMatchObject([{ dayOfMonth: 6 }]);

    expect(
      detect(
        [
          transaction("jan", "2028-01-31"),
          transaction("feb", "2028-02-29"),
          transaction("mar", "2028-03-31"),
        ],
        { today: "2028-03-31" },
      ),
    ).toMatchObject([{ dayOfMonth: 31, nextDate: "2028-04-30" }]);

    expect(
      detect([
        transaction("jul", "2026-07-01"),
        transaction("aug", "2026-08-08"),
        transaction("sep", "2026-09-01"),
      ]),
    ).toEqual([]);
  });

  it("accepts the freshness boundary at seven days and rejects it one day later", () => {
    const series = ["2026-06-05", "2026-07-05", "2026-08-05"].map((date, index) =>
      transaction(`fresh-${index}`, date),
    );
    expect(detect(series, { today: "2026-09-12" })).toHaveLength(1);
    expect(detect(series, { today: "2026-09-13" })).toEqual([]);
  });

  it("uses the latest payment label truncated safely to the expense limit", () => {
    const longLabel = `Latest ${"x".repeat(200)}`;
    const result = detect([
      transaction("jul", "2026-07-05", { label: longLabel.toUpperCase() }),
      transaction("aug", "2026-08-05", { label: longLabel }),
      transaction("sep", "2026-09-05", { label: longLabel }),
    ]);

    expect(result[0]?.label).toBe(longLabel.slice(0, 160));
  });
});

describe("nextRecurringDate", () => {
  it("returns the first clamped recurrence strictly after today and after the payment month", () => {
    expect(nextRecurringDate(31, "2026-01-31", "2026-02-28")).toBe("2026-03-31");
    expect(nextRecurringDate(31, "2028-01-31", "2028-02-28")).toBe("2028-02-29");
    expect(nextRecurringDate(5, "2026-09-05", "2026-12-05")).toBe("2027-01-05");
  });

  it("validates the day and both dates", () => {
    expect(() => nextRecurringDate(0, "2026-01-01", "2026-01-01")).toThrow(
      "Day of month must be an integer from 1 to 31",
    );
    expect(() => nextRecurringDate(1, "bad", "2026-01-01")).toThrow(
      "Date must be a valid ISO date",
    );
  });
});

describe("paidMonthsForSeries", () => {
  const series = {
    accountId: "account-a",
    currency: "EUR",
    normalizedLabel: "acme cloud 42",
    amountCents: 1_000,
  };

  it("returns unique sorted months for matching completed outflows at inclusive amount bounds", () => {
    expect(
      paidMonthsForSeries(series, [
        transaction("sep", "2026-09-01", { amountCents: 1_100 }),
        transaction("jul", "2026-07-29", { amountCents: 900 }),
        transaction("jul-duplicate", "2026-07-02"),
      ]),
    ).toEqual(["2026-07", "2026-09"]);
  });

  it("has no date window and excludes mismatches, out-of-range amounts, and reversed evidence", () => {
    expect(
      paidMonthsForSeries(series, [
        transaction("old", "2020-01-01"),
        transaction("reversed", "2026-08-01", { status: "reversed" }),
        transaction("large", "2026-09-01", { amountCents: 1_101 }),
        transaction("inflow", "2026-10-01", { direction: "inflow" }),
        transaction("other-account", "2026-11-01", { accountId: "account-b" }),
        transaction("other-currency", "2026-12-01", { currency: "USD" }),
        transaction("other-label", "2027-01-01", { label: "Other" }),
      ]),
    ).toEqual(["2020-01"]);
  });
});
