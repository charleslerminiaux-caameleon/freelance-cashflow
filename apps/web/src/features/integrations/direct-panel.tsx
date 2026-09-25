"use client";
import Image from "next/image";
import { useActionState } from "react";
import { RefreshCw, Settings2 } from "lucide-react";
import { directCatalog } from "./direct-catalog";
import { integrationMessages, type IntegrationState } from "./status";
import type { SyncActionState } from "./integration-panel";

export function DirectIntegrationCard({ provider, configured, integration, action }: {
  provider: keyof typeof directCatalog; configured: boolean; integration: IntegrationState | null;
  action: (state: SyncActionState, form: FormData) => Promise<SyncActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, { success: false, message: null });
  const item = directCatalog[provider];
  const badge = !configured ? "À configurer" : integration?.status === "error" ? "À vérifier"
    : integration?.last_success_at ? "Connecté" : "À synchroniser";
  return <section className="dashboard-panel integration-card" aria-labelledby={`${provider}-title`}>
    <header className="integration-card-header"><h2 id={`${provider}-title`}><Image className={`integration-logo integration-logo-${provider}`} src={`/${provider}-logo.svg`} alt={item.name} width={provider === "pennylane" ? 142 : provider === "revolut" ? 120 : 90} height={provider === "bunq" ? 36 : 28} />{provider === "revolut" && <span className="integration-logo-caption" aria-hidden="true">Business</span>}</h2><span className="integration-badge">{badge}</span></header>
    <p>{item.description}</p><p className="integration-note">{item.requirement}</p>
    <details className="integration-details" open={integration?.status === "error"}>
      <summary>Détails de la connexion</summary>
      <p>Connexion directe, sans agrégateur. Synchronisation automatique toutes les 5 minutes lorsque l’application est ouverte, en lecture seule.</p>
      <p>{integration?.last_success_at ? `Dernière synchronisation publiée : ${integration.last_success_at}` : "Aucune synchronisation publiée"}</p>
      {integration?.last_error_code && <p className="form-error">{integrationMessages[integration.last_error_code].replaceAll("Qonto", item.name)}</p>}
      <a href={item.documentation}>Documentation officielle {item.name}</a>
    </details>
    <div className="integration-card-actions">
      <a className="integration-action" href={`/integrations/setup#${provider}`}><Settings2 size={16} aria-hidden="true" />Configurer {item.name}</a>
      <form action={formAction}><button className="primary-link integration-action" type="submit" disabled={!configured || pending} aria-busy={pending}>
        <RefreshCw size={16} aria-hidden="true" />{pending ? "Synchronisation en cours…" : `Synchroniser ${item.name}`}
      </button></form>
    </div>
    {state.analysisMessage && <p role={state.analysisSuccess ? "status" : "alert"}>{state.analysisMessage}</p>}
    {state.message && <p role={state.success ? "status" : "alert"}>{state.message}</p>}
  </section>;
}
