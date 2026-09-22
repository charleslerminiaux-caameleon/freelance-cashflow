import { updateSettingsAction } from "@/features/settings/actions";
import { getOwnerSettings } from "@/features/settings/repository";
import { forecastHorizonDaysSchema } from "@/features/settings/schema";
import { SettingsForm } from "@/features/settings/settings-form";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

function centsToInput(value: number): string {
  return `${Math.trunc(value / 100)},${(value % 100).toString().padStart(2, "0")}`;
}

export default async function SettingsPage() {
  const { userId } = await requireOwner();
  const client = await createClient();
  const settings = await getOwnerSettings(client, userId);
  const storedHorizon = forecastHorizonDaysSchema.safeParse(
    settings.default_forecast_horizon_days,
  );

  return (
    <div className="commercial-page settings-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Configuration de l’instance</p>
          <h1>Paramètres</h1>
          <p>
            Ajustez le calendrier métier, le seuil d’alerte et les préférences utilisées par vos
            prévisions.
          </p>
        </div>
      </header>

      <p><a href="/settings/installation">Installation et diagnostic</a></p>

      <section className="panel settings-panel" aria-labelledby="forecast-settings-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Prévision</p>
            <h2 id="forecast-settings-title">Préférences du propriétaire</h2>
          </div>
        </div>
        <SettingsForm
          action={updateSettingsAction}
          value={{
            safetyThreshold: centsToInput(settings.safety_cash_threshold_cents),
            timezone: settings.timezone,
            legalForm: settings.legal_form ?? "",
            defaultForecastHorizonDays: storedHorizon.success ? storedHorizon.data : null,
            defaultScenario: settings.default_scenario,
          }}
        />
      </section>
    </div>
  );
}
