import type { DashboardViewModel } from "./view-model";

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
  function href(horizon: number): string {
    const parameters = new URLSearchParams();
    parameters.set("horizon", String(horizon));
    parameters.set("scenario", scenario);
    parameters.set("filters", "1");
    if (inclusions.invoices) parameters.set("invoices", "1");
    if (inclusions.expenses) parameters.set("expenses", "1");
    if (inclusions.signedOrders) parameters.set("signedOrders", "1");
    if (inclusions.weightedOpportunities) parameters.set("weightedOpportunities", "1");
    return `${basePath}?${parameters.toString()}`;
  }

  return (
    <nav className="horizon-selector" aria-label="Horizon de prévision">
      {horizons.map(([horizon, label]) => (
        <a
          key={horizon}
          href={href(horizon)}
          aria-current={horizon === horizonDays ? "page" : undefined}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
