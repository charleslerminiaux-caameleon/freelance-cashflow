import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { localDate } from "@fc/shared";
import { expect, it, vi } from "vitest";

import { HistoryForm, type HistoryFormWorkspace } from "./history-form";

const transactionId = "11111111-1111-4111-8111-111111111111";
const existingExpenseId = "22222222-2222-4222-8222-222222222222";
const categoryId = "33333333-3333-4333-8333-333333333333";

const workspace: HistoryFormWorkspace = {
  transactionId,
  sourcePublication: "2026-09-11T10:00:00.123456Z",
  label: "Cloud synthétique",
  amountCents: 12_345,
  dayOfMonth: 9,
  nextDate: localDate("2026-10-09"),
  currency: "EUR",
  seriesState: null,
  possibleDuplicates: [{ label: "Cloud déjà saisi", amountCents: 12_000 }],
  existingExpenses: [
    { id: existingExpenseId, label: "Cloud déjà saisi", amountCents: 12_000 },
  ],
  categories: [{ id: categoryId, name: "Logiciels" }],
};

const idleAction = async () => ({ success: false, message: null });

it("shows monthly committed defaults and editable authoritative values without submitting", () => {
  const action = vi.fn(idleAction);
  render(
    <HistoryForm
      action={action}
      createCategoryAction={idleAction}
      workspace={workspace}
    />,
  );

  expect(screen.getByLabelText("Fréquence")).toHaveValue("monthly");
  expect(screen.getByLabelText("Fréquence")).toBeDisabled();
  expect(screen.getByLabelText("Libellé")).toHaveValue("Cloud synthétique");
  expect(screen.getByLabelText("Montant")).toHaveValue("123,45");
  expect(screen.getByLabelText("Jour du mois")).toHaveValue(9);
  expect(screen.getByLabelText("Première échéance")).toHaveValue("2026-10-09");
  expect(screen.getByLabelText("Catégorie")).toHaveValue("");
  expect(screen.getByLabelText("Niveau de certitude")).toHaveValue("committed");
  expect(screen.getByLabelText("Probabilité (%)")).toHaveValue(100);
  expect(screen.getByRole("button", { name: "Créer une catégorie" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Libellé"), { target: { value: "Cloud corrigé" } });
  expect(screen.getByLabelText("Libellé")).toHaveValue("Cloud corrigé");
  expect(action).not.toHaveBeenCalled();
});

it("submits edited values and lets the new category picker preserve the draft", async () => {
  const received: FormData[] = [];
  const action = vi.fn(async (_state, data: FormData) => {
    received.push(data);
    return { success: true, message: "Charge créée.", expenseId: existingExpenseId };
  });
  const createCategoryAction = vi.fn(async () => ({
    success: true,
    message: "Catégorie ajoutée.",
    category: { id: "44444444-4444-4444-8444-444444444444", name: "SaaS" },
  }));
  render(
    <HistoryForm
      action={action}
      createCategoryAction={createCategoryAction}
      workspace={workspace}
    />,
  );

  fireEvent.change(screen.getByLabelText("Libellé"), { target: { value: "Cloud corrigé" } });
  fireEvent.click(screen.getByRole("button", { name: "Créer une catégorie" }));
  fireEvent.change(screen.getByLabelText("Nom de la nouvelle catégorie"), {
    target: { value: "SaaS" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ajouter la catégorie" }));

  await waitFor(() => expect(screen.getByLabelText("Catégorie")).toHaveValue(
    "44444444-4444-4444-8444-444444444444",
  ));
  expect(screen.getByLabelText("Libellé")).toHaveValue("Cloud corrigé");
  fireEvent.click(screen.getByRole("button", { name: "Créer la charge récurrente" }));

  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  expect(received[0]?.get("transactionId")).toBe(transactionId);
  expect(received[0]?.get("sourcePublication")).toBe("2026-09-11T10:00:00.123456Z");
  expect(received[0]?.get("label")).toBe("Cloud corrigé");
  expect(received[0]?.get("categoryId")).toBe("44444444-4444-4444-8444-444444444444");
  expect(await screen.findByRole("link", { name: "Ouvrir la charge" })).toHaveAttribute(
    "href",
    `/expenses#recurring-expense-${existingExpenseId}`,
  );
});

it("requires separate unchecked consent to recreate a dismissed series", () => {
  render(
    <HistoryForm
      action={idleAction}
      createCategoryAction={idleAction}
      workspace={{ ...workspace, seriesState: "dismissed" }}
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent(/recréation volontaire/i);
  const consent = screen.getByLabelText(/recréer cette charge malgré la décision précédente/i);
  expect(consent).not.toBeChecked();
  expect(consent).toBeRequired();
});

it("offers association and hides duplicate override once an existing charge is selected", () => {
  render(
    <HistoryForm
      action={idleAction}
      createCategoryAction={idleAction}
      workspace={workspace}
    />,
  );

  expect(screen.getByText(/charge mensuelle similaire existe/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Créer quand même une nouvelle charge/i)).not.toBeChecked();
  fireEvent.change(screen.getByLabelText("Charge mensuelle existante"), {
    target: { value: existingExpenseId },
  });
  expect(screen.queryByLabelText(/Créer quand même une nouvelle charge/i)).toBeNull();
  expect(screen.getByRole("button", { name: "Associer à la charge existante" })).toBeInTheDocument();
});

it("prevents a second submit while the owner action is pending", async () => {
  let resolve!: (value: { success: boolean; message: string | null }) => void;
  const action = vi.fn(
    () => new Promise<{ success: boolean; message: string | null }>((done) => (resolve = done)),
  );
  render(
    <HistoryForm
      action={action}
      createCategoryAction={idleAction}
      workspace={{ ...workspace, possibleDuplicates: [] }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Créer la charge récurrente" }));
  expect(await screen.findByRole("button", { name: "Création en cours…" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Création en cours…" }));
  expect(action).toHaveBeenCalledOnce();
  await act(async () => resolve({ success: true, message: "Charge créée." }));
});
