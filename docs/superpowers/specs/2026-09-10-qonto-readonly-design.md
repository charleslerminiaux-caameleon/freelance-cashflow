# Freelance Forecast — Jalon 2 : Qonto en lecture seule

Date : 10 septembre 2026. Conception validée en conversation ; document soumis à relecture avant plan détaillé.

Références : cahier des charges v0.2 lu dans le checkout utilisateur ; `2026-09-05-freelance-cashflow-mvp-design.md` ; plan `2026-09-05-manual-cashflow-vertical.md`. Base : `origin/main`, commit `69d3302`, fusion de la PR #2.

## 1. Objectif et périmètre

Importer comptes, soldes et transactions Qonto depuis le serveur, à la demande du propriétaire. Publier uniquement des données normalisées et cohérentes ; conserver intégralement la dernière version visible si une synchronisation échoue. Les saisies manuelles et imports CSV restent opérationnels sans Qonto.

Le jalon livre le connecteur, les migrations/RLS, la synchronisation manuelle, les vues bancaires, l'actualisation du dashboard, les tests automatisés et une procédure distincte de validation réelle. Les tests ne demandent aucune clé Qonto réelle.

Sont exclus : rapprochement automatique facture/transaction, initiation de paiement, OAuth, webhooks, autres fournisseurs, worker planifié, Scaleway et déploiement cloud. Le paiement manuel existant reste le mécanisme de constat des paiements des factures. Une transaction importée ne marque donc pas automatiquement une facture payée.

## 2. Architecture et responsabilités

- `packages/integrations` : contrats bancaires normalisés, adaptateur Qonto, schémas Zod, transport HTTP borné, erreurs fournisseur. L'entrée serveur du connecteur est distincte de l'entrée CSV existante.
- Service de synchronisation serveur indépendant de Next.js : séquence comptes/transactions, orchestration des pages, points de reprise et politique de retry. Ses dépendances de transport, persistance, horloge et attente sont injectables pour les tests. Il sera réutilisable par le futur worker.
- Couche de persistance Supabase : fonctions atomiques de verrouillage, préparation des pages et publication. Elle ne connaît pas les payloads Qonto.
- `apps/web` : lecture de configuration serveur, contrôle `requireOwner`, déclenchement manuel, état de l'intégration, vues des données publiées et invalidation des vues.
- `packages/domain` conserve son indépendance de Qonto, React, Next.js et Supabase. Les projections utilisent un solde initial normalisé.

Ne pas créer de serveur permanent ou de file de messages au jalon 2. Une synchronisation manuelle est attendue explicitement par la requête serveur ; pas de tâche détachée dont la survie dépendrait du processus web.

## 3. Configuration et confidentialité

Les noms de variables Qonto sont `QONTO_LOGIN` et `QONTO_SECRET_KEY`. Ces valeurs sont chargées exclusivement dans un module serveur et utilisées en mémoire pour le header d'authentification. Elles ne sont stockées dans aucune table, aucun fichier généré ni aucun état client.

Qonto est optionnel : une configuration absente ou incomplète laisse le parcours manuel utilisable et désactive le déclenchement. L'interface ne reçoit que l'état de configuration, jamais les valeurs, leurs préfixes, leur longueur ou un hash. Aucun formulaire ne permet de saisir ou relire les secrets.

Le client de production utilise une origine HTTPS Qonto fixe et une liste fermée d'endpoints GET. Il refuse les redirections et ne prend ni URL ni credentials depuis le navigateur. Les réponses ne passent pas par le cache HTTP de Next.js. Les doubles de transport et fixtures sont réservés aux tests.

La clé API Qonto n'est pas intrinsèquement limitée à la lecture : la restriction est appliquée au code du connecteur, qui n'expose aucune méthode d'écriture fournisseur. Aucun appel réel n'est nécessaire avant la validation séparée.

