import type { DashboardViewModel } from "./view-model";

export function ScenarioControls({
  horizonDays,
  scenario,
  inclusions,
}: Pick<DashboardViewModel, "horizonDays" | "scenario" | "inclusions">) {
  return (
    <form className="scenario-controls" method="get" action="/dashboard">
      <input type="hidden" name="horizon" value={horizonDays} />
      <input type="hidden" name="filters" value="1" />
      <div className="scenario-field">
        <label htmlFor="dashboard-scenario">Scénario</label>
        <select id="dashboard-scenario" name="scenario" defaultValue={scenario}>
          <option value="certain">Certain</option>
          <option value="committed">Engagé</option>
          <option value="probable">Probable pondéré</option>
        </select>
      </div>
      <fieldset>
        <legend>Inclure</legend>
        <label>
          <input type="checkbox" name="invoices" value="1" defaultChecked={inclusions.invoices} />
          Factures émises
        </label>
        <label>
          <input type="checkbox" name="expenses" value="1" defaultChecked={inclusions.expenses} />
          Charges
        </label>
        <label>
          <input type="checkbox" name="signedOrders" value="1" defaultChecked={inclusions.signedOrders} />
          Commandes signées
        </label>
        <label>
          <input
            type="checkbox"
            name="weightedOpportunities"
            value="1"
            defaultChecked={inclusions.weightedOpportunities}
          />
          Opportunités pondérées
        </label>
      </fieldset>
      <button type="submit">Mettre à jour</button>
    </form>
  );
}
