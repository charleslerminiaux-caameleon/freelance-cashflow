import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";
import { isQontoConfigured } from "@/features/integrations/qonto-config";
import { loadInstallationReport } from "@/features/installation/repository";
import { version } from "../../../../../package.json";

const stepLabels = { ready: "Renseigné", optional: "Facultatif · à compléter selon vos besoins", unknown: "État indisponible" };
const checkLabels = { ok: "Disponible", attention: "À vérifier", unknown: "Indisponible" };

export default async function InstallationPage() {
  const { userId } = await requireOwner();
  const client = await createClient();
  const report = await loadInstallationReport(client, userId, isQontoConfigured());
  return <div className="commercial-page installation-page">
    <header className="page-heading">
      <div><p className="eyebrow">Configuration de l’instance</p><h1>Installation et diagnostic</h1>
        <p>Complétez votre installation à votre rythme. Vous pouvez revenir ici depuis les paramètres.</p></div>
      <a className="button" href="/dashboard">Ouvrir le dashboard</a>
    </header>
    <section className="panel settings-panel" aria-labelledby="installation-steps-title">
      <h2 id="installation-steps-title">Votre parcours de démarrage</h2>
      <p>La saisie manuelle permet de commencer immédiatement. Aucune connexion bancaire n’est obligatoire.</p>
      <ol className="installation-list">{report.steps.map(step => <li key={step.id}>
        <div><a href={step.href}>{step.title}</a><p>{step.description}</p></div>
        <span className={`installation-state installation-state-${step.state}`}>{stepLabels[step.state]}</span>
      </li>)}</ol>
    </section>
    <section className="panel settings-panel" aria-labelledby="installation-diagnostic-title">
      <h2 id="installation-diagnostic-title">État de l’installation</h2>
      <dl className="installation-list">{report.checks.map(check => <div key={check.id}>
        <dt>{check.title}</dt><dd><span className={`installation-state installation-state-${check.state}`}>{checkLabels[check.state]}</span><p>{check.message}</p></dd>
      </div>)}</dl>
      <p>Dernière publication Qonto : {report.lastSuccessAt
        ? <time dateTime={report.lastSuccessAt}>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(report.lastSuccessAt))} UTC</time>
        : "aucune date disponible"}.</p>
      <p>Version web : {version} · Contrat attendu : jalon 3.</p>
      <a href="/settings/installation">Actualiser le diagnostic</a>
    </section>
    <section className="panel settings-panel" aria-labelledby="installation-operation-title">
      <h2 id="installation-operation-title">Actualisation pendant l’utilisation</h2>
      <p>Les vérifications ont lieu uniquement lorsque l’application est ouverte et l’onglet visible : à l’ouverture, au retour et toutes les cinq minutes.</p>
      <p>Après la première synchronisation manuelle, les données de plus de cinq minutes sont actualisées. En cas d’échec, une nouvelle tentative automatique attend quinze minutes. Une demande déjà lancée peut se terminer après la fermeture de l’onglet.</p>
      <p>Les changements de délai nécessitent les migrations du jalon 3. Le diagnostic ci-dessus confirme leur disponibilité sur cette installation.</p>
    </section>
  </div>;
}
