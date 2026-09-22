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
  return `${basePath}?${parameters.toString()}`;
}
