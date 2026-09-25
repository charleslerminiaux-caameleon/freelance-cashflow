"use client";

import { useActionState } from "react";
import Image from "next/image";
import { RefreshCw, Settings2 } from "lucide-react";
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
  return <>
    <section className="dashboard-panel integration-card" aria-labelledby="qonto-title">
      <header className="integration-card-header">
        <h2 id="qonto-title"><Image src="/qonto-logo.svg" alt="Qonto" width={99} height={28} /></h2>
        <span className="integration-badge">{!configured ? "À configurer" : integration?.status === "error" ? "À vérifier" : integration?.last_connection_succeeded === true ? "Connecté" : "À synchroniser"}</span>
      </header>
      <p>Retrouvez vos comptes et transactions Qonto dans votre trésorerie, en lecture seule.</p>
      <details className="integration-details" open={integration?.status === "error" || integration?.status === "syncing"}>
        <summary>Détails de la connexion</summary>
        <p>{configured ? "Identifiants de connexion disponibles" : "Identifiants à renseigner dans Configurer"}</p>
        <p>{integration?.last_connection_succeeded === true ? "Dernière connexion réussie" : integration?.last_connection_succeeded === false ? "Dernière connexion échouée" : "Aucune tentative de connexion"}</p>
        <p>{integration?.last_success_at ? `Dernière synchronisation publiée : ${integration.last_success_at}` : "Aucune synchronisation publiée"}</p>
        {integration?.last_error_code && <p className="form-error">{integrationMessages[integration.last_error_code]}</p>}
        <p>Comptes et transactions sont publiés ensemble après une synchronisation complète. Les données précédentes restent disponibles en cas d’échec.</p>
        {integration?.status === "syncing" && !pending && <p>Une synchronisation a été démarrée. Actualisez la page ou réessayez si elle a été interrompue.</p>}
        <a href="/cashflow">Consulter les comptes et transactions</a>
      </details>
      <div className="integration-card-actions">
        <a className="integration-action" href="/integrations/setup#qonto" aria-label="Gérer la connexion Qonto"><Settings2 size={16} aria-hidden="true" />Gérer</a>
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
        <h2 id="tiime-title"><Image src="/tiime-logo.svg" alt="Tiime" width={100} height={35} /></h2>
        <span className="integration-badge">À configurer</span>
      </header>
      <p>Centralisez vos factures Tiime pour suivre vos encaissements et anticiper votre trésorerie.</p>
      <details className="integration-details">
        <summary>Détails de la connexion</summary>
        <p>Connexion non configurée</p>
        <p>Aucune synchronisation publiée</p>
      </details>
      <div className="integration-card-actions">
        <a className="integration-action" href="/integrations/setup#tiime"><Settings2 size={16} aria-hidden="true" />Configurer Tiime</a>
      </div>
    </section>
  </>;
}
