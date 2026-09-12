"use client";

import { createContext, startTransition, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { autoSyncQontoAction } from "./auto-sync-action";
import { AUTO_SYNC_CHECK_INTERVAL_MS, AUTO_SYNC_ERROR_COOLDOWN_MS, canCheckAutomatically, type AutoSyncState } from "./auto-sync-policy";

export type { AutoSyncState } from "./auto-sync-policy";
const AutoSyncContext = createContext<AutoSyncState>({ phase: "idle" });
export function useAutoSyncStatus(): AutoSyncState { return useContext(AutoSyncContext); }

export function AutoSyncCoordinator({ children, lastSuccessAt }: { children: ReactNode; lastSuccessAt?: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<AutoSyncState>({ phase: "idle" });
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const retryAfter = useRef(0);
  const initialPublication = Date.parse(lastSuccessAt ?? "");
  const lastPublication = useRef(Number.isFinite(initialPublication) ? initialPublication : -Infinity);
  const refresh = useRef(router.refresh);
  useEffect(() => { refresh.current = router.refresh; }, [router]);
  useEffect(() => {
    const publication = Date.parse(lastSuccessAt ?? "");
    if (Number.isFinite(publication) && publication > lastPublication.current) {
      lastPublication.current = publication;
      retryAfter.current = 0;
      startTransition(() => setState({ phase: "idle" }));
    }
  }, [lastSuccessAt]);

  useEffect(() => {
    mounted.current = true;
    function check() {
      if (!mounted.current || !canCheckAutomatically(document.visibilityState === "visible", inFlight.current, Date.now(), retryAfter.current)) return;
      inFlight.current = true;
      // Admission and publication share one action: pending alone never proves a bank sync.
      setState(previous => ({ ...previous, phase: "checking" }));
      startTransition(async () => {
        try {
          const result = await autoSyncQontoAction();
          if (!mounted.current) return;
          const publication = Date.parse(result.lastSuccessAt ?? "");
          const newerPublication = Number.isFinite(publication) && publication > lastPublication.current;
          if (newerPublication) lastPublication.current = publication;
          if (result.status === "error") {
            retryAfter.current = Date.now() + AUTO_SYNC_ERROR_COOLDOWN_MS;
            setState({ phase: "error", lastErrorCode: result.code ?? "DATABASE_ERROR" });
          } else if (result.status === "synced") {
            setState({ phase: "idle" });
            refresh.current();
          } else if (newerPublication) {
            retryAfter.current = 0;
            setState({ phase: "idle" });
            refresh.current();
          } else {
            setState(previous => previous.lastErrorCode ? { ...previous, phase: "error" } : { phase: "idle" });
          }
        } catch {
          if (!mounted.current) return;
          retryAfter.current = Date.now() + AUTO_SYNC_ERROR_COOLDOWN_MS;
          setState({ phase: "error", lastErrorCode: "DATABASE_ERROR" });
        } finally {
          inFlight.current = false;
        }
      });
    }
    check();
    const timer = window.setInterval(check, AUTO_SYNC_CHECK_INTERVAL_MS);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  return <AutoSyncContext.Provider value={state}>{children}</AutoSyncContext.Provider>;
}
