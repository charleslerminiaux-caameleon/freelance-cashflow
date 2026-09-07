import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import {
  CategoryForm,
  DeleteCategoryForm,
  DeleteExpenseForm,
  ExpenseForm,
} from "./expense-form";

const idleAction = async () => ({ message: null, success: false });
const categories = [{ id: "category-1", name: "Logiciels" }];

it("collects a categorized recurring remuneration without hidden tax calculations", () => {
  render(
    <ExpenseForm
      action={idleAction}
      categories={categories}
      mode="recurring"
      today="2026-09-07"
    />,
  );

  expect(screen.getByLabelText("Type de sortie")).toHaveValue("expense");
  expect(screen.getByLabelText("Catégorie")).toHaveTextContent("Logiciels");
  expect(screen.getByLabelText("Fréquence")).toHaveValue("monthly");
  expect(screen.getByLabelText("Début")).toHaveValue("2026-09-07");
  expect(screen.getByRole("button", { name: "Créer la sortie récurrente" })).toBeInTheDocument();
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
