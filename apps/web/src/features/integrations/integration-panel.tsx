"use client";

import { useActionState } from "react";
import Image from "next/image";
import { CircleHelp, FileUp, RefreshCw, Settings2 } from "lucide-react";
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
      <header className="integration-card-header">
        <h2 id="qonto-title"><Image src="/qonto-logo.svg" alt="Qonto" width={113} height={32} /></h2>
        <span className="integration-badge">{!configured ? "À configurer" : integration?.status === "error" ? "À vérifier" : integration?.last_connection_succeeded === true ? "Connecté" : "À synchroniser"}</span>
      </header>
      <p>Retrouvez vos comptes et transactions Qonto dans votre trésorerie, en lecture seule.</p>
      <details className="integration-details" open={integration?.status === "error" || integration?.status === "syncing"}>
        <summary>Détails de la connexion</summary>
        <p>{configured ? "Configuration serveur disponible" : "Configuration serveur à compléter"}</p>
        <p>{integration?.last_connection_succeeded === true ? "Dernière connexion réussie" : integration?.last_connection_succeeded === false ? "Dernière connexion échouée" : "Aucune tentative de connexion"}</p>
        <p>{integration?.last_success_at ? `Dernière synchronisation publiée : ${integration.last_success_at}` : "Aucune synchronisation publiée"}</p>
        {integration?.last_error_code && <p className="form-error">{integrationMessages[integration.last_error_code]}</p>}
        <p>Comptes et transactions sont publiés ensemble après une synchronisation complète. Les données précédentes restent disponibles en cas d’échec.</p>
        {integration?.status === "syncing" && !pending && <p>Une synchronisation a été démarrée. Actualisez la page ou réessayez si elle a été interrompue.</p>}
        <a href="/cashflow">Consulter les comptes et transactions</a>
      </details>
      <div className="integration-card-actions">
        <a className="integration-action" href="/settings/installation" aria-label="Gérer la connexion Qonto"><Settings2 size={16} aria-hidden="true" />Gérer</a>
        <form action={formAction} aria-label="Synchronisation Qonto">
          <button type="submit" className="primary-link integration-action" disabled={!configured || syncing} aria-busy={syncing}>
            <RefreshCw size={16} aria-hidden="true" />{syncing ? "Synchronisation en cours…" : "Synchroniser Qonto"}
          </button>
        </form>
      </div>
      {state.message && <p role={state.success ? "status" : "alert"}>{state.message}</p>}
      {state.analysisMessage ? (
        <p role={state.analysisSuccess ? "status" : "alert"}>{state.analysisMessage}</p>
      ) : null}
    </section>
    <section className="dashboard-panel integration-card" aria-labelledby="tiime-title">
      <header className="integration-card-header">
        <h2 id="tiime-title"><Image src="/tiime-logo.svg" alt="Tiime" width={100} height={32} /></h2>
        <span className="integration-badge">Accès API à obtenir</span>
      </header>
      <p>Centralisez vos factures Tiime pour suivre vos encaissements et anticiper votre trésorerie.</p>
      <p className="integration-note">La connexion nécessite un accès officiel auprès de Tiime. En attendant, importez vos factures par CSV.</p>
      <div className="integration-card-actions">
        <a className="integration-action" href="https://support.tiime.fr/fr/articles/26240-proposez-vous-une-api" aria-label="Consulter le guide Tiime d’accès API"><CircleHelp size={16} aria-hidden="true" />Aide</a>
        <a className="primary-link integration-action" href="/invoices" aria-label="Importer un CSV de factures"><FileUp size={16} aria-hidden="true" />Importer un CSV</a>
      </div>
    </section>
  </div>;
}
