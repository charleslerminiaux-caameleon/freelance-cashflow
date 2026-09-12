import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import {
  CategoryForm,
  DeleteCategoryForm,
  DeleteExpenseForm,
  ExpenseForm,
  UpdateCategoryForm,
} from "./expense-form";

const idleAction = async () => ({ message: null, success: false });
const categories = [{ id: "category-1", name: "Logiciels" }];

it("collects a categorized recurring remuneration without hidden tax calculations", () => {
  render(
    <ExpenseForm
      action={idleAction}
      categories={categories}
      createCategoryAction={idleAction}
      mode="recurring"
      today="2026-09-07"
    />,
  );

  expect(screen.getByLabelText("Type de sortie")).toHaveValue("expense");
  expect(screen.getByLabelText("Catégorie")).toHaveTextContent("Logiciels");
  expect(screen.getByRole("button", { name: "Créer une catégorie" })).toBeInTheDocument();
  expect(screen.getByLabelText("Fréquence")).toHaveValue("monthly");
  expect(screen.getByLabelText("Début")).toHaveValue("2026-09-07");
  expect(screen.getByRole("button", { name: "Créer la sortie récurrente" })).toBeInTheDocument();
});

it("warns when a Qonto-linked expense is edited away from monthly", () => {
  render(
    <ExpenseForm
      action={idleAction}
      categories={categories}
      mode="recurring"
      today="2026-09-07"
      linkedFromQonto
      value={{
        id: "11111111-1111-4111-8111-111111111111",
        label: "Hébergement",
        categoryId: "",
        cashflowKind: "expense",
        amount: "99,00",
        frequency: "monthly",
        dayOfMonth: 7,
        startDate: "2026-09-07",
        endDate: "",
        certainty: "committed",
        probabilityPercent: "100",
        active: true,
      }}
    />,
  );

  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.change(screen.getByLabelText("Fréquence"), { target: { value: "quarterly" } });
  expect(screen.getByRole("alert")).toHaveTextContent(
    /exclusion des mois déjà payés.*mensuelles/i,
  );
});

it("collects a one-off reserve", () => {
  render(
    <ExpenseForm action={idleAction} categories={categories} mode="planned" today="2026-09-07" />,
  );

  expect(screen.getByLabelText("Date prévue")).toHaveValue("2026-09-07");
  expect(screen.getByRole("button", { name: "Créer la sortie ponctuelle" })).toBeInTheDocument();
});

it("requires explicit confirmation before deleting an expense", () => {
  let submissions = 0;
  const action = async () => {
    submissions += 1;
    return { message: "Sortie supprimée.", success: true };
  };
  render(
    <DeleteExpenseForm
      action={action}
      expenseId="expense-1"
      expenseLabel="Hébergement"
      mode="recurring"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Supprimer la sortie Hébergement" }));

  expect(submissions).toBe(0);
  expect(
    screen.getByRole("button", { name: "Confirmer la suppression de la sortie Hébergement" }),
  ).toBeInTheDocument();
});

it("offers creation of a useful expense category", () => {
  render(<CategoryForm action={idleAction} />);

  expect(screen.getByLabelText("Nom de la catégorie")).toBeRequired();
  expect(screen.getByRole("button", { name: "Ajouter la catégorie" })).toBeInTheDocument();
});

it("offers an accessible rename form with action feedback", async () => {
  const action = async () => ({ message: "Catégorie renommée.", success: true });
  render(
    <UpdateCategoryForm
      action={action}
      categoryId="category-1"
      categoryName="Logiciels"
    />,
  );

  expect(screen.getByLabelText("Nouveau nom de la catégorie Logiciels")).toHaveValue("Logiciels");
  fireEvent.click(screen.getByRole("button", { name: "Renommer la catégorie Logiciels" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Catégorie renommée.");
});

it("requires explicit confirmation before deleting a category", () => {
  render(
    <DeleteCategoryForm
      action={idleAction}
      categoryId="category-1"
      categoryName="Logiciels"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Supprimer la catégorie Logiciels" }));

  expect(
    screen.getByRole("button", { name: "Confirmer la suppression de la catégorie Logiciels" }),
  ).toBeInTheDocument();
});
