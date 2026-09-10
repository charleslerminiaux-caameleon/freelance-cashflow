import { formatMoney, formatShortLocalDate } from "@fc/shared";

import { dashboardStateHref, type DashboardNavigationState } from "./url-state";
import type { DashboardTreasuryEvent } from "./view-model";

function UpcomingList({
  title,
  events,
  direction,
  cashflowHref,
}: {
  title: string;
  events: DashboardTreasuryEvent[];
  direction: "inflow" | "outflow";
  cashflowHref: string;
}) {
  return (
    <section className="dashboard-panel upcoming-panel" aria-label={title}>
      <h2>{title}</h2>
      {events.length === 0 ? (
        <p className="dashboard-empty-copy">Aucun flux sur cet horizon.</p>
      ) : (
        <ul className="dashboard-detail-list dashboard-flow-list">
          {events.slice(0, 4).map((event) => (
            <li key={event.id}>
              <span>
                <strong>{event.label}</strong>
                <small>{formatShortLocalDate(event.plannedDate)} · {event.certainty}</small>
              </span>
              <b className={direction === "inflow" ? "positive" : "negative"}>
                {direction === "inflow" ? "+" : "−"}{formatMoney(event.amountCents)}
              </b>
            </li>
          ))}
        </ul>
      )}
      <a className="dashboard-panel-link" href={cashflowHref}>Voir toute la trésorerie →</a>
    </section>
  );
}

export function UpcomingLists({
  inflows,
  outflows,
  state,
}: {
  inflows: DashboardTreasuryEvent[];
  outflows: DashboardTreasuryEvent[];
  state: DashboardNavigationState;
}) {
  const cashflowHref = dashboardStateHref("/cashflow", state);

  return (
    <>
      <UpcomingList
        title="Prochaines entrées"
        events={inflows}
        direction="inflow"
        cashflowHref={cashflowHref}
      />
      <UpcomingList
        title="Prochaines sorties"
        events={outflows}
        direction="outflow"
        cashflowHref={cashflowHref}
      />
    </>
  );
}