`.env.example` contient uniquement les noms et des valeurs vides ou manifestement fictives. Les fichiers d'environnement existants de l'utilisateur ne sont ni lus pour diagnostic, ni copiés vers le worktree. La configuration Supabase publique déjà utilisée par l'authentification reste distincte de la clé privilégiée serveur.

## 4. Contrat Qonto et normalisation

Les comptes proviennent de `GET /v2/bank_accounts`, paginé par `page` et `per_page` (100 au maximum), avec soldes courant et autorisé lorsque disponibles. Les transactions proviennent de `GET /v2/transactions` et sont demandées par `bank_account_id`, jamais par IBAN. La pagination des transactions utilise les métadonnées validées de la réponse.

Les statuts `pending`, `completed`, `declined` et `reversed` sont demandés explicitement, puis normalisés. Le comportement par défaut de Qonto, limité aux transactions terminées, ne suffit pas pour suivre les changements de statut.

Zod valide chaque enveloppe, page, identifiant, statut, devise, instant et montant utilisé. Une page invalide est rejetée entièrement. Les champs inutilisés sont éliminés ; les erreurs de validation publiques n'incluent ni valeur rejetée ni objet Zod brut. Un champ de solde absent n'est jamais converti en zéro.

Les montants sont des centimes entiers sûrs dans TypeScript et des `BIGINT` contrôlés en SQL. Utiliser les champs en centimes du fournisseur ; une éventuelle conversion décimale passe par le parseur partagé sans arithmétique flottante. Conserver le montant positif et le sens débit/crédit séparément pour les transactions.

Ne conserver qu'un IBAN masqué. Les libellés nécessaires à la vue bancaire sont des données privées normalisées et échappées par React ; ils ne figurent jamais dans les logs, diagnostics ou rapports. Aucun payload financier brut n'est persisté.

Les dates métier sont dérivées dans le fuseau de l'instance, avec conservation des instants fournisseur nécessaires à l'incrémental. La date de règlement peut être absente pour une transaction en attente ; ne pas inventer un règlement.

## 5. Modèle de données et publication

Créer les tables métier `bank_accounts`, `bank_transactions` et les tables de contrôle `integrations`, `sync_runs`, `provider_object_mappings`. Ajouter les tables de préparation normalisées nécessaires à la publication atomique. Toute ligne sensible porte `owner_user_id`.

Les clés uniques des objets bancaires et mappings incluent propriétaire, fournisseur, type d'objet lorsque pertinent, et identifiant externe. Les références composées incluent le propriétaire pour empêcher une relation entre deux propriétaires. Les identifiants métier internes restent stables lors des upserts et des reprises.

Les politiques RLS reprennent la protection renforcée du jalon 1 : `auth.uid()` correspond au propriétaire de la ligne et au propriétaire unique de l'instance. Les tables de préparation et de contrôle d'écriture ne sont pas modifiables directement par un client navigateur. Les opérations privilégiées ont des droits SQL explicites et vérifient aussi l'ownership côté serveur.

`integrations` porte le fournisseur, le mode d'authentification non secret, les statuts, le dernier succès, la borne incrémentale et le verrou. `sync_runs` porte les dates, statut, compteurs, code d'erreur et points de reprise non secrets. Les mappings ne contiennent que les identifiants techniques nécessaires.

Une page préparée et son point de reprise sont écrits dans la même transaction SQL, après vérification du verrou. Si l'un échoue, les deux sont annulés. Les pages préparées ne sont pas utilisées par les vues bancaires ou le dashboard.

Après récupération complète, une transaction de publication effectue les upserts métier et mappings, publie l'ensemble des soldes, avance la borne de synchronisation réussie, clôture le run et libère le verrou. Une erreur à n'importe quel endroit annule toute cette publication. Les compteurs distinguent lecture/préparation et création/mise à jour effectivement publiées.

