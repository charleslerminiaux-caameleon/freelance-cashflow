import { formatMoney, moneyCents } from "@fc/shared";

import {
  createCategoryAction,
  createExpenseAction,
  deleteCategoryAction,
  deleteExpenseAction,
  updateCategoryAction,
  updateExpenseAction,
} from "@/features/expenses/actions";
import {
  CategoryForm,
  DeleteCategoryForm,
  DeleteExpenseForm,
  ExpenseForm,
  UpdateCategoryForm,
} from "@/features/expenses/expense-form";
import { listExpenseWorkspace } from "@/features/expenses/repository";
import { getOwnerBusinessDate } from "@/features/invoices/business-date";
import {
  analyzeRecurringAction,
  confirmSuggestionAction,
  dismissSuggestionAction,
  reexamineSuggestionAction,
} from "@/features/recurring-detection/actions";
import { getRecurringSuggestionWorkspace } from "@/features/recurring-detection/repository";
import {
  SuggestionPanel,
  type SuggestionReview,
} from "@/features/recurring-detection/suggestion-panel";
import type {
  RecurringSuggestion,
  RecurringSuggestionWorkspace,
} from "@/features/recurring-detection/schema";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

const kindLabels = {
  expense: "Charge",
  remuneration: "Rémunération",
  reserve: "Réserve fiscale ou sociale",
} as const;

const frequencyLabels = {
  monthly: "Mensuelle",
  quarterly: "Trimestrielle",
  yearly: "Annuelle",
} as const;

const certaintyLabels = {
  certain: "Certain",
  committed: "Engagé",
  probable: "Probable",
} as const;

const plannedStatusLabels = {
  planned: "Planifiée",
  realized: "Réalisée",
  cancelled: "Annulée",
} as const;

function centsToInput(value: number): string {
  return `${Math.trunc(value / 100)},${(value % 100).toString().padStart(2, "0")}`;
}

function basisPointsToInput(value: number): string {
  const decimals = value % 100;
  return decimals === 0
    ? Math.trunc(value / 100).toString()
    : `${Math.trunc(value / 100)},${decimals.toString().padStart(2, "0")}`;
}

function reviewSuggestion(suggestion: RecurringSuggestion): SuggestionReview {
  return {
    id: suggestion.id,
    eligible: suggestion.eligible,
    label: suggestion.label,
    amountCents: suggestion.amountCents,
    dayOfMonth: suggestion.dayOfMonth,
    nextDate: suggestion.nextDate,
    sourcePublication: suggestion.sourcePublication,
    currency: suggestion.currency,
    evidence: suggestion.evidence.map(({ label, amountCents, transactionDate }) => ({
      label,
      amountCents,
      transactionDate,
    })),
    possibleDuplicates: suggestion.possibleDuplicates.map(({ label, amountCents }) => ({
      label,
      amountCents,
    })),
  };
}

