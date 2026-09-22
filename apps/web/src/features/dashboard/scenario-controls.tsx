"use client";

import { useState } from "react";

import { scenarioCopy } from "./scenario-copy";
import type { DashboardViewModel } from "./view-model";

export function ScenarioControls({
  horizonDays,
  scenario,
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
      <p className="form-hint" aria-live="polite">
        {scenarioCopy[scenario].description} Les charges sont incluses dans tous les scénarios.
      </p>
    </form>
  );
}
