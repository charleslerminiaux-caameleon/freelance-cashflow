"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { JSX } from "react";
import { createPortal } from "react-dom";

import type { ExpenseActionState, ExpenseFormAction } from "./expense-form";

type CategoryOption = { id: string; name: string };

const initialState: ExpenseActionState = { message: null, success: false };

function mergeCategories(current: CategoryOption[], incoming: CategoryOption[]): CategoryOption[] {
  const categories = new Map(current.map((category) => [category.id, category]));
  for (const category of incoming) categories.set(category.id, category);
  return [...categories.values()];
}

function CategoryCreationDialog({
  createAction,
  id,
  onCancel,
  onCreated,
}: {
  createAction: ExpenseFormAction;
  id: string;
  onCancel: () => void;
  onCreated: (category: CategoryOption) => void;
}): JSX.Element {
  const [state, submit, pending] = useActionState(createAction, initialState);
  const [nameDraft, setNameDraft] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dialogTitleId = useId();

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!state.success || !state.category) return;
    onCreated(state.category);
  }, [onCreated, state]);

  return createPortal(
    <div className="category-create-backdrop">
      <div aria-labelledby={dialogTitleId} className="category-create-dialog" role="dialog">
        <h2 id={dialogTitleId}>Nouvelle catégorie</h2>
        <form action={submit} className="commercial-form category-create-form">
          <label htmlFor={`${id}-new-name`}>Nom de la nouvelle catégorie</label>
          <input
            id={`${id}-new-name`}
            maxLength={80}
            name="name"
            ref={nameInputRef}
            required
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
          />
          {state.message ? (
            <p role={state.success ? "status" : "alert"}>{state.message}</p>
          ) : null}
          <div className="category-create-actions">
            <button type="submit" disabled={pending}>
              {pending ? "Ajout en cours…" : "Ajouter la catégorie"}
            </button>
            <button type="button" className="button-secondary" onClick={onCancel}>
              Annuler la création
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

export function CategoryPicker({
  categories,
  createAction,
  defaultValue = "",
  id,
  name = "categoryId",
}: {
  categories: CategoryOption[];
  defaultValue?: string;
  id: string;
  name?: string;
  createAction: ExpenseFormAction;
}): JSX.Element {
  const [unacknowledgedCategory, setUnacknowledgedCategory] =
    useState<CategoryOption | null>(null);
  const [selected, setSelected] = useState(defaultValue);
  const [creating, setCreating] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const temporaryCategory = unacknowledgedCategory;
  const options = mergeCategories(categories, temporaryCategory ? [temporaryCategory] : []);

  useEffect(() => {
    if (
      unacknowledgedCategory &&
      categories.some(
        (category) =>
          category.id === unacknowledgedCategory.id &&
          category.name === unacknowledgedCategory.name,
      )
    ) {
      setUnacknowledgedCategory(null);
    }

    const availableIds = new Set(categories.map((category) => category.id));
    if (temporaryCategory) availableIds.add(temporaryCategory.id);
    setSelected((current) => (current !== "" && !availableIds.has(current) ? "" : current));
  }, [categories, temporaryCategory, unacknowledgedCategory]);

  function openCreation() {
    setCreating(true);
  }

  function cancelCreation() {
    setCreating(false);
    triggerRef.current?.focus();
  }

  function finishCreation(category: CategoryOption) {
    setUnacknowledgedCategory(category);
    setSelected(category.id);
    setCreating(false);
    triggerRef.current?.focus();
  }

  const creationDialog =
    creating && typeof document !== "undefined"
      ? (
          <CategoryCreationDialog
            createAction={createAction}
            id={id}
            onCancel={cancelCreation}
            onCreated={finishCreation}
          />
        )
      : null;

  return (
    <div className="category-picker">
      <select
        id={id}
        name={name}
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value="">Sans catégorie</option>
        {options.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <button
        ref={triggerRef}
        type="button"
        className="category-create-trigger"
        onClick={openCreation}
      >
        Créer une catégorie
      </button>
      {creationDialog}
    </div>
  );
}