export default async function ExpensesPage() {
  const { userId } = await requireOwner();
  const client = await createClient();
  const emptySuggestionWorkspace: RecurringSuggestionWorkspace = {
    suggestions: [],
    ignored: [],
    linkedExpenseOrigins: {},
    linkedExpenseIds: [],
    lastAnalyzedAt: null,
    analysisError: null,
  };
  const suggestionPromise = getRecurringSuggestionWorkspace(client, userId).then(
    (suggestionWorkspace) => ({ suggestionWorkspace, loadError: false }),
    () => ({ suggestionWorkspace: emptySuggestionWorkspace, loadError: true }),
  );
  const [workspace, today, suggestionResult] = await Promise.all([
    listExpenseWorkspace(client, userId),
    getOwnerBusinessDate(client, userId),
    suggestionPromise,
  ]);
  const { suggestionWorkspace } = suggestionResult;
  const categoryOptions = workspace.categories.map(({ id, name }) => ({ id, name }));
  const categoryNames = new Map(
    workspace.categories.map((category) => [category.id, category.name]),
  );
  const totalExpenses = workspace.recurringExpenses.length + workspace.plannedExpenses.length;
  const linkedExpenseIds = new Set(suggestionWorkspace.linkedExpenseIds);
  const linkedExpenseOrigins = suggestionWorkspace.linkedExpenseOrigins;
  const existingExpenses = workspace.recurringExpenses
    .filter(
      (expense) =>
        expense.cashflow_kind === "expense" &&
        expense.frequency === "monthly" &&
        !linkedExpenseIds.has(expense.id),
    )
    .map((expense) => ({
      id: expense.id,
      label: expense.label,
      amountCents: expense.amount_cents,
    }));

  return (
    <div className="commercial-page expense-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Sorties prévisionnelles</p>
          <h1>Charges et réserves</h1>
          <p>
            Planifiez vos charges, votre rémunération et vos réserves pour expliquer chaque sortie
            de trésorerie.
          </p>
        </div>
        <span className="count-badge">
          {totalExpenses} sortie{totalExpenses === 1 ? "" : "s"}
        </span>
        <a className="category-management-link" href="#expense-categories">
          Gérer les catégories
        </a>
      </header>

      <aside className="planning-notice" aria-label="Limites des réserves fiscales et sociales">
        <strong>Montants de planification</strong>
        <p>
          Les réserves fiscales et sociales sont configurées par vos soins. Elles ne constituent
          pas un calcul fiscal ou social officiel.
        </p>
      </aside>

      <SuggestionPanel
        suggestions={suggestionWorkspace.suggestions.map(reviewSuggestion)}
        ignored={suggestionWorkspace.ignored.map(reviewSuggestion)}
        categories={categoryOptions}
        existingExpenses={existingExpenses}
        lastAnalyzedAt={suggestionWorkspace.lastAnalyzedAt}
        analysisFailed={suggestionWorkspace.analysisError !== null}
        loadError={suggestionResult.loadError}
        confirmAction={confirmSuggestionAction}
        createCategoryAction={createCategoryAction}
        dismissAction={dismissSuggestionAction}
        reexamineAction={reexamineSuggestionAction}
        analyzeAction={analyzeRecurringAction}
      />

      <div className="expense-entry-grid">
        <details className="panel" open={workspace.recurringExpenses.length === 0}>
          <summary>Nouvelle sortie récurrente</summary>
          <ExpenseForm
            action={createExpenseAction}
            categories={categoryOptions}
            createCategoryAction={createCategoryAction}
            mode="recurring"
            today={today}
          />
        </details>
        <details className="panel" open={workspace.plannedExpenses.length === 0}>
          <summary>Nouvelle sortie ponctuelle</summary>
          <ExpenseForm
            action={createExpenseAction}
            categories={categoryOptions}
            createCategoryAction={createCategoryAction}
            mode="planned"
            today={today}
          />
        </details>
      </div>

      {totalExpenses === 0 ? (
        <section className="empty-state commercial-empty expense-empty" aria-labelledby="empty-expenses-title">
          <p className="eyebrow">Aucune donnée fictive</p>
          <h2 id="empty-expenses-title">Aucune sortie configurée</h2>
          <p>
            Vos charges réelles apparaîtront ici après la création d’une sortie récurrente ou
            ponctuelle.
          </p>
        </section>
      ) : (
        <div className="expense-lists">
          <section className="panel" aria-labelledby="recurring-expenses-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Cadence</p>
                <h2 id="recurring-expenses-title">Sorties récurrentes</h2>
              </div>
              <span>{workspace.recurringExpenses.length}</span>
            </div>
            {workspace.recurringExpenses.length === 0 ? (
              <p className="muted-copy">Aucune sortie récurrente.</p>
            ) : (
              <div className="expense-record-list">
                {workspace.recurringExpenses.map((expense) => (
                  <article
                    key={expense.id}
                    className="expense-record"
                    id={`recurring-expense-${expense.id}`}
                  >
                    <header>
                      <div>
                        <span className={`status-pill ${expense.active ? "status-active" : ""}`}>
                          {expense.active ? "Active" : "Inactive"}
                        </span>
                        {linkedExpenseOrigins[expense.id] ? (
                          <span className="status-pill">
                            {linkedExpenseOrigins[expense.id] === "history"
                              ? "Créée depuis Qonto"
                              : "Détectée depuis Qonto"}
                          </span>
                        ) : null}
                        <h3>{expense.label}</h3>
                        <p>
                          {kindLabels[expense.cashflow_kind]} · {frequencyLabels[expense.frequency]}
                        </p>
                      </div>
                      <strong className="money-value">
                        {formatMoney(moneyCents(expense.amount_cents))}
                      </strong>
                    </header>
                    <dl className="expense-metrics">
                      <div>
                        <dt>Catégorie</dt>
                        <dd>
                          {expense.category_id === null
                            ? "Sans catégorie"
                            : (categoryNames.get(expense.category_id) ?? "Catégorie supprimée")}
                        </dd>
                      </div>
                      <div>
                        <dt>Échéance</dt>
                        <dd>Jour {expense.day_of_month}</dd>
                      </div>
                      <div>
                        <dt>Période</dt>
                        <dd>
                          {expense.start_date} — {expense.end_date ?? "sans fin"}
                        </dd>
                      </div>
                      <div>
                        <dt>Prévision</dt>
                        <dd>{certaintyLabels[expense.certainty]}</dd>
                      </div>
                    </dl>
                    <div className="expense-record-actions">
                      <details className="inline-details">
                        <summary>Modifier</summary>
                        <ExpenseForm
                          action={updateExpenseAction}
                          categories={categoryOptions}
                          createCategoryAction={createCategoryAction}
                          linkedFromQonto={linkedExpenseIds.has(expense.id)}
                          mode="recurring"
                          today={today}
                          value={{
                            id: expense.id,
                            label: expense.label,
                            categoryId: expense.category_id ?? "",
                            cashflowKind: expense.cashflow_kind,
                            amount: centsToInput(expense.amount_cents),
                            frequency: expense.frequency,
                            dayOfMonth: expense.day_of_month,
                            startDate: expense.start_date,
                            endDate: expense.end_date ?? "",
                            certainty: expense.certainty,
                            probabilityPercent: basisPointsToInput(
                              expense.probability_basis_points,
                            ),
                            active: expense.active,
                          }}
                        />
                      </details>
                      <DeleteExpenseForm
                        action={deleteExpenseAction}
                        expenseId={expense.id}
                        expenseLabel={expense.label}
                        mode="recurring"
                      />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="planned-expenses-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Dates uniques</p>
                <h2 id="planned-expenses-title">Sorties ponctuelles</h2>
              </div>
              <span>{workspace.plannedExpenses.length}</span>
            </div>
            {workspace.plannedExpenses.length === 0 ? (
              <p className="muted-copy">Aucune sortie ponctuelle.</p>
            ) : (
              <div className="expense-record-list">
                {workspace.plannedExpenses.map((expense) => (
                  <article key={expense.id} className="expense-record">
                    <header>
                      <div>
                        <span className={`status-pill status-${expense.status}`}>
                          {plannedStatusLabels[expense.status]}
                        </span>
                        <h3>{expense.label}</h3>
                        <p>{kindLabels[expense.cashflow_kind]}</p>
                      </div>
                      <strong className="money-value">
                        {formatMoney(moneyCents(expense.amount_cents))}
                      </strong>
                    </header>
                    <dl className="expense-metrics">
                      <div>
                        <dt>Catégorie</dt>
                        <dd>
                          {expense.category_id === null
                            ? "Sans catégorie"
                            : (categoryNames.get(expense.category_id) ?? "Catégorie supprimée")}
                        </dd>
                      </div>
                      <div>
                        <dt>Date prévue</dt>
                        <dd>{expense.planned_date}</dd>
                      </div>
                      <div>
                        <dt>Prévision</dt>
                        <dd>{certaintyLabels[expense.certainty]}</dd>
                      </div>
                    </dl>
                    <div className="expense-record-actions">
                      <details className="inline-details">
                        <summary>Modifier</summary>
                        <ExpenseForm
                          action={updateExpenseAction}
                          categories={categoryOptions}
                          createCategoryAction={createCategoryAction}
                          mode="planned"
                          today={today}
                          value={{
                            id: expense.id,
                            label: expense.label,
                            categoryId: expense.category_id ?? "",
                            cashflowKind: expense.cashflow_kind,
                            amount: centsToInput(expense.amount_cents),
                            plannedDate: expense.planned_date,
                            certainty: expense.certainty,
                            probabilityPercent: basisPointsToInput(
                              expense.probability_basis_points,
                            ),
                            status: expense.status,
                          }}
                        />
                      </details>
                      <DeleteExpenseForm
                        action={deleteExpenseAction}
                        expenseId={expense.id}
                        expenseLabel={expense.label}
                        mode="planned"
                      />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <section
        className="panel category-panel"
        id="expense-categories"
        aria-labelledby="expense-categories-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Classement</p>
            <h2 id="expense-categories-title">Catégories de sorties</h2>
          </div>
          <span>{workspace.categories.length}</span>
        </div>
        <div className="category-layout">
          <CategoryForm action={createCategoryAction} />
          {workspace.categories.length === 0 ? (
            <p className="muted-copy">Aucune catégorie de sortie disponible.</p>
          ) : (
            <ul className="category-list">
              {workspace.categories.map((category) => (
                <li key={category.id}>
                  <span>
                    <strong>{category.name}</strong>
                    <small>{category.system_category ? "Catégorie système" : "Catégorie personnelle"}</small>
                  </span>
                  {category.system_category ? null : (
                    <div className="category-record-actions">
                      <UpdateCategoryForm
                        action={updateCategoryAction}
                        categoryId={category.id}
                        categoryName={category.name}
                      />
                      <DeleteCategoryForm
                        action={deleteCategoryAction}
                        categoryId={category.id}
                        categoryName={category.name}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
