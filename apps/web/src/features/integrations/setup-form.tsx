"use client";
import { useActionState, useState } from "react";
import { ArrowUpRight, Link2, LoaderCircle } from "lucide-react";
import type { CredentialProvider } from "./credential-store";
import type { SyncActionState } from "./integration-panel";
import styles from "./setup-form.module.css";

type Action = (state: SyncActionState, form: FormData) => Promise<SyncActionState>;
type AuthorizationState = { url: string | null; message: string | null };
const names = { qonto: "Qonto", pennylane: "Pennylane", bunq: "bunq", revolut: "Revolut Business" };
const fields = {
  qonto: [{ key: "login", label: "Identifiant Qonto", secret: false }, { key: "secretKey", label: "Clé secrète Qonto", secret: true }],
  pennylane: [{ key: "token", label: "Jeton API Pennylane", secret: true }],
  bunq: [{ key: "apiKey", label: "Clé API bunq", secret: true }],
  revolut: [{ key: "clientId", label: "Client ID Revolut", secret: false }, { key: "issuer", label: "Domaine de redirection (sans https://)", secret: false }],
};
export function IntegrationSetupForm({ provider, configured, action, disconnectAction }: {
  provider: CredentialProvider; configured: boolean; action: Action; disconnectAction: Action;
}) {
  const [state, formAction, pending] = useActionState(action, { success: false, message: null });
  const [disconnection, disconnect, disconnecting] = useActionState(disconnectAction, { success: false, message: null });
  const [revolutMode, setRevolutMode] = useState("code");
  const busy = pending || disconnecting;
  return <div className={styles.wrapper}>
    <form action={formAction} aria-label={`Connexion ${names[provider]}`} className={styles.form}>
      <fieldset disabled={busy}>
        <legend>{configured ? "Mettre à jour la connexion" : "Renseigner les accès"}</legend>
        {configured && <p className={styles.hint}>Une connexion est configurée. Les identifiants enregistrés ne sont jamais réaffichés.</p>}
        {fields[provider].map(field => <label key={field.key} htmlFor={`${provider}-${field.key}`}>{field.label}
          <input id={`${provider}-${field.key}`} name={field.key} type={field.secret ? "password" : "text"} autoComplete="off" spellCheck={false} required maxLength={8192} />
        </label>)}
        {provider === "revolut" && <>
          <label htmlFor="revolut-privateKey">Clé privée RSA (PEM)<textarea id="revolut-privateKey" name="privateKey" rows={4} autoComplete="off" spellCheck={false} required maxLength={16384} /></label>
          <label htmlFor="revolut-mode">Méthode d’activation<select id="revolut-mode" value={revolutMode} onChange={event => setRevolutMode(event.target.value)}>
            <option value="code">Nouveau code d’autorisation</option><option value="refreshToken">Jeton de renouvellement existant</option>
          </select></label>
          <label htmlFor="revolut-authorization">{revolutMode === "code" ? "Code d’autorisation Revolut" : "Jeton de renouvellement Revolut"}
            <input key={revolutMode} id="revolut-authorization" name={revolutMode} type="password" autoComplete="off" required maxLength={8192} />
          </label>
          {revolutMode === "code" && <p className={styles.hint}>Copiez uniquement le paramètre « code » de l’URL obtenue après autorisation. Il expire après deux minutes.</p>}
        </>}
        <button type="submit" className="primary-link" aria-busy={pending}>
          {pending ? <LoaderCircle size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
          {pending ? "Connexion et synchronisation…" : "Connecter et synchroniser"}
        </button>
      </fieldset>
      {state.message && <p role={state.success ? "status" : "alert"} className={state.success ? styles.success : "form-error"}>{state.message}</p>}
      {state.success && <a href="/integrations">Voir l’état de mes intégrations →</a>}
    </form>
    {configured && <form action={disconnect} className={styles.disconnect}>
      <p>La déconnexion arrête les prochaines synchronisations. Les données importées restent disponibles.</p>
      <button type="submit" disabled={busy}>Déconnecter {names[provider]}</button>
      {disconnection.message && <p role={disconnection.success ? "status" : "alert"}>{disconnection.message}</p>}
    </form>}
  </div>;
}

export function RevolutAuthorizationForm({ action }: { action: (state: AuthorizationState, form: FormData) => Promise<AuthorizationState> }) {
  const [state, formAction, pending] = useActionState(action, { url: null, message: null });
  return <form action={formAction} className={styles.form} aria-label="Autorisation Revolut">
    <fieldset disabled={pending}>
      <legend>Autoriser l’accès en lecture seule</legend>
      <label htmlFor="revolut-consent-client">Client ID<input id="revolut-consent-client" name="clientId" required maxLength={8192} autoComplete="off" /></label>
      <label htmlFor="revolut-consent-redirect">URL de redirection enregistrée dans Revolut<input id="revolut-consent-redirect" name="redirectUri" type="url" placeholder="https://votre-domaine.fr" required maxLength={4096} /></label>
      <button type="submit">Préparer l’autorisation Revolut</button>
    </fieldset>
    {state.message && <p role="alert" className="form-error">{state.message}</p>}
    {state.url && <a className="primary-link" href={state.url} target="_blank" rel="noreferrer">Autoriser dans Revolut <ArrowUpRight size={16} aria-hidden="true" /></a>}
  </form>;
}
