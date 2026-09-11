"use client";

import { formatMoney, moneyCents } from "@fc/shared";

import {
  AnalyzeRecurringForm,
  SuggestionForm,
  SuggestionStateForm,
  type CategoryOption,
  type DuplicateWarning,
  type ExistingExpenseOption,
  type SuggestionFormAction,
} from "./suggestion-form";

export type SuggestionReview = {
  id: string;
  eligible: boolean;
  label: string;
  amountCents: number;
  dayOfMonth: number;
  nextDate: string;
  sourcePublication: string;
  currency: string;
  evidence: {
    label: string;
    amountCents: number;
    transactionDate: string;
  }[];
  possibleDuplicates: DuplicateWarning[];
};

export type SuggestionPanelProps = {
  suggestions: SuggestionReview[];
  ignored: SuggestionReview[];
  categories: CategoryOption[];
  existingExpenses: ExistingExpenseOption[];
  lastAnalyzedAt: string | null;
  analysisFailed: boolean;
  loadError?: boolean;
  confirmAction: SuggestionFormAction;
  dismissAction: SuggestionFormAction;
  reexamineAction: SuggestionFormAction;
  analyzeAction: SuggestionFormAction;
};

function displayMoney(amountCents: number, currency: string): string {
  const euros = formatMoney(moneyCents(amountCents));
  return currency === "EUR" ? euros : euros.replace(/\u00a0€$/u, ` ${currency}`);
}

function reviewItem(suggestion: SuggestionReview) {
  return {
    id: suggestion.id,
    label: suggestion.label,
    amountCents: suggestion.amountCents,
    dayOfMonth: suggestion.dayOfMonth,
    nextDate: suggestion.nextDate,
    sourcePublication: suggestion.sourcePublication,
    possibleDuplicates: suggestion.possibleDuplicates,
  };
}

export function SuggestionPanel(props: SuggestionPanelProps) {
  const confirmable = props.suggestions.filter((suggestion) => suggestion.eligible);
  const needsAnalysis = props.suggestions.filter((suggestion) => !suggestion.eligible);

  return (
    <section
      className="panel recurring-suggestion-panel"
      aria-labelledby="recurring-suggestions-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Détection bancaire</p>
          <h2 id="recurring-suggestions-title">Récurrences à confirmer</h2>
        </div>
        <span>{confirmable.length}</span>
      </div>
      <p>
        Ces estimations n’ont aucun effet sur la trésorerie avant confirmation ou association.
      </p>
      {props.loadError ? (
        <p role="alert">Impossible de charger les suggestions. Actualisez la page puis réessayez.</p>
      ) : null}
      {props.lastAnalyzedAt ? <p>Dernière analyse réussie : {props.lastAnalyzedAt}</p> : null}
      {props.analysisFailed ? (
        <p role="alert">
          L’analyse des récurrences a échoué. Les suggestions précédentes restent disponibles ;
          relancez l’analyse.
        </p>
      ) : null}
      <AnalyzeRecurringForm action={props.analyzeAction} />

      {confirmable.length === 0 ? (
        <p className="muted-copy">Aucune récurrence à confirmer.</p>
      ) : (
        <div className="expense-record-list">
          {confirmable.map((suggestion) => (
            <article key={suggestion.id} className="expense-record">
              <header>
                <div>
                  <span className="status-pill">Suggestion</span>
                  <h3>{suggestion.label}</h3>
                  <p>Prochaine échéance estimée : {suggestion.nextDate}</p>
                </div>
                <strong className="money-value">
                  {displayMoney(suggestion.amountCents, suggestion.currency)} / mois
                </strong>
              </header>
              <details className="inline-details">
                <summary>{suggestion.evidence.length} paiements observés</summary>
                {suggestion.evidence.length === 0 ? (
                  <p className="muted-copy">Aucun justificatif disponible.</p>
                ) : (
                  <ul>
                    {suggestion.evidence.map((evidence, index) => (
                      <li
                        key={`${evidence.transactionDate}-${evidence.label}-${evidence.amountCents}-${index}`}
                      >
                        {evidence.transactionDate} · {evidence.label} ·{" "}
                        {displayMoney(evidence.amountCents, suggestion.currency)}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
              <SuggestionForm
                action={props.confirmAction}
                categories={props.categories}
                existingExpenses={props.existingExpenses}
                suggestion={reviewItem(suggestion)}
              />
              <SuggestionStateForm
                action={props.dismissAction}
                label={suggestion.label}
                suggestionId={suggestion.id}
                mode="dismiss"
              />
            </article>
          ))}
        </div>
      )}

      {needsAnalysis.length > 0 ? (
        <section aria-labelledby="recurring-reanalysis-title">
          <h3 id="recurring-reanalysis-title">Suggestions à réanalyser</h3>
          <p>
            Ces séries ne remplissent plus les critères actuels. Relancez l’analyse pour les
            actualiser ; elles ne peuvent pas être confirmées dans cet état.
          </p>
          <ul>
            {needsAnalysis.map((suggestion) => (
              <li key={suggestion.id}>{suggestion.label}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {props.ignored.length > 0 ? (
        <details className="inline-details">
          <summary>Afficher les suggestions ignorées</summary>
          <section aria-labelledby="ignored-suggestions-title">
            <h3 id="ignored-suggestions-title">Suggestions ignorées</h3>
            <ul>
              {props.ignored.map((suggestion) => (
                <li key={suggestion.id}>
                  <span>{suggestion.label}</span>
                  <SuggestionStateForm
                    action={props.reexamineAction}
                    label={suggestion.label}
                    suggestionId={suggestion.id}
                    mode="reexamine"
                  />
                </li>
              ))}
            </ul>
          </section>
        </details>
      ) : null}
    </section>
  );
}
