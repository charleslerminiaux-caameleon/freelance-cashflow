"use client";

import { useActionState, useId } from "react";

import type { ForecastHorizonDays } from "./schema";

export type SettingsActionState = {
  message: string | null;
  success: boolean;
};

export type SettingsFormAction = (
  state: SettingsActionState,
  formData: FormData,
) => Promise<SettingsActionState>;

export type SettingsFormValue = {
  safetyThreshold: string;
  timezone: string;
  legalForm: string;
  defaultForecastHorizonDays: ForecastHorizonDays | null;
  defaultScenario: "certain" | "committed" | "probable";
};

const initialState: SettingsActionState = { message: null, success: false };

export function SettingsForm({
  action,
  value,
}: {
  action: SettingsFormAction;
  value: SettingsFormValue;
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const fieldId = useId();

  return (
    <form action={submit} className="commercial-form settings-form">
      <div className="form-grid">
        <div>
          <label htmlFor={`${fieldId}-threshold`}>Seuil de sécurité</label>
          <input
            id={`${fieldId}-threshold`}
            name="safetyThreshold"
            inputMode="decimal"
            defaultValue={value.safetyThreshold}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-timezone`}>Fuseau horaire IANA</label>
          <input
            id={`${fieldId}-timezone`}
            name="timezone"
            defaultValue={value.timezone}
            placeholder="Europe/Paris"
            maxLength={100}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-legal-form`}>Forme juridique</label>
          <input
            id={`${fieldId}-legal-form`}
            name="legalForm"
            defaultValue={value.legalForm}
            maxLength={80}
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-horizon`}>Horizon par défaut</label>
          <select
            id={`${fieldId}-horizon`}
            name="defaultForecastHorizonDays"
            defaultValue={value.defaultForecastHorizonDays ?? ""}
            required
          >
            {value.defaultForecastHorizonDays === null ? (
              <option value="" disabled>
                Choisissez un horizon pris en charge
              </option>
            ) : null}
            <option value="30">30 jours</option>
            <option value="90">90 jours</option>
            <option value="180">6 mois</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-scenario`}>Scénario par défaut</label>
          <select
            id={`${fieldId}-scenario`}
            name="defaultScenario"
            defaultValue={value.defaultScenario}
          >
            <option value="certain">Certain</option>
            <option value="committed">Engagé</option>
            <option value="probable">Probable pondéré</option>
          </select>
        </div>
      </div>
      <p className="settings-notice">
        Les réserves fiscales et sociales sont des montants de planification configurables ; elles ne
        sont pas des calculs fiscaux officiels.
      </p>
      {state.message ? <p role={state.success ? "status" : "alert"}>{state.message}</p> : null}
      <button type="submit" disabled={pending}>Enregistrer les paramètres</button>
    </form>
  );
}
