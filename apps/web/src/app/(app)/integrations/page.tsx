import { DirectIntegrationCard } from "@/features/integrations/direct-panel";
import { loadDirectConfig } from "@/features/integrations/direct-config";
import { syncPennylaneAction, syncRevolutAction, syncBunqAction } from "@/features/integrations/direct-actions";
import { IntegrationPanel } from "@/features/integrations/integration-panel";
import { syncQontoAction } from "@/features/integrations/actions";
import { getQontoIntegration, getDirectIntegrations } from "@/features/integrations/repository";
import { isQontoConfigured } from "@/features/integrations/qonto-config";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

export default async function IntegrationsPage() {
  const { userId } = await requireOwner();
  const client = await createClient();
  const integration = await getQontoIntegration(client, userId);
  const direct = await getDirectIntegrations(client, userId);
  const actions = { pennylane: syncPennylaneAction, revolut: syncRevolutAction, bunq: syncBunqAction };
  return <div className="commercial-page">
    <header className="page-heading"><div><p className="eyebrow">Sources de données</p><h1>Intégrations</h1><p>Connectez vos banques et votre facturation directement, en lecture seule.</p></div></header>
    <IntegrationPanel configured={isQontoConfigured()} integration={integration} action={syncQontoAction} />
    <div className="integration-grid">{(["pennylane", "revolut", "bunq"] as const).map(provider => <DirectIntegrationCard key={provider} provider={provider} configured={loadDirectConfig(provider) !== null} integration={direct.find(item => item.provider === provider) ?? null} action={actions[provider]} />)}</div>
  </div>;
}
