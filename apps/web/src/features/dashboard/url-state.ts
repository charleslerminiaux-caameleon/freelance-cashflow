import type { DashboardViewModel } from "./view-model";

export type DashboardNavigationState = Pick<
  DashboardViewModel,
  "horizonDays" | "scenario" | "inclusions"
>;

export function dashboardStateHref(
  basePath: string,
  state: DashboardNavigationState,
  horizonDays = state.horizonDays,
): string {
  const parameters = new URLSearchParams();
  parameters.set("horizon", String(horizonDays));
  parameters.set("scenario", state.scenario);
  parameters.set("filters", "1");
  if (state.inclusions.invoices) parameters.set("invoices", "1");
  if (state.inclusions.expenses) parameters.set("expenses", "1");
  if (state.inclusions.signedOrders) parameters.set("signedOrders", "1");
  if (state.inclusions.weightedOpportunities) {
    parameters.set("weightedOpportunities", "1");
  }
  return `${basePath}?${parameters.toString()}`;
}
