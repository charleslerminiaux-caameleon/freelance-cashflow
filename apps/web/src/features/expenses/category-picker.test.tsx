import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

it("removes an authoritative category deletion and clears its selection", () => {
  const createAction = async () => ({ message: null, success: false });
  const removedCategory = { id: "removed-category-id", name: "À supprimer" };
  const { rerender } = render(
    <CategoryPicker
      categories={[...categories, removedCategory]}
      createAction={createAction}
      defaultValue={removedCategory.id}
      id="reconciled-category"
    />,
  );

  expect(screen.getByRole("combobox")).toHaveValue(removedCategory.id);
  rerender(
    <CategoryPicker
      categories={categories}
      createAction={createAction}
      defaultValue={removedCategory.id}
      id="reconciled-category"
    />,
  );

  expect(screen.queryByRole("option", { name: removedCategory.name })).toBeNull();
  expect(screen.getByRole("combobox")).toHaveValue("");
});

it("retains a returned category only until authoritative props acknowledge it", async () => {
  const returnedCategory = { id: "new-category-id", name: "Télécoms" };
  const createAction = async () => ({
    message: "Catégorie ajoutée.",
    success: true,
    category: returnedCategory,
  });
  const { rerender } = render(
    <CategoryPicker
      categories={categories}
      createAction={createAction}
      id="temporary-category"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Créer une catégorie" }));
  fireEvent.change(screen.getByLabelText("Nom de la nouvelle catégorie"), {
    target: { value: returnedCategory.name },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ajouter la catégorie" }));
  await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue(returnedCategory.id));

  rerender(
    <CategoryPicker
      categories={[...categories, returnedCategory]}
      createAction={createAction}
      id="temporary-category"
    />,
  );
  expect(screen.getAllByRole("option", { name: returnedCategory.name })).toHaveLength(1);

  rerender(
    <CategoryPicker
      categories={categories}
      createAction={createAction}
      id="temporary-category"
    />,
  );
  await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue(""));
  expect(screen.queryByRole("option", { name: returnedCategory.name })).toBeNull();
});

it("waits for a deferred second success before selecting it and closing creation", async () => {
  let resolveSecond!: (value: {
    message: string;
    success: boolean;
    category: { id: string; name: string };
  }) => void;
  const createAction = vi
    .fn()
    .mockResolvedValueOnce({
      message: "Catégorie ajoutée.",
      success: true,
      category: { id: "first-category-id", name: "Première catégorie" },
    })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
    );

  render(
    <form>
      <label htmlFor="deferred-success-label">Libellé</label>
      <input id="deferred-success-label" defaultValue="Initial" />
      <label htmlFor="deferred-success-category">Catégorie</label>
      <CategoryPicker
        categories={categories}
        createAction={createAction}
        id="deferred-success-category"
      />
    </form>,
  );

  fireEvent.change(screen.getByLabelText("Libellé"), {
    target: { value: "Parent draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Créer une catégorie" }));
  fireEvent.change(screen.getByLabelText("Nom de la nouvelle catégorie"), {
    target: { value: "Première catégorie" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ajouter la catégorie" }));
  await waitFor(() => expect(screen.getByLabelText("Catégorie")).toHaveValue("first-category-id"));

  fireEvent.click(screen.getByRole("button", { name: "Créer une catégorie" }));
  fireEvent.change(screen.getByLabelText("Nom de la nouvelle catégorie"), {
    target: { value: "Deuxième catégorie" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ajouter la catégorie" }));

  await waitFor(() => expect(createAction).toHaveBeenCalledTimes(2));
  const pendingDraft = screen.queryByLabelText(
    "Nom de la nouvelle catégorie",
  ) as HTMLInputElement | null;
  const pendingSnapshot = {
    dialogPresent: screen.queryByRole("dialog") !== null,
    draft: pendingDraft?.value ?? null,
    selection: (screen.getByLabelText("Catégorie") as HTMLSelectElement).value,
    parentDraft: (screen.getByLabelText("Libellé") as HTMLInputElement).value,
    previousStatus: screen.queryByRole("status")?.textContent ?? null,
  };

  await act(async () =>
    resolveSecond({
      message: "Catégorie ajoutée.",
      success: true,
      category: { id: "second-category-id", name: "Deuxième catégorie" },
    }),
  );

  expect(pendingSnapshot).toEqual({
    dialogPresent: true,
    draft: "Deuxième catégorie",
    selection: "first-category-id",
    parentDraft: "Parent draft",
    previousStatus: null,
  });
  await waitFor(() => expect(screen.getByLabelText("Catégorie")).toHaveValue("second-category-id"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByLabelText("Libellé")).toHaveValue("Parent draft");
});

it("keeps the second draft, parent fields, selection, and error after a deferred failure", async () => {
  let resolveSecond!: (value: { message: string; success: boolean }) => void;
  const createAction = vi
    .fn()
    .mockResolvedValueOnce({
      message: "Catégorie ajoutée.",
      success: true,
      category: { id: "first-category-id", name: "Première catégorie" },
    })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
    );

  render(
    <form>
      <label htmlFor="deferred-failure-label">Libellé</label>
      <input id="deferred-failure-label" defaultValue="Initial" />
      <label htmlFor="deferred-failure-category">Catégorie</label>
      <CategoryPicker
        categories={categories}
        createAction={createAction}
        id="deferred-failure-category"
      />
    </form>,
  );

  fireEvent.change(screen.getByLabelText("Libellé"), {
    target: { value: "Parent failure draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Créer une catégorie" }));
  fireEvent.change(screen.getByLabelText("Nom de la nouvelle catégorie"), {
    target: { value: "Première catégorie" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ajouter la catégorie" }));
  await waitFor(() => expect(screen.getByLabelText("Catégorie")).toHaveValue("first-category-id"));

  fireEvent.click(screen.getByRole("button", { name: "Créer une catégorie" }));
  fireEvent.change(screen.getByLabelText("Nom de la nouvelle catégorie"), {
    target: { value: "Doublon différé" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ajouter la catégorie" }));
  await waitFor(() => expect(createAction).toHaveBeenCalledTimes(2));
  const pendingDraft = screen.queryByLabelText(
    "Nom de la nouvelle catégorie",
  ) as HTMLInputElement | null;
  const pendingSnapshot = {
    dialogPresent: screen.queryByRole("dialog") !== null,
    draft: pendingDraft?.value ?? null,
    selection: (screen.getByLabelText("Catégorie") as HTMLSelectElement).value,
    parentDraft: (screen.getByLabelText("Libellé") as HTMLInputElement).value,
    previousStatus: screen.queryByRole("status")?.textContent ?? null,
  };

  await act(async () =>
    resolveSecond({
      message: "Impossible d’ajouter cette catégorie.",
      success: false,
    }),
  );

  expect(pendingSnapshot).toEqual({
    dialogPresent: true,
    draft: "Doublon différé",
    selection: "first-category-id",
    parentDraft: "Parent failure draft",
    previousStatus: null,
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Impossible d’ajouter cette catégorie.",
  );
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByLabelText("Nom de la nouvelle catégorie")).toHaveValue("Doublon différé");
  expect(screen.getByLabelText("Catégorie")).toHaveValue("first-category-id");
  expect(screen.getByLabelText("Libellé")).toHaveValue("Parent failure draft");
});
