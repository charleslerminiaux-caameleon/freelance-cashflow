import type { IntegrationErrorCode } from "@fc/integrations/server";

export const integrationMessages: Record<IntegrationErrorCode, string> = {
  PROVIDER_AUTH_EXPIRED: "Connexion Qonto refusée. Vérifiez les identifiants dans Intégrations puis réessayez.",
  PROVIDER_RATE_LIMIT: "Limite Qonto atteinte. Patientez quelques minutes puis réessayez.",
  PROVIDER_UNAVAILABLE: "Qonto est indisponible. Réessayez plus tard.",
  PROVIDER_INVALID_RESPONSE: "Réponse Qonto incompatible. Contactez le responsable de l’installation.",
  SYNC_LOCKED: "Une synchronisation est déjà en cours. Patientez puis actualisez la page.",
  DATABASE_ERROR: "Échec de l’enregistrement des données. Réessayez la synchronisation.",
};

export type IntegrationState = {
  id: string;
  status: "not_connected" | "syncing" | "connected" | "error" | "awaiting_api_access";
  last_connection_succeeded: boolean | null;
  last_success_at: string | null;
  last_error_code: IntegrationErrorCode | null;
};

export function integrationSummary(integration: IntegrationState | null, configured: boolean): string {
  if (integration?.status === "syncing") return "Qonto : synchronisation en cours";
  if (integration?.last_error_code) return "Qonto : synchronisation à relancer";
  if (integration?.last_success_at) return configured ? "Qonto : données synchronisées" : "Qonto : données conservées · configuration absente";
  return configured ? "Qonto : prêt à synchroniser" : "Qonto : à configurer";
}
