import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getHistoryRecurringWorkspace: vi.fn(),
  historyForm: vi.fn(),
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/recurring-detection/history-repository", () => ({
  getHistoryRecurringWorkspace: mocks.getHistoryRecurringWorkspace,
}));
vi.mock("@/features/recurring-detection/history-form", () => ({
  HistoryForm: (props: unknown) => {
    mocks.historyForm(props);
    return <div data-testid="history-form" />;
  },
}));

const ownerId = "11111111-1111-4111-8111-111111111111";
const transactionId = "22222222-2222-4222-8222-222222222222";
const expenseId = "33333333-3333-4333-8333-333333333333";
const duplicateId = "44444444-4444-4444-8444-444444444444";
const categoryId = "55555555-5555-4555-8555-555555555555";
const workspace = {
  transactionId,
  sourcePublication: "2026-09-11T10:00:00.123456Z",
  label: "Cloud synthétique",
  amountCents: 12_345,
  dayOfMonth: 9,
  nextDate: "2026-10-09",
  currency: "EUR",
  seriesState: null,
  linkedExpenseId: null,
  possibleDuplicates: [{ id: duplicateId, label: "Cloud proche", amountCents: 12_000 }],
  existingExpenses: [{ id: expenseId, label: "Cloud existant", amountCents: 12_000 }],
  categories: [{ id: categoryId, name: "Logiciels" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOwner.mockResolvedValue({ userId: ownerId });
  mocks.createClient.mockResolvedValue({ kind: "authenticated-client" });
  mocks.getHistoryRecurringWorkspace.mockResolvedValue(workspace);
});

it("loads the authoritative owner workspace and passes only required browser fields", async () => {
  const { default: HistoryRecurringPage } = await import("./page");

  render(await HistoryRecurringPage({ params: Promise.resolve({ transactionId }) }));

  expect(mocks.requireOwner).toHaveBeenCalledOnce();
  expect(mocks.getHistoryRecurringWorkspace).toHaveBeenCalledWith(
    { kind: "authenticated-client" },
    ownerId,
    transactionId,
  );
  expect(screen.getByRole("heading", { name: "Créer une charge récurrente" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Retour à l’historique bancaire" })).toHaveAttribute(
    "href",
    "/cashflow#banking-history",
  );
  expect(mocks.historyForm).toHaveBeenCalledOnce();
  const props = mocks.historyForm.mock.calls[0]?.[0] as {
    workspace: Record<string, unknown> & { possibleDuplicates: Record<string, unknown>[] };
  };
  expect(props.workspace).not.toHaveProperty("linkedExpenseId");
  expect(props.workspace.possibleDuplicates[0]).toEqual({
    label: "Cloud proche",
    amountCents: 12_000,
  });
  expect(JSON.stringify(props)).not.toContain(duplicateId);
});

it("opens the actual linked charge instead of rendering another creation form", async () => {
  mocks.getHistoryRecurringWorkspace.mockResolvedValue({
    ...workspace,
    seriesState: "confirmed",
    linkedExpenseId: expenseId,
  });
  const { default: HistoryRecurringPage } = await import("./page");

  render(await HistoryRecurringPage({ params: Promise.resolve({ transactionId }) }));

  expect(screen.getByText(/déjà associée à une charge récurrente/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ouvrir la charge existante" })).toHaveAttribute(
    "href",
    `/expenses#recurring-expense-${expenseId}`,
  );
  expect(screen.queryByTestId("history-form")).toBeNull();
});

it("renders a safe recoverable state when the source is invalid or unavailable", async () => {
  mocks.getHistoryRecurringWorkspace.mockRejectedValue(new Error("private database payload"));
  const { default: HistoryRecurringPage } = await import("./page");

  render(await HistoryRecurringPage({ params: Promise.resolve({ transactionId }) }));

  expect(screen.getByRole("alert")).toHaveTextContent(
    /impossible de préparer cette charge.*historique bancaire.*réessayez/i,
  );
  expect(document.body).not.toHaveTextContent("private database payload");
  expect(screen.getByRole("link", { name: "Retour à l’historique bancaire" })).toBeInTheDocument();
  expect(screen.queryByTestId("history-form")).toBeNull();
});

it("does not read the transaction workspace for a nonowner", async () => {
  mocks.requireOwner.mockRejectedValue(new Error("redirect"));
  const { default: HistoryRecurringPage } = await import("./page");

  await expect(
    HistoryRecurringPage({ params: Promise.resolve({ transactionId }) }),
  ).rejects.toThrow("redirect");

  expect(mocks.createClient).not.toHaveBeenCalled();
  expect(mocks.getHistoryRecurringWorkspace).not.toHaveBeenCalled();
});
