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
  const [state, submit, pending] = useActionState(createAction, initialState);
  const [options, setOptions] = useState(() => mergeCategories([], categories));
  const [selected, setSelected] = useState(defaultValue);
  const [creating, setCreating] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dialogTitleId = useId();

  useEffect(() => {
    setOptions((current) => mergeCategories(current, categories));
  }, [categories]);

  useEffect(() => {
    if (creating) nameInputRef.current?.focus();
  }, [creating]);

  useEffect(() => {
    if (!showResult || !state.success || !state.category) return;
    setOptions((current) => mergeCategories(current, [state.category!]));
    setSelected(state.category.id);
    setNameDraft("");
    setCreating(false);
    setShowResult(false);
    triggerRef.current?.focus();
  }, [showResult, state]);

  function openCreation() {
    setNameDraft("");
    setShowResult(false);
    setCreating(true);
  }

  function cancelCreation() {
    setCreating(false);
    setShowResult(false);
    triggerRef.current?.focus();
  }

  const creationDialog =
    creating && typeof document !== "undefined"
      ? createPortal(
          <div className="category-create-backdrop">
            <div
              aria-labelledby={dialogTitleId}
              className="category-create-dialog"
              role="dialog"
            >
              <h2 id={dialogTitleId}>Nouvelle catégorie</h2>
              <form
                action={submit}
                className="commercial-form category-create-form"
                onSubmit={() => setShowResult(true)}
              >
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
                {showResult && state.message ? (
                  <p role={state.success ? "status" : "alert"}>{state.message}</p>
                ) : null}
                <div className="category-create-actions">
                  <button type="submit" disabled={pending}>
                    {pending ? "Ajout en cours…" : "Ajouter la catégorie"}
                  </button>
                  <button type="button" className="button-secondary" onClick={cancelCreation}>
                    Annuler la création
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
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