Les comptes absents d'un inventaire complet ne doivent pas laisser un solde actif ajouté indéfiniment au total. Leur historique est conservé ; leur présence dans l'inventaire publié détermine leur participation au solde. Cette règle ne s'applique jamais à une liste de comptes partielle.

## 6. Verrou, interruptions et incrémental

Acquérir le verrou et démarrer le run atomiquement. Le verrou est propre à l'intégration, a une échéance calculée par la base et un identifiant d'exécution. Chaque écriture, renouvellement, publication et libération compare cet identifiant et contrôle l'expiration. Un détenteur périmé ne peut ni écrire ni libérer le verrou de son successeur.

Un second déclenchement pendant le verrou retourne `SYNC_LOCKED` sans appel Qonto et sans altérer le run actif. Une interruption libère le verrou si possible ; sinon son expiration permet une reprise. Les opérations de clôture sont idempotentes pour supporter une réponse SQL perdue après commit.

Première importation : six mois calendaires précédant le début de synchronisation, avec une date initiale persistée. Les comptes sont relus à chaque cycle pour actualiser les soldes. Les transactions suivantes utilisent les filtres de modification et une borne supérieure capturée au début du cycle.

Distinguer le point de reprise des pages de la borne incrémentale publiée. La borne publiée n'avance qu'après réussite complète. Comme une pagination par numéro n'est pas un snapshot immuable, après interruption rejouer la fenêtre non publiée depuis sa première page avec upserts, plutôt que supposer que le numéro suivant contient toujours les mêmes objets. Conserver un chevauchement entre fenêtres réussies pour absorber les frontières temporelles ; documenter sa valeur dans le plan et la tester.

Une transaction déjà importée peut changer de statut. Les mises à jour doivent remplacer sa version précédente sans créer un autre objet ni perdre son identité interne. Les pages répétées ou incohérentes doivent échouer avec un code stable au lieu de boucler indéfiniment.

## 7. Erreurs, retries et logs

Contrat stable : `PROVIDER_AUTH_EXPIRED`, `PROVIDER_RATE_LIMIT`, `PROVIDER_UNAVAILABLE`, `PROVIDER_INVALID_RESPONSE`, `SYNC_LOCKED`, `DATABASE_ERROR`.

Les erreurs d'authentification sont permanentes jusqu'à correction locale. Les limites de débit, timeouts et indisponibilités temporaires autorisent des retries exponentiels avec nombre d'essais, attente et durée totale bornés. Respecter `Retry-After` dans le budget ; si le délai demandé le dépasse, arrêter sans rappeler prématurément. Les réponses invalides et erreurs SQL non classifiées temporaires ne sont pas répétées automatiquement.

Chaque erreur renvoyée ou persistée utilise un texte prédéfini. Ne pas propager les messages bruts du transport, de PostgreSQL ou de Zod, ni leurs causes sérialisables. Une panne de journalisation ne doit pas annuler une publication réussie.

Le logger construit un objet neuf depuis une liste blanche : nom d'événement fermé, identifiants internes, durée, compteurs, numéro d'essai et code stable. Interdire spreads de payloads, messages libres, URLs, headers, IBAN, labels, montants, cookies, tokens et dumps d'environnement.

## 8. Expérience utilisateur et dashboard

La page Intégrations affiche uniquement la présence de configuration et le résultat de la dernière connexion, avec un état explicite lorsqu'aucun essai n'a eu lieu. Le bouton de synchronisation fournit les états en cours, succès et erreur actionnable. L'état de connexion et le succès complet de synchronisation ne sont pas confondus : une réponse Qonto valide suivie d'une panne SQL n'est pas une authentification rejetée.

Trésorerie ajoute les comptes, leurs soldes et IBAN masqués, et une liste paginée des transactions avec dates, sens et statuts. Les données restent accessibles exclusivement au propriétaire.

