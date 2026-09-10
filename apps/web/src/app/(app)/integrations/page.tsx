import { IntegrationPanel } from "@/features/integrations/integration-panel";
import { syncQontoAction } from "@/features/integrations/actions";
import { getQontoIntegration } from "@/features/integrations/repository";
import { isQontoConfigured } from "@/features/integrations/qonto-config";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

export default async function IntegrationsPage() {
  const { userId } = await requireOwner();
  const client = await createClient();
  const integration = await getQontoIntegration(client, userId);
  return <div className="commercial-page">
    <header className="page-heading"><div><p className="eyebrow">Sources de données</p><h1>Intégrations</h1><p>Connectez votre banque et préparez votre facturation.</p></div></header>
    <IntegrationPanel configured={isQontoConfigured()} integration={integration} action={syncQontoAction} />
  </div>;
}
