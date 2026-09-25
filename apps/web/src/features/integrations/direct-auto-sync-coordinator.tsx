"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { autoSyncDirectAction } from "./auto-sync-action";
import { AUTO_SYNC_CHECK_INTERVAL_MS, canCheckAutomatically } from "./auto-sync-policy";
import type { DirectProvider } from "./direct-config";

/** Each source has its own flight; database admission enforces cadence across tabs. */
export function DirectAutoSyncCoordinator({ providers, children }: { providers: DirectProvider[]; children: ReactNode }) {
  const router = useRouter();
  const refresh = useRef(router.refresh);
  const inFlight = useRef(new Set<DirectProvider>());
  const mounted = useRef(false);
  const activeProviders = useRef(new Set(providers));
  const providerKey = providers.join(",");
  useEffect(() => { refresh.current = router.refresh; }, [router]);
  useEffect(() => {
    mounted.current = true;
    const sources = providerKey ? providerKey.split(",") as DirectProvider[] : [];
    activeProviders.current = new Set(sources);
    function check() {
      for (const provider of sources) {
        if (!mounted.current || !canCheckAutomatically(document.visibilityState === "visible", inFlight.current.has(provider))) continue;
        inFlight.current.add(provider);
        void autoSyncDirectAction(provider).then(result => {
          if (mounted.current && activeProviders.current.has(provider) && result.status !== "skipped") refresh.current();
        }).catch(() => { /* A later visible check retries; no bank data is discarded. */ })
          .finally(() => { inFlight.current.delete(provider); });
      }
    }
    check();
    const timer = window.setInterval(check, AUTO_SYNC_CHECK_INTERVAL_MS);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => { mounted.current = false; window.clearInterval(timer); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [providerKey]);
  return children;
}
