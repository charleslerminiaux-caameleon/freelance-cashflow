import { requireOwner } from "@/lib/auth/require-owner";
import { directCatalog } from "@/features/integrations/direct-catalog";

export default async function IntegrationSetupPage() {
  await requireOwner();
  return <div className="commercial-page">
    <a href="/integrations">← Intégrations</a>
    <header className="page-heading"><div><h1>Configurer les connexions directes</h1><p>Ajoutez les identifiants dans le fichier serveur apps/web/.env.local, puis redémarrez Libra. Aucun secret ne doit être préfixé NEXT_PUBLIC_.</p></div></header>
    <p>Avant la première connexion, appliquez la migration 202609180001_direct_integrations.sql à la base de votre installation, sans la réinitialiser.</p>
    <section id="pennylane" className="dashboard-panel"><h2>Pennylane</h2><p>{directCatalog.pennylane.requirement}</p>
      <p>Dans Paramètres → Connectivité → Développeurs, créez un jeton API v2 avec customer_invoices:readonly et customers:readonly.</p>
      <pre>PENNYLANE_API_TOKEN=votre_jeton</pre>
      <p>Les montants et soldes importés se modifient dans Pennylane. Libra ne crée pas de paiement à une date supposée. Un numéro déjà utilisé par une facture manuelle bloque l’import pour éviter les doublons.</p>
      <p>Les factures dans une autre devise, les soldes inconnus et les états non pris en charge bloquent la synchronisation ; les données précédentes restent disponibles. Les factures absentes d’une lecture ultérieure sont conservées.</p>
      <a href={directCatalog.pennylane.documentation}>Guide officiel Pennylane</a>
    </section>
    <section id="revolut" className="dashboard-panel"><h2>Revolut Business</h2><p>{directCatalog.revolut.requirement}</p>
      <p>Suivez le guide officiel pour enregistrer votre certificat public RSA et autoriser votre application avec la permission READ uniquement. Conservez la clé privée et le jeton de renouvellement sur votre serveur.</p>
      <pre>{'REVOLUT_CLIENT_ID=votre_client_id\nREVOLUT_REFRESH_TOKEN=votre_refresh_token\nREVOLUT_ISSUER=domaine_enregistre\nREVOLUT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----"'}</pre>
      <p>Libra renouvelle le jeton d’accès lors de la synchronisation. Si l’autorisation expire ou est révoquée, renouvelez-la dans Revolut.</p>
      <a href={directCatalog.revolut.documentation}>Guide officiel Revolut Business</a>
    </section>
    <section id="bunq" className="dashboard-panel"><h2>bunq</h2><p>{directCatalog.bunq.requirement}</p>
      <p>Dans les paramètres bunq, ouvrez Développeurs → Clés API et créez une clé dédiée à cette installation.</p><pre>BUNQ_API_KEY=votre_cle</pre>
      <p>Libra enregistre le contexte d’authentification dans .libra/bunq-context.json, dans le dossier de démarrage du serveur. Conservez ce fichier privé entre les redémarrages ; il est exclu de Git. BUNQ_CONTEXT_PATH permet de choisir un chemin persistant.</p>
      <p>Cette clé peut disposer de permissions bancaires étendues : Libra utilise uniquement la lecture des comptes et paiements, ainsi que les opérations nécessaires à l’authentification. Un changement d’adresse IP peut nécessiter une nouvelle autorisation bunq.</p>
      <a href={directCatalog.bunq.documentation}>Guide officiel bunq</a>
    </section>
    <p>Après configuration, revenez aux intégrations et lancez une synchronisation. Les banques traditionnelles nécessitant un accès DSP2 réservé aux prestataires ne sont pas proposées comme connexions directes.</p>
  </div>;
}
