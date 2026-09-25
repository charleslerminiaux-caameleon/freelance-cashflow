import type { ReactNode } from "react";
import { DirectAutoSyncCoordinator } from "@/features/integrations/direct-auto-sync-coordinator";
import { loadDirectConfig } from "@/features/integrations/direct-config";
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
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let integration: Awaited<ReturnType<typeof getQontoIntegration>> = null;
  let integrationUnavailable = false;
  try {
    integration = await Promise.race([
      getQontoIntegration(client, userId, controller.signal),
      new Promise<never>((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(new Error("DATABASE_ERROR"));
      }, 5_000); }),
    ]);
  } catch { integrationUnavailable = true; }
  finally { clearTimeout(timer); controller.abort(); }

  const directProviders = (["revolut", "bunq", "pennylane"] as const).filter(provider => loadDirectConfig(provider) !== null);
  return <DirectAutoSyncCoordinator providers={directProviders}><AutoSyncCoordinator lastSuccessAt={integration?.last_success_at}><AppShell syncStatus={integrationUnavailable ? "Qonto : état indisponible" : integrationSummary(integration, isQontoConfigured())}>{children}</AppShell></AutoSyncCoordinator></DirectAutoSyncCoordinator>;
}
