import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const {
  createClient,
  getOwnerBusinessDate,
  getRecurringSuggestionWorkspace,
  listExpenseWorkspace,
  requireOwner,
} = vi.hoisted(
  () => ({
    createClient: vi.fn(),
    getOwnerBusinessDate: vi.fn(),
    getRecurringSuggestionWorkspace: vi.fn(),
    listExpenseWorkspace: vi.fn(),
    requireOwner: vi.fn(),
  }),
);

vi.mock("@/features/expenses/repository", () => ({ listExpenseWorkspace }));
vi.mock("@/features/invoices/business-date", () => ({ getOwnerBusinessDate }));
vi.mock("@/features/recurring-detection/repository", () => ({
  getRecurringSuggestionWorkspace,
}));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import ExpensesPage from "./page";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const categoryId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  requireOwner.mockResolvedValue({ userId: ownerUserId });
  createClient.mockResolvedValue({ kind: "SSR client" });
  getOwnerBusinessDate.mockResolvedValue("2026-09-07");
  getRecurringSuggestionWorkspace.mockResolvedValue({
    suggestions: [],
    ignored: [],
    linkedExpenseIds: ["33333333-3333-4333-8333-333333333333"],
    lastAnalyzedAt: null,
    analysisError: null,
  });
  listExpenseWorkspace.mockResolvedValue({
    categories: [
      {
        id: categoryId,
        owner_user_id: ownerUserId,
        name: "Logiciels",
        type: "outflow",
        system_category: false,
        created_at: "2026-09-07T10:00:00Z",
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        owner_user_id: ownerUserId,
        name: "Fiscalité",
        type: "outflow",
        system_category: true,
        created_at: "2026-09-07T10:00:00Z",
      },
    ],
    recurringExpenses: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        owner_user_id: ownerUserId,
        direction: "outflow",
        cashflow_kind: "expense",
        label: "Hébergement",
        category_id: categoryId,
        amount_cents: 9_900,
        frequency: "monthly",
        day_of_month: 7,
        start_date: "2026-09-07",
        end_date: null,
        certainty: "certain",
        probability_basis_points: 10_000,
        active: true,
        created_at: "2026-09-07T10:00:00Z",
        updated_at: "2026-09-07T10:00:00Z",
      },
    ],
    plannedExpenses: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        owner_user_id: ownerUserId,
        direction: "outflow",
        cashflow_kind: "reserve",
        label: "Réserve Urssaf",
        amount_cents: 120_000,
        planned_date: "2026-10-15",
        category_id: categoryId,
        certainty: "committed",
        probability_basis_points: 10_000,
        status: "planned",
        created_at: "2026-09-07T10:00:00Z",
        updated_at: "2026-09-07T10:00:00Z",
      },
    ],
  });
});

it("renders persisted recurring and planned outflows with owner-scoped CRUD controls", async () => {
  render(await ExpensesPage());

  expect(requireOwner).toHaveBeenCalledOnce();
  expect(createClient).toHaveBeenCalledOnce();
  expect(listExpenseWorkspace).toHaveBeenCalledWith({ kind: "SSR client" }, ownerUserId);
  expect(getOwnerBusinessDate).toHaveBeenCalledWith({ kind: "SSR client" }, ownerUserId);
  expect(screen.getByRole("heading", { level: 1, name: "Charges et réserves" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Gérer les catégories" })).toHaveAttribute(
    "href",
    "#expense-categories",
  );
  expect(screen.getByRole("region", { name: "Catégories de sorties" })).toHaveAttribute(
    "id",
    "expense-categories",
  );
  expect(screen.getByRole("heading", { name: "Hébergement" })).toBeInTheDocument();
  expect(screen.getByText("Détectée depuis Qonto")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Réserve Urssaf" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Créer la sortie récurrente" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Créer la sortie ponctuelle" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Supprimer la sortie Hébergement" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Supprimer la catégorie Logiciels" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Renommer la catégorie Logiciels" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Renommer la catégorie Fiscalité" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Supprimer la catégorie Fiscalité" })).toBeNull();
  expect(screen.getAllByRole("button", { name: "Créer une catégorie" })).toHaveLength(4);
  expect(screen.getByText(/ne constituent pas un calcul fiscal ou social officiel/i)).toBeInTheDocument();
});

it("shows an honest empty state instead of example financial records", async () => {
  listExpenseWorkspace.mockResolvedValue({
    categories: [],
    recurringExpenses: [],
    plannedExpenses: [],
  });

  render(await ExpensesPage());

  expect(screen.getByRole("heading", { name: "Aucune sortie configurée" })).toBeInTheDocument();
  expect(screen.getByText(/vos charges réelles apparaîtront ici/i)).toBeInTheDocument();
});

it("loads owner suggestions and keeps pending rows out of configured expense totals", async () => {
  getRecurringSuggestionWorkspace.mockResolvedValue({
    suggestions: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        state: "pending",
        eligible: true,
        label: "Cloud synthétique",
        amountCents: 9_900,
        dayOfMonth: 7,
        nextDate: "2026-10-07",
        lastPaymentDate: "2026-09-07",
        sourcePublication: "2026-09-11T10:00:00Z",
        linkedExpenseId: null,
        accountId: "77777777-7777-4777-8777-777777777777",
        currency: "EUR",
        normalizedLabel: "cloud synthetique",
        evidence: [
          {
            id: "88888888-8888-4888-8888-888888888888",
            label: "Cloud synthétique juillet",
            amountCents: 9_900,
            transactionDate: "2026-07-07",
          },
        ],
        possibleDuplicates: [],
      },
    ],
    ignored: [],
    linkedExpenseIds: [],
    lastAnalyzedAt: "2026-09-11T10:00:00Z",
    analysisError: null,
  });

  render(await ExpensesPage());

  expect(getRecurringSuggestionWorkspace).toHaveBeenCalledWith(
    { kind: "SSR client" },
    ownerUserId,
  );
  expect(screen.getByRole("heading", { name: "Récurrences à confirmer" })).toBeInTheDocument();
  expect(screen.getByText("Cloud synthétique")).toBeInTheDocument();
  expect(
    screen.getByLabelText("Charge mensuelle existante pour Cloud synthétique"),
  ).toHaveTextContent("Hébergement");
  expect(screen.getByText(/aucun effet sur la trésorerie avant confirmation/i)).toBeInTheDocument();
  expect(screen.getByText("2 sorties")).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent("cloud synthetique");
  expect(document.body).not.toHaveTextContent("77777777-7777-4777-8777-777777777777");
});

it("keeps the expense workspace available when suggestions cannot be loaded", async () => {
  getRecurringSuggestionWorkspace.mockRejectedValue(new Error("private database detail"));

  render(await ExpensesPage());

  expect(screen.getByRole("heading", { name: "Hébergement" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    /impossible de charger les suggestions.*réessayez/i,
  );
  expect(document.body).not.toHaveTextContent("private database detail");
});
