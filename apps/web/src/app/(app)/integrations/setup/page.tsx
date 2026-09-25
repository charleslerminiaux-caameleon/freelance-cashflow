import Image from "next/image";
import { requireOwner } from "@/lib/auth/require-owner";
import { directCatalog } from "@/features/integrations/direct-catalog";
import { loadDirectConfig } from "@/features/integrations/direct-config";
import { isQontoConfigured } from "@/features/integrations/qonto-config";
import { configureIntegrationAction, disconnectIntegrationAction, prepareRevolutAuthorizationAction } from "@/features/integrations/setup-actions";
import { IntegrationSetupForm, RevolutAuthorizationForm } from "@/features/integrations/setup-form";
import styles from "@/features/integrations/setup-form.module.css";

const guides = {
  qonto: { name: "Qonto", logo: "/qonto-logo.svg", documentation: "https://docs.qonto.com/get-started/business-api/authentication/api-key",
    steps: ["Dans Qonto, ouvrez Intégrations et partenariats → Clé API. Copiez l’identifiant de l’organisation et sa clé secrète.", "Renseignez ces deux valeurs ci-contre. Freelance Cashflow vérifie la connexion puis importe vos comptes et transactions."] },
  pennylane: { name: "Pennylane", logo: "/pennylane-logo.svg", documentation: directCatalog.pennylane.documentation,
    steps: ["Dans Paramètres → Connectivité → Développeurs, créez un jeton API v2 avec les droits customer_invoices:readonly et customers:readonly.", "Collez ce jeton ci-contre pour importer vos clients, factures et restes à encaisser."] },
  bunq: { name: "bunq", logo: "/bunq-logo.svg", documentation: directCatalog.bunq.documentation,
    steps: ["Dans bunq, ouvrez Développeurs → Clés API. Créez une clé pour cette installation et autorisez l’adresse IP du serveur si bunq le demande.", "Collez la clé ci-contre. Freelance Cashflow établit la session puis importe vos comptes de paiement et opérations comptabilisées."] },
} as const;

export default async function IntegrationSetupPage() {
  await requireOwner();
  return <div className={`commercial-page ${styles.page}`}>
    <a href="/integrations">← Intégrations</a>
    <header className="page-heading"><div><p className="eyebrow">Connexions directes</p><h1>Connecter vos comptes</h1><p>Reliez vos banques et votre facturation à Freelance Cashflow. La connexion est vérifiée avant la première synchronisation.</p></div></header>
    {(["qonto", "pennylane", "bunq"] as const).map(provider => {
      const guide = guides[provider];
      const configured = provider === "qonto" ? isQontoConfigured() : loadDirectConfig(provider) !== null;
      return <section key={provider} id={provider} className={`dashboard-panel ${styles.card}`} aria-labelledby={`${provider}-setup-title`}>
        <header><h2 id={`${provider}-setup-title`}><Image src={guide.logo} alt={guide.name} width={140} height={32} /></h2><span className="integration-badge">{configured ? "Connexion configurée" : "À connecter"}</span></header>
        <div className={styles.layout}>
          <div className={styles.guide}><h3>Préparer votre accès</h3><ol>{guide.steps.map(step => <li key={step}>{step}</li>)}</ol>
            {provider !== "qonto" && <p>{directCatalog[provider].requirement}</p>}
            {provider === "bunq" && <p>La clé bunq peut accorder des droits étendus. Freelance Cashflow utilise seulement l’authentification et la lecture.</p>}
            <a href={guide.documentation} target="_blank" rel="noreferrer">Ouvrir le guide officiel {guide.name} ↗</a>
            <p>Les identifiants restent sur votre serveur, chiffrés et accessibles uniquement à l’application. Ils ne sont jamais réaffichés.</p>
          </div>
          <IntegrationSetupForm provider={provider} configured={configured} action={configureIntegrationAction.bind(null, provider)} disconnectAction={disconnectIntegrationAction.bind(null, provider)} />
        </div>
      </section>;
    })}
    <section id="revolut" className={`dashboard-panel ${styles.card}`} aria-labelledby="revolut-setup-title">
      <header><h2 id="revolut-setup-title"><Image src="/revolut-logo.svg" alt="Revolut Business" width={140} height={32} /></h2><span className="integration-badge">{loadDirectConfig("revolut") ? "Connexion configurée" : "À connecter"}</span></header>
      <div className={styles.layout}>
        <div className={styles.guide}>
          <h3>Autoriser Freelance Cashflow</h3>
          <ol><li>Créez un certificat RSA et sa clé privée à l’aide du guide Revolut. Enregistrez le certificat public dans Revolut Business → API → Business API, avec votre URL HTTPS de redirection.</li>
            <li>Préparez le lien ci-dessous avec le Client ID et la même URL. Autorisez l’accès READ dans Revolut.</li>
            <li>Copiez le code de l’URL de retour, puis renseignez-le ci-contre avec le Client ID, le domaine et la clé privée. L’application effectue l’échange de jetons et la synchronisation.</li></ol>
          <p>{directCatalog.revolut.requirement}</p>
          <a href={directCatalog.revolut.documentation} target="_blank" rel="noreferrer">Guide officiel : créer et enregistrer le certificat ↗</a>
          <RevolutAuthorizationForm action={prepareRevolutAuthorizationAction} />
          <p>Le jeton est renouvelé automatiquement lors des synchronisations. En cas de révocation, autorisez à nouveau l’application.</p>
        </div>
        <IntegrationSetupForm provider="revolut" configured={loadDirectConfig("revolut") !== null} action={configureIntegrationAction.bind(null, "revolut")} disconnectAction={disconnectIntegrationAction.bind(null, "revolut")} />
      </div>
    </section>
    <section id="tiime" className={`dashboard-panel ${styles.card}`} aria-labelledby="tiime-setup-title">
      <header><h2 id="tiime-setup-title"><Image src="/tiime-logo.svg" alt="Tiime" width={100} height={32} /></h2><span className="integration-badge">À configurer</span></header>
      <div className={styles.guide}>
        <h3>Configurer la connexion directe Tiime</h3>
        <p>La connexion utilise l’API Tiime pour accéder aux données de facturation autorisées pour votre entreprise.</p>
        <h3>Préparer votre accès</h3>
        <ol>
          <li>Obtenez un accès API auprès de Tiime et la documentation technique associée à votre contrat.</li>
          <li>Préparez les identifiants fournis par Tiime, la méthode d’authentification et l’identifiant de votre entreprise demandé par cette documentation.</li>
          <li>Faites préciser les permissions de lecture des clients, factures et règlements, ainsi que les données disponibles et les limites d’utilisation.</li>
        </ol>
        <p>Le raccordement du connecteur nécessite les spécifications d’authentification et les endpoints transmis par Tiime. Les champs de connexion et la synchronisation dépendent de ces spécifications.</p>
        <a href="https://support.tiime.fr/fr/articles/26240-proposez-vous-une-api" target="_blank" rel="noreferrer">Guide officiel d’accès à l’API Tiime ↗</a>
      </div>
    </section>
  </div>;
}