Après publication, invalider Intégrations, Trésorerie, Dashboard et l'indication de synchronisation de la navigation. Le dashboard utilise le solde courant des comptes de la devise de l'instance, avec provenance et fraîcheur visibles. Une autre devise n'est ni convertie implicitement ni additionnée ; elle reste affichable séparément avec une indication de son exclusion du total.

Sans données bancaires publiées utilisables, conserver le solde manuel. Après une panne Qonto, conserver la dernière publication bancaire avec indication de fraîcheur, sans retomber silencieusement sur le solde manuel. Le solde bancaire autorisé est affiché comme tel ; il ne remplace pas la notion de trésorerie estimée après réserves existante.

Les transactions déjà incluses dans le solde bancaire ne sont pas rejouées dans le prévisionnel. Les factures restent soumises au mécanisme de paiement manuel existant. Afficher cette limite dans la documentation pour éviter de promettre un rapprochement bancaire absent.

## 9. Tests et critères d'acceptation

Chaque fonctionnalité suit le cycle test rouge observé, implémentation minimale, test vert puis refactorisation. Les fixtures sont entièrement fictives, sans copie de compte réel. Le transport Qonto est simulé dans les tests automatisés.

Couverture attendue : normalisation des quatre statuts ; champs manquants ; dates et montants invalides ; pagination vide, multiple et répétée ; modifications incrémentales ; rejeu ; panne après préparation d'une page ; rollback de publication ; réponse perdue après commit ; expiration du verrou ; ancienne exécution rejetée ; déclenchements concurrents ; erreurs temporaires et permanentes ; confidentialité des erreurs/logs ; accès anonyme et non propriétaire refusés ; absence d'import serveur dans les bundles clients ; total bancaire sans double comptage et repli manuel.

Les tests pgTAP vérifient schéma, contraintes, privilèges, RLS et fonctions atomiques. Un test d'intégration avec connexions concurrentes prouve l'exclusion mutuelle. Les tests applicatifs vérifient les Server Actions et l'actualisation des vues ; Playwright couvre le parcours manuel conservé et la synchronisation simulée.

Avant proposition d'intégration : lint, typecheck, tests unitaires et d'intégration, migrations sur base de test dédiée, tests SQL, build, E2E et détection de secrets. Les tests ne remettent pas à zéro la base existante de l'utilisateur.

L'exécution utilise un sous-agent distinct par tâche, avec review de conformité et de qualité, puis review globale et vérification finale. Les constats non résolus sont explicitement rapportés.

## 10. Validation réelle et documentation

Documenter l'installation Qonto, le retrait de configuration, la rotation/révocation chez Qonto, les limites du connecteur, la reprise après panne et les variables fictives. Retirer les variables locales bloque les prochains appels sans supprimer l'historique bancaire publié.

La validation réelle utilise une instance locale distincte de la stack automatisée. Lorsqu'une vraie clé devient nécessaire, arrêter l'exécution et indiquer le chemin absolu du fichier `apps/web/.env.local` ignoré par Git dans le worktree, les noms de variables et le redémarrage nécessaire. L'utilisateur renseigne lui-même ces valeurs ; ne jamais lui demander de les envoyer dans le chat ou de les committer.

La procédure réelle vérifie présence de configuration, lecture des comptes et transactions, concordance des soldes dans l'interface privée, rejeu sans doublon et conservation après échec. Aucun payload, montant réel, libellé ou capture n'est joint au compte rendu. Seuls réussite/échec et codes stables sont rapportés.

## 11. Sources officielles consultées le 10 septembre 2026

- [Authentification et accès par endpoint](https://docs.qonto.com/get-started/business-api/authentication/introduction)
- [Clé API](https://docs.qonto.com/get-started/business-api/authentication/api-key)
- [Liste paginée des comptes](https://docs.qonto.com/api-reference/business-api/accounts-organizations/business-accounts/list)
- [Transactions, statuts, filtres et pagination](https://docs.qonto.com/api-reference/business-api/transactions-statements/transactions/list-transactions)
