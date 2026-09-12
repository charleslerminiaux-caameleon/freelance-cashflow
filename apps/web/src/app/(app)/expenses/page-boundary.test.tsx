import { render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import type { SuggestionPanelProps } from "@/features/recurring-detection/suggestion-panel";
import { createCategoryAction } from "@/features/expenses/actions";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getOwnerBusinessDate: vi.fn(),
  getRecurringSuggestionWorkspace: vi.fn(),
  listExpenseWorkspace: vi.fn(),
  requireOwner: vi.fn(),
  suggestionPanel: vi.fn<(props: SuggestionPanelProps) => null>().mockReturnValue(null),
}));

vi.mock("@/features/expenses/repository", () => ({
  listExpenseWorkspace: mocks.listExpenseWorkspace,
}));
vi.mock("@/features/invoices/business-date", () => ({
  getOwnerBusinessDate: mocks.getOwnerBusinessDate,
}));
vi.mock("@/features/recurring-detection/repository", () => ({
  getRecurringSuggestionWorkspace: mocks.getRecurringSuggestionWorkspace,
}));
vi.mock("@/features/recurring-detection/suggestion-panel", () => ({
  SuggestionPanel: mocks.suggestionPanel,
}));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import ExpensesPage from "./page";

const ownerId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOwner.mockResolvedValue({ userId: ownerId });
  mocks.createClient.mockResolvedValue({ kind: "authenticated-client" });
  mocks.getOwnerBusinessDate.mockResolvedValue("2026-09-11");
  mocks.listExpenseWorkspace.mockResolvedValue({
    categories: [],
    recurringExpenses: [],
    plannedExpenses: [],
  });
  mocks.getRecurringSuggestionWorkspace.mockResolvedValue({
    suggestions: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        state: "pending",
        eligible: true,
        label: "Libellé synthétique",
        amountCents: 10_000,
        dayOfMonth: 9,
        nextDate: "2026-10-09",
        lastPaymentDate: "2026-09-09",
        sourcePublication: "2026-09-11T10:00:00Z",
        linkedExpenseId: null,
        accountId: "33333333-3333-4333-8333-333333333333",
        currency: "EUR",
        normalizedLabel: "libelle synthetique",
        evidence: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            label: "Paiement synthétique",
            amountCents: 10_000,
            transactionDate: "2026-09-09",
          },
        ],
        possibleDuplicates: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            label: "Charge synthétique",
            amountCents: 10_000,
          },
        ],
      },
    ],
    ignored: [],
    linkedExpenseOrigins: {},
    linkedExpenseIds: [],
    lastAnalyzedAt: "2026-09-11T10:00:00Z",
    analysisError: null,
  });
});

it("passes display-only evidence and duplicate warnings to the client panel", async () => {
  render(await ExpensesPage());

  expect(mocks.suggestionPanel).toHaveBeenCalledOnce();
  const panelProps = mocks.suggestionPanel.mock.calls[0]![0];
  expect(panelProps.createCategoryAction).toBe(createCategoryAction);
  const review = panelProps.suggestions[0]!;
  expect(review.evidence).toEqual([
    {
      label: "Paiement synthétique",
      amountCents: 10_000,
      transactionDate: "2026-09-09",
    },
  ]);
  expect(review.possibleDuplicates).toEqual([
    {
      label: "Charge synthétique",
      amountCents: 10_000,
    },
  ]);
  expect(Object.keys(review.evidence[0]!)).not.toContain("id");
  expect(Object.keys(review.possibleDuplicates[0]!)).not.toContain("id");
});
