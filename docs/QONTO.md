# Connexion Qonto en lecture seule

Le connecteur, la synchronisation manuelle, les vues bancaires et leur validation automatisée avec données fictives sont implémentés. Une validation avec le compte Qonto réel reste à réaliser dans une installation séparée. Aucun test automatisé n’utilise les identifiants réels.

## Configuration du serveur

Dans Qonto, choisissez l’organisation puis **Intégrations et partenariats → Clé API** pour obtenir le login et générer la clé si nécessaire. Consultez la [procédure officielle Qonto](https://docs.qonto.com/get-started/business-api/authentication/api-key). Renseignez uniquement les variables serveur `QONTO_LOGIN` et `QONTO_SECRET_KEY` dans le fichier ignoré `apps/web/.env.local` de l’installation concernée. Ne préfixez jamais ces variables par `NEXT_PUBLIC_`. Le code utilise le couple login/clé dans l’en-tête Authorization ; aucune valeur n’est stockée en base ou envoyée au navigateur.

Le code autorise exclusivement GET sur `https://thirdparty.qonto.com/v2/bank_accounts` et `/v2/transactions`. Les redirections et le cache Next sont interdits. Cette restriction du connecteur ne garantit pas que la clé du fournisseur soit elle-même limitée à la lecture.

## Fonctionnement

Le propriétaire lance **Intégrations → Synchroniser Qonto**. Le premier import couvre six mois calendaires dans son fuseau ; PostgreSQL calcule la borne instantanée initiale. Les imports suivants partent de la dernière borne publiée, avec cinq minutes de recouvrement. Les quatre statuts pending/completed/declined/reversed sont lus. Les identifiants externes rendent les répétitions idempotentes.

Un bail par fournisseur empêche deux publications concurrentes. Chaque page et son point de reprise sont enregistrés ensemble dans un staging invisible ; tous les comptes et transactions deviennent visibles en une publication atomique. Une exécution ayant perdu son bail ne peut plus modifier la synchronisation. Après échec, relancer récupère la fenêtre non publiée ; aucun solde partiel ne devient visible.

Les requêtes ont au plus trois tentatives, dix secondes par tentative, un backoff borné ; un Retry-After supérieur à cinq secondes arrête la tentative de synchronisation. Le service impose un budget global de deux minutes et des limites de pagination. Les erreurs publiques sont stables :

| Code | Action |
| --- | --- |
| PROVIDER_AUTH_EXPIRED | Vérifier/renouveler la configuration Qonto côté serveur. |
| PROVIDER_RATE_LIMIT | Attendre puis relancer. |
| PROVIDER_UNAVAILABLE | Réessayer lorsque Qonto répond. |
| PROVIDER_INVALID_RESPONSE | Vérifier la compatibilité de l’adaptateur avec la documentation officielle. |
| SYNC_LOCKED | Attendre la synchronisation ou l’expiration du bail, puis relancer. |
| DATABASE_ERROR | Vérifier l’installation et les migrations sans publier les détails SQL. |

Le dernier solde publié et sa date restent affichés après échec ; l’interface distingue le dernier résultat de connexion. Le dashboard utilise les soldes publiés des comptes courants actifs dans la devise de projection. L’historique bancaire n’est pas ajouté aux événements prévisionnels. Aucun rapprochement automatique facture/banque n’est réalisé ; les paiements manuels et CSV conservent leur fonctionnement.

## Suggestions de charges mensuelles

Une synchronisation bancaire réussie déclenche l’analyse des récurrences. Le résultat bancaire et celui de l’analyse sont affichés séparément : une analyse échouée ne retire ni le solde publié ni les décisions antérieures. Dans **Sorties**, examinez les paiements observés, confirmez ou associez une proposition, ou ignorez-la. **Analyser les transactions importées** traite l’historique déjà présent sans requête Qonto. Les règles, corrections conservées, suppression/réexamen et exclusions des mois payés sont décrites dans [RECURRING_DETECTION.md](RECURRING_DETECTION.md).

Les seize migrations sont appliquées sur cette installation hébergée. Les migrations `202609120001_history_recurring_decisions.sql` et `202609120002_automatic_qonto_admission.sql` ont reçu une autorisation explicite distincte et ont été appliquées le 14 septembre 2026. Le dry-run final ne signale aucune migration en attente ; les tests locaux ne modifient pas cette base. Voir [INSTALLATION.md](INSTALLATION.md).

## Tests reproductibles sans compte Qonto

```bash
corepack pnpm test:isolated
corepack pnpm test:client-boundary
```

Le premier lance migrations, pgTAP, concurrence réelle, service/RPC avec HTTP simulé et les quatre parcours Chromium (manuel, Qonto, récurrences et dashboard/historique). Le second construit avec des canaris fictifs puis inspecte les artefacts clients. Docker, Node 24, les dépendances installées et Chromium (`corepack pnpm --filter @fc/web exec playwright install chromium`) sont nécessaires.

La stack jetable `jalon-2-qonto-tests`, dérivée dans `.isolated-tests/`, occupe API 56321, PostgreSQL 56322 et le serveur web 3200. La configuration source et les fichiers `.env.local` ne sont jamais copiés. Le harness garde les clés Supabase en mémoire, remplace les variables Qonto héritées et intercepte exclusivement HTTP sous tests ; les connexions externes non simulées sont refusées. Aucun serveur existant, notamment celui de l’application réelle, n’est réutilisé. Les captures automatiques, vidéos et traces sont désactivées. Seul le parcours dashboard autorise des captures explicites de son propriétaire fictif sur le serveur 3200, dans `/private/tmp/libra-dashboard-*.png`, pour vérifier les largeurs 1440, 1024 et 390 pixels. Ne mettez aucune donnée réelle dans cette stack.

Sous-commandes : `node scripts/run-isolated-tests.mjs db|integration|e2e|build|all|stop` (une seule option à la fois). `db` et `all` réinitialisent uniquement cette stack, `stop` supprime uniquement ses volumes. La stack reste démarrée après un test pour permettre un diagnostic local. Les mises à jour annoncées par la CLI épinglée ne sont pas des échecs ; les notices pgTAP de création répétée d’extension sont informatives.

## Validation réelle : point d’arrêt utilisateur

Ne réutilisez jamais `.isolated-tests/` pour cette validation. Utilisez l’installation Next.js locale avec Supabase hébergé décrite dans [INSTALLATION.md](INSTALLATION.md), distincte de la stack jetable, avec un propriétaire unique. Faites autoriser et appliquer les nouvelles migrations avant la validation des récurrences. N’exécutez aucun harness de test contre elle. Dans le dossier de cette installation, créez le fichier ignoré `apps/web/.env.local` depuis `.env.example` et renseignez vous-même les trois variables Supabase, puis `QONTO_LOGIN` et `QONTO_SECRET_KEY`. C’est le point d’arrêt : aucune clé ne doit être demandée dans une conversation, copiée en Git ou incluse dans un rapport.

Après cette configuration locale, démarrez l’application de validation et utilisez le bouton de synchronisation. Comparez vous-même les comptes, devises, soldes, dates et statuts avec Qonto ; relancez pour vérifier l’absence de doublons. Notez uniquement le résultat et les compteurs non sensibles. Le jalon complet attend également l’accès API Tiime et les validations réelles des deux fournisseurs.

Pour déconnecter, retirez les deux variables puis redémarrez le serveur ; les données déjà publiées restent consultables. Pour renouveler ou révoquer une clé, utilisez les contrôles Qonto de gestion des clés, remplacez la valeur locale et redémarrez. Retirer une variable ne révoque pas la clé chez Qonto. En cas d’exposition, révoquez immédiatement et auditez les accès et l’historique Git.


## Logo officiel local

Le badge du dashboard utilise `/qonto-logo.svg`, copie inchangée du [logo vectoriel officiel Qonto](https://qonto.com/blog/assets/logo-7d4cecd23c516a73d28522b73227cb8bdc80cbbe1d7c83d9228a7e0ab84a0852.svg) présent sur le [kit presse Qonto](https://qonto.com/en/press/kit), vérifié le 12 septembre 2026. Le SVG d’origine (85 × 24) contient uniquement des tracés, sans script ni référence externe. Son rendu a été vérifié avant intégration. Il est servi localement sans requête vers Qonto au chargement du dashboard.

## Actualisation pendant l’utilisation

La première synchronisation reste manuelle. Après une publication réussie, l’application vérifie son âge à l’ouverture, au retour au premier plan et toutes les cinq minutes quand l’onglet est visible. Après application de `202609150001_open_app_sync.sql`, à partir de cinq minutes, le serveur peut lancer une synchronisation. Une décision atomique partage le verrou du lancement manuel et empêche deux onglets de publier deux imports successifs. Après une tentative sans publication réussie, le serveur attend quinze minutes avant une nouvelle tentative automatique ; les vérifications continuent pendant ce délai sans appel Qonto supplémentaire. Une application fermée ne se synchronise pas : aucun worker n’est installé.

Le badge Qonto du solde distingue fraîcheur inférieure à cinq minutes, vérification, synchronisation en cours, données anciennes et échec. Au clavier, au survol ou au toucher, il donne la date et l’heure françaises dans le fuseau du propriétaire. Un échec connu retire l’état vert et donne accès à Intégrations. Le dernier solde valide reste disponible ; une analyse des récurrences échouée ne retire pas la publication bancaire. Une actualisation de la vue conserve les formulaires en cours et les paramètres du scénario.

Dans **Trésorerie → Historique bancaire**, une sortie positive comptabilisée d’un compte actif dans la devise de projection peut être utilisée pour créer explicitement une charge mensuelle. Cette action n’appelle pas Qonto. Le parcours et la différence avec la détection automatique sont décrits dans [RECURRING_DETECTION.md](RECURRING_DETECTION.md).
