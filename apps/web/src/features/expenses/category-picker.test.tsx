import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { CategoryPicker } from "./category-picker";

const categories = [{ id: "existing-category-id", name: "Logiciels" }];

it("creates and selects a category without submitting or clearing the parent expense form", async () => {
  const parentAction = vi.fn();
  const received: FormData[] = [];
  const createAction = vi.fn(async (_state, formData: FormData) => {
    received.push(formData);
    return {
      message: "Catégorie ajoutée.",
      success: true,
      category: { id: "new-category-id", name: "Télécoms" },
    };
  });

  render(
    <form action={parentAction}>
      <label htmlFor="expense-label">Libellé</label>
      <input id="expense-label" name="label" defaultValue="Initial label" />
      <label htmlFor="expense-category">Catégorie</label>
      <CategoryPicker
        categories={categories}
        createAction={createAction}
        id="expense-category"
      />
    </form>,
  );

  fireEvent.change(screen.getByLabelText("Libellé"), {
    target: { value: "Synthetic charge" },
  });
  expect(screen.getByLabelText("Catégorie")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Créer une catégorie" }));
  fireEvent.change(screen.getByLabelText("Nom de la nouvelle catégorie"), {
    target: { value: "Télécoms" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ajouter la catégorie" }));

  await waitFor(() => expect(screen.getByLabelText("Catégorie")).toHaveValue("new-category-id"));
  expect(screen.getByLabelText("Catégorie")).toHaveTextContent("Télécoms");
  expect(screen.getByLabelText("Libellé")).toHaveValue("Synthetic charge");
  expect(received[0]?.get("name")).toBe("Télécoms");
  expect(received[0]?.get("label")).toBeNull();
  expect(parentAction).not.toHaveBeenCalled();
  expect(document.querySelector("form form")).toBeNull();
});

it("preserves the draft and selection when category creation fails", async () => {
  const createAction = vi.fn(async () => ({
    message: "Impossible d’ajouter cette catégorie.",
    success: false,
  }));

  render(
    <form>
      <label htmlFor="expense-label">Libellé</label>
      <input id="expense-label" name="label" defaultValue="Initial label" />
      <label htmlFor="expense-category">Catégorie</label>
      <CategoryPicker
        categories={categories}
        createAction={createAction}
        id="expense-category"
      />
    </form>,
  );

  fireEvent.change(screen.getByLabelText("Libellé"), {
    target: { value: "Edited draft charge" },
  });
  fireEvent.change(screen.getByLabelText("Catégorie"), {
    target: { value: "existing-category-id" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Créer une catégorie" }));
  const nameInput = screen.getByLabelText("Nom de la nouvelle catégorie");
  fireEvent.change(nameInput, { target: { value: "Doublon" } });
  fireEvent.click(screen.getByRole("button", { name: "Ajouter la catégorie" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Impossible d’ajouter cette catégorie.",
  );
  expect(screen.getByLabelText("Libellé")).toHaveValue("Edited draft charge");
  expect(screen.getByLabelText("Catégorie")).toHaveValue("existing-category-id");
  expect(screen.getByLabelText("Nom de la nouvelle catégorie")).toHaveValue("Doublon");
  expect(document.querySelector("form form")).toBeNull();
});

it("focuses category creation and restores focus when it is cancelled", async () => {
  render(
    <CategoryPicker
      categories={categories}
      createAction={async () => ({ message: null, success: false })}
      id="standalone-category"
      name="customCategoryId"
    />,
  );

  const createButton = screen.getByRole("button", { name: "Créer une catégorie" });
  fireEvent.click(createButton);
  await waitFor(() =>
    expect(screen.getByLabelText("Nom de la nouvelle catégorie")).toHaveFocus(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Annuler la création" }));

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(createButton).toHaveFocus();
  const picker = screen.getByRole("combobox");
  expect(picker).toHaveAttribute("name", "customCategoryId");
});

it("deduplicates a returned category by id", async () => {
  const createAction = vi.fn(async () => ({
    message: "Catégorie ajoutée.",
    success: true,
    category: { id: "existing-category-id", name: "Logiciels renommés" },
  }));
  render(
    <CategoryPicker
      categories={categories}
      createAction={createAction}
      id="deduplicated-category"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Créer une catégorie" }));
  fireEvent.change(screen.getByLabelText("Nom de la nouvelle catégorie"), {
    target: { value: "Logiciels renommés" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ajouter la catégorie" }));

  await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("existing-category-id"));
  expect(screen.getAllByRole("option", { name: "Logiciels renommés" })).toHaveLength(1);
});
