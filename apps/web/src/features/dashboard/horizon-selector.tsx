import type { DashboardViewModel } from "./view-model";
import { dashboardStateHref } from "./url-state";

const horizons = [
  [30, "30 j"],
  [90, "90 j"],
  [180, "6 mois"],
] as const;

export function HorizonSelector({
  basePath,
  horizonDays,
  scenario,
  inclusions,
}: Pick<DashboardViewModel, "horizonDays" | "scenario" | "inclusions"> & { basePath: string }) {
  const state = { horizonDays, scenario, inclusions };

  return (
    <nav className="horizon-selector" aria-label="Horizon de prévision">
      {horizons.map(([horizon, label]) => (
        <a
          key={horizon}
          href={dashboardStateHref(basePath, state, horizon)}
          aria-current={horizon === horizonDays ? "page" : undefined}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
