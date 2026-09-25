"use client";

import { startTransition, useEffect, useId, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle } from "lucide-react";
import { useAutoSyncStatus } from "./auto-sync-coordinator";
import { publicationTimestamp } from "./auto-sync-policy";
import { QONTO_FRESHNESS_MS, qontoFreshness } from "./qonto-freshness";

export type QontoBadgeProps = {
  lastSuccessAt: string | null;
  timezone: string;
  lastAttemptFailed: boolean;
  syncInProgress?: boolean;
};

export function QontoBadge({ lastSuccessAt, timezone, lastAttemptFailed, syncInProgress = false }: QontoBadgeProps) {
  const automatic = useAutoSyncStatus();
  // The server and first hydration render agree; freshness comes from the live client clock.
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const tooltipId = useId();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function updateClock() {
      const now = Date.now();
      startTransition(() => setNowMs(now));
      const untilStale = Date.parse(lastSuccessAt ?? "") + QONTO_FRESHNESS_MS - now;
      timer = setTimeout(updateClock, untilStale > 0 ? Math.min(untilStale, 60_000) : 60_000);
    }
    updateClock();
    window.addEventListener("focus", updateClockOnFocus);
    function updateClockOnFocus() { clearTimeout(timer); updateClock(); }
    return () => { clearTimeout(timer); window.removeEventListener("focus", updateClockOnFocus); };
  }, [lastSuccessAt]);

  const failed = lastAttemptFailed || automatic.phase === "error" || Boolean(automatic.lastErrorCode);
  const freshness = qontoFreshness({ lastSuccessAt, lastAttemptFailed: failed, nowMs: nowMs ?? NaN });
  const state = syncInProgress || automatic.phase === "syncing" ? "syncing"
    : automatic.phase === "checking" ? "checking" : freshness;
  const label = state === "syncing" ? "Synchronisation en cours"
    : state === "checking" ? "Vérification en cours"
    : state === "fresh" ? "Synchronisé il y a moins de 5 min"
    : state === "error" ? "Échec de synchronisation"
    : state === "unconfigured" ? "Aucune synchronisation publiée"
    : "Actualisation nécessaire";
  const progress = state === "checking" || state === "syncing";
  const Icon = progress ? LoaderCircle : state === "fresh" ? CheckCircle2 : state === "error" ? AlertTriangle : Clock3;
  const timestamp = nowMs === null ? null : publicationTimestamp(lastSuccessAt, nowMs);
  const date = timestamp === null ? "Date de dernière synchronisation indisponible"
    : `Dernière synchronisation : ${new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric",
    }).format(timestamp)} à ${new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(timestamp)} (${timezone})`;
  const open = !dismissed && (focused || hovered || pinned);

  return (
    <div className="qonto-status">
      <span className="qonto-badge-anchor"
        onMouseEnter={() => { setHovered(true); setDismissed(false); }}
        onMouseLeave={() => setHovered(false)}
      >
        <button type="button" className={`qonto-badge qonto-badge-${state}`}
          aria-label={`Solde Qonto · ${label}`} aria-describedby={tooltipId}
          aria-expanded={open}
          onFocus={() => { setFocused(true); setDismissed(false); }}
          onBlur={() => { setFocused(false); setPinned(false); }}
          onClick={() => { setPinned(!pinned); setDismissed(pinned); }}
          onKeyDown={event => { if (event.key === "Escape") { setDismissed(true); setPinned(false); } }}
        >
          <img src="/qonto-logo.svg" alt="Qonto" width="50" height="14" />
          <Icon size={14} aria-hidden="true" className={progress ? "qonto-spinner" : undefined} />
        </button>
        <span role="tooltip" id={tooltipId} className="qonto-tooltip" hidden={!open}>
          {label}. {date}.
        </span>
      </span>
      {failed && <a className="qonto-error-link" href="/integrations">Échec · Intégrations</a>}
    </div>
  );
}
