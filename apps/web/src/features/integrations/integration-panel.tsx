"use client";

import { useActionState } from "react";
import { integrationMessages, type IntegrationState } from "./status";

export type SyncActionState = {
  success: boolean;
  message: string | null;
  analysisSuccess?: boolean;
  analysisMessage?: string;
};
export function IntegrationPanel({ configured, integration, action }: {
  configured: boolean;
  integration: IntegrationState | null;
  action: (state: SyncActionState, formData: FormData) => Promise<SyncActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, { success: false, message: null });
  // Only this browser request disables the button: the DB lease arbitrates other tabs and recovery.
  const syncing = pending;
  return <div className="integration-grid">
    <section className="dashboard-panel integration-card" aria-labelledby="qonto-title">
      <p className="eyebrow">Banque · Lecture seule</p><h2 id="qonto-title">Qonto</h2>
      <p>{configured ? "Configuration serveur disponible" : "Configuration serveur à compléter"}</p>
      <p>{integration?.last_connection_succeeded === true ? "Dernière connexion réussie" : integration?.last_connection_succeeded === false ? "Dernière connexion échouée" : "Aucune tentative de connexion"}</p>
      <p>{integration?.last_success_at ? `Dernière synchronisation publiée : ${integration.last_success_at}` : "Aucune synchronisation publiée"}</p>
      {integration?.last_error_code && <p className="form-error">{integrationMessages[integration.last_error_code]}</p>}
      <p>Comptes et transactions sont publiés ensemble après une synchronisation complète. Les données précédentes restent disponibles en cas d’échec.</p>
      {integration?.status === "syncing" && !pending && <p>Une synchronisation a été démarrée. Actualisez la page ou réessayez si elle a été interrompue.</p>}
      <form action={formAction} aria-label="Synchronisation Qonto">
        <button type="submit" className="primary-link" disabled={!configured || syncing} aria-busy={syncing}>
          {syncing ? "Synchronisation en cours…" : "Synchroniser Qonto"}
        </button>
      </form>
      {state.message && <p role={state.success ? "status" : "alert"}>{state.message}</p>}
      {state.analysisMessage ? (
        <p role={state.analysisSuccess ? "status" : "alert"}>{state.analysisMessage}</p>
      ) : null}
      <a href="/cashflow">Consulter les comptes et transactions</a>
    </section>
    <section className="dashboard-panel integration-card" aria-labelledby="tiime-title">
      <p className="eyebrow">Facturation</p><h2 id="tiime-title">Tiime</h2>
      <p className="integration-badge">Accès API à obtenir</p>
      <p>Demandez un accès officiel et sa documentation à Tiime pour préparer la connexion. Vos factures manuelles et imports CSV restent disponibles.</p>
      <a href="https://support.tiime.fr/fr/articles/26240-proposez-vous-une-api">Consulter le guide Tiime d’accès API</a>
      <a href="/invoices">Importer un CSV de factures</a>
    </section>
  </div>;
}
