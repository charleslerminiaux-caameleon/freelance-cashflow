export type InstallationSnapshot = {
  database: boolean;
  contract: { version: number; syncIntervalSeconds: number } | null;
  expenses: boolean | null;
  reserves: boolean | null;
  invoices: boolean | null;
  integration: { status: string; last_success_at: string | null } | null | undefined;
};
type Check = { id: string; title: string; state: "ok" | "attention" | "unknown"; message: string };
type Step = { id: string; title: string; state: "ready" | "optional" | "unknown"; href: string; description: string };
export type InstallationReport = { checks: Check[]; steps: Step[]; lastSuccessAt: string | null };
const stepState = (value: boolean | null): Step["state"] => value === null ? "unknown" : value ? "ready" : "optional";

export function buildInstallationReport(snapshot: InstallationSnapshot, qontoConfigured: boolean): InstallationReport {
  const compatible = snapshot.contract?.version === 1 && snapshot.contract.syncIntervalSeconds === 300;
  const integration = snapshot.integration;
  const bankReady = Boolean(qontoConfigured && integration?.last_success_at);
  return {
    checks: [
      { id: "database", title: "Base de données", state: snapshot.database ? "ok" : "unknown",
        message: snapshot.database ? "Les paramètres du propriétaire sont accessibles." : "Lecture indisponible. Vérifiez la connexion Supabase puis réessayez." },
      { id: "schema", title: "Compatibilité de la base", state: compatible ? "ok" : snapshot.database ? "attention" : "unknown",
        message: compatible ? "Le contrat du jalon 3 est disponible (synchronisation : cinq minutes)." : "Compatibilité non confirmée. Vérifiez les migrations avec le guide de mise à jour." },
      { id: "qonto", title: "Connexion Qonto", state: !qontoConfigured ? "attention" : integration === undefined ? "unknown" : integration?.status === "error" || !bankReady ? "attention" : "ok",
        message: !qontoConfigured ? "Configuration absente ou incomplète. La saisie manuelle reste disponible." : integration === undefined ? "État de connexion indisponible." : integration?.status === "error" ? "La dernière tentative a échoué. Consultez les intégrations." : !bankReady ? "Configuration présente. Lancez la première synchronisation depuis les intégrations." : "Une synchronisation a déjà été publiée. Consultez sa date ci-dessous." },
    ],
    steps: [
      { id: "settings", title: "Paramètres et seuil de sécurité", state: snapshot.database ? "ready" : "unknown", href: "/settings", description: "Vérifiez votre fuseau horaire, votre forme juridique et le seuil d’alerte." },
      { id: "expenses", title: "Charges principales", state: stepState(snapshot.expenses), href: "/expenses", description: "Ajoutez vos dépenses récurrentes ou ponctuelles si vous en avez." },
      { id: "reserves", title: "Réserves et rémunération", state: stepState(snapshot.reserves), href: "/expenses", description: "Prévoyez vos réserves et votre rémunération selon vos besoins. Ces montants ne sont pas des calculs fiscaux officiels." },
      { id: "invoices", title: "Factures et import CSV", state: stepState(snapshot.invoices), href: "/invoices", description: "Saisissez vos factures ou importez un CSV. Tiime reste facultatif et en attente d’accès API." },
      { id: "bank", title: "Connexion bancaire facultative", state: integration === undefined ? "unknown" : bankReady ? "ready" : "optional", href: "/integrations", description: "Connectez Qonto et lancez une première synchronisation, ou utilisez votre solde manuel." },
    ],
    lastSuccessAt: integration?.last_success_at ?? null,
  };
}
