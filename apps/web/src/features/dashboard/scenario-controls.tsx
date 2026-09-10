"use client";

import { useState } from "react";

import { scenarioCopy } from "./scenario-copy";
import type { DashboardViewModel } from "./view-model";

export function ScenarioControls({
  horizonDays,
  scenario,
  inclusions,
}: Pick<DashboardViewModel, "horizonDays" | "scenario" | "inclusions">) {
  const [hoveredScenario, setHoveredScenario] = useState<string | null>(null);
  const [focusedScenario, setFocusedScenario] = useState<string | null>(null);
  const [dismissedScenario, setDismissedScenario] = useState<string | null>(null);

  return (
    <form
      className="scenario-controls"
      method="get"
      action="/dashboard"
      onChange={(event) => event.currentTarget.requestSubmit()}
    >
      <input type="hidden" name="horizon" value={horizonDays} />
      <input type="hidden" name="filters" value="1" />
      <fieldset className="scenario-choices">
        <legend>Scénario</legend>
        {Object.entries(scenarioCopy).map(([value, copy]) => (
          <span
            className="scenario-choice"
            key={value}
            onBlur={() => setFocusedScenario(null)}
            onFocus={() => {
              setFocusedScenario(value);
              setDismissedScenario(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setDismissedScenario(value);
            }}
            onMouseEnter={() => {
              setHoveredScenario(value);
              setDismissedScenario(null);
            }}
            onMouseLeave={() => setHoveredScenario(null)}
          >
            <label>
              <input
                aria-describedby={`scenario-${value}-description`}
                defaultChecked={scenario === value}
                name="scenario"
                type="radio"
                value={value}
              />
              <span>{copy.label}</span>
            </label>
            <span
              className="scenario-tooltip"
              hidden={
                dismissedScenario === value
                || (hoveredScenario !== value && focusedScenario !== value)
              }
              id={`scenario-${value}-description`}
              role="tooltip"
            >
              {copy.description}
            </span>
          </span>
        ))}
      </fieldset>
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
    </form>
  );
}
