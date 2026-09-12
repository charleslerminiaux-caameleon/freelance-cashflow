import type { ReactNode } from "react";
import { AutoSyncCoordinator } from "@/features/integrations/auto-sync-coordinator";

import { getQontoIntegration } from "@/features/integrations/repository";
import { isQontoConfigured } from "@/features/integrations/qonto-config";
import { integrationSummary } from "@/features/integrations/status";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { requireOwner } from "@/lib/auth/require-owner";

export default async function ProtectedAppLayout({ children }: { children: ReactNode }) {
  const { userId } = await requireOwner();
  const client = await createClient();
  const integration = await getQontoIntegration(client, userId);

  return <AutoSyncCoordinator lastSuccessAt={integration?.last_success_at}><AppShell syncStatus={integrationSummary(integration, isQontoConfigured())}>{children}</AppShell></AutoSyncCoordinator>;
}
