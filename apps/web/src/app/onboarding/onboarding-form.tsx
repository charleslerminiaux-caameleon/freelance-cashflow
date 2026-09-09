"use client";

import { useActionState } from "react";

export type OnboardingActionState = { message: string | null };
export type OnboardingFormAction = (
  state: OnboardingActionState,
  formData: FormData,
) => Promise<OnboardingActionState>;

const initialState: OnboardingActionState = { message: null };

export function OnboardingForm({ action }: { action: OnboardingFormAction }) {
  const [state, submit, pending] = useActionState(action, initialState);

  return (
    <form action={submit} className="onboarding-form">
      <div className="form-grid">
        <div>
          <label htmlFor="currency">Devise</label>
          <select id="currency" name="currency" defaultValue="EUR">
            <option value="EUR">EUR</option>
          </select>
        </div>
        <div>
          <label htmlFor="country">Pays</label>
          <select id="country" name="country" defaultValue="FR">
            <option value="FR">FR</option>
          </select>
        </div>
        <div>
          <label htmlFor="timezone">Fuseau horaire</label>
          <input id="timezone" name="timezone" defaultValue="Europe/Paris" required />
        </div>
        <div>
          <label htmlFor="legalForm">Forme juridique</label>
          <input id="legalForm" name="legalForm" maxLength={80} placeholder="EI, EURL, SASU…" />
        </div>
        <div>
          <label htmlFor="openingBalance">Solde d’ouverture</label>
          <input
            id="openingBalance"
            name="openingBalance"
            inputMode="decimal"
            defaultValue="0,00"
            required
          />
        </div>
        <div>
          <label htmlFor="safetyThreshold">Seuil de sécurité</label>
          <input
            id="safetyThreshold"
            name="safetyThreshold"
            inputMode="decimal"
            defaultValue="0,00"
            required
          />
        </div>
      </div>
      <p className="form-hint">Les montants sont saisis en euros et enregistrés en centimes.</p>
      {state.message ? <p role="alert">{state.message}</p> : null}
      <button type="submit" disabled={pending}>
        Terminer la configuration
      </button>
    </form>
  );
}
