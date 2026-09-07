import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const { createClient, getOwnerBusinessDate, listExpenseWorkspace, requireOwner } = vi.hoisted(
  () => ({
    createClient: vi.fn(),
    getOwnerBusinessDate: vi.fn(),
    listExpenseWorkspace: vi.fn(),
    requireOwner: vi.fn(),
  }),
);

vi.mock("@/features/expenses/repository", () => ({ listExpenseWorkspace }));
vi.mock("@/features/invoices/business-date", () => ({ getOwnerBusinessDate }));
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
  expect(screen.getByRole("heading", { name: "Hébergement" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Réserve Urssaf" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Créer la sortie récurrente" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Créer la sortie ponctuelle" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Supprimer la sortie Hébergement" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Supprimer la catégorie Logiciels" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Renommer la catégorie Logiciels" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Renommer la catégorie Fiscalité" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Supprimer la catégorie Fiscalité" })).toBeNull();
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
