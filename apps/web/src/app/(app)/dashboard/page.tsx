import { ActionList } from "@/features/dashboard/action-list";
import { CashflowChart } from "@/features/dashboard/cashflow-chart";
import { HorizonSelector } from "@/features/dashboard/horizon-selector";
import { KpiStrip } from "@/features/dashboard/kpi-strip";
import {
  getDashboardViewModel,
  type DashboardSearchParameters,
} from "@/features/dashboard/query";
import { ScenarioControls } from "@/features/dashboard/scenario-controls";
import { UpcomingLists } from "@/features/dashboard/upcoming-lists";
import { requireOwner } from "@/lib/auth/require-owner";

function displayBusinessDate(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00.000Z`));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParameters>;
}) {
  const [{ userId }, parameters] = await Promise.all([requireOwner(), searchParams]);
  const model = await getDashboardViewModel(userId, { searchParameters: parameters });

  return (
    <div className="dashboard-page">
      <header className="dashboard-heading">
        <div>
          <p className="eyebrow">{displayBusinessDate(model.today)}</p>
          <h1>Bonjour</h1>
          <p>Voici la trajectoire de votre trésorerie à partir de vos données actuelles.</p>
        </div>
        <HorizonSelector
          basePath="/dashboard"
          horizonDays={model.horizonDays}
          scenario={model.scenario}
          inclusions={model.inclusions}
        />
      </header>

      <KpiStrip
        kpis={model.kpis}
        horizonDays={model.horizonDays}
        scenario={model.scenario}
      />

      <div className="dashboard-layout">
        <div className="dashboard-primary">
          <CashflowChart chart={model.chart} currency={model.currency} />
          <ScenarioControls
            horizonDays={model.horizonDays}
            scenario={model.scenario}
            inclusions={model.inclusions}
          />
        </div>
        <aside className="dashboard-secondary" aria-label="Suivi à court terme">
          <ActionList
            overdueInvoices={model.overdueInvoices}
            itemsToInvoice={model.itemsToInvoice}
          />
          <UpcomingLists
            inflows={model.upcomingInflows}
            outflows={model.upcomingOutflows}
            state={model}
          />
        </aside>
      </div>
    </div>
  );
}
