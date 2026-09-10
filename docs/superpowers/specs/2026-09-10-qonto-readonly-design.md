# Freelance Forecast — Jalon 2 : Qonto et Tiime en lecture seule

Date : 10 septembre 2026. Conception Qonto validée en conversation ; extension Tiime demandée par le propriétaire. L'accès API Tiime sera demandé par le propriétaire et n'est pas encore obtenu. Document soumis à relecture avant plan détaillé.

Références : cahier des charges v0.2 lu dans le checkout utilisateur ; `2026-09-05-freelance-cashflow-mvp-design.md` ; plan `2026-09-05-manual-cashflow-vertical.md`. Base : `origin/main`, commit `69d3302`, fusion de la PR #2.

## 1. Objectif et périmètre

Importer comptes, soldes et transactions Qonto depuis le serveur, à la demande du propriétaire. Ajouter Tiime comme source de clients, factures, échéances et informations de règlement effectivement accessibles via son API officielle. Publier uniquement des données normalisées et cohérentes ; conserver intégralement la dernière version visible si une synchronisation échoue. Les saisies manuelles et imports CSV restent opérationnels sans connecteur.

Le jalon livre les connecteurs Qonto et Tiime, les migrations/RLS, les synchronisations manuelles, les vues bancaires et de facturation, l'actualisation du dashboard, les tests automatisés et des procédures distinctes de validation réelle. Les tests ne demandent aucune clé fournisseur réelle. Qonto et la préparation Tiime peuvent avancer immédiatement ; le transport Tiime et sa validation dépendent de l'accès et de la documentation officielle. Une livraison Qonto seule reste une livraison partielle du jalon 2 élargi.

Sont exclus : rapprochement automatique facture/transaction bancaire, initiation de paiement, OAuth Qonto, webhooks, fournisseurs autres que Qonto et Tiime, worker planifié, Scaleway et déploiement cloud. L'authentification Tiime sera définie à partir de sa documentation officielle ; aucun mécanisme n'est présumé. Le paiement manuel reste utilisable. Une transaction Qonto importée ne marque pas automatiquement une facture payée ; un règlement explicitement fourni par Tiime constitue une information de facturation distincte à normaliser sans double comptage.

## 2. Architecture et responsabilités

- `packages/integrations` : contrats bancaires et de facturation normalisés, adaptateurs Qonto et Tiime séparés, schémas Zod, transport HTTP borné, erreurs fournisseur. Les entrées serveur sont distinctes de l'entrée CSV existante. Les schémas de réponse et le transport Tiime ne sont écrits qu'après lecture de son contrat officiel.
- Service de synchronisation serveur indépendant de Next.js : séquence comptes/transactions, orchestration des pages, points de reprise et politique de retry. Ses dépendances de transport, persistance, horloge et attente sont injectables pour les tests. Il sera réutilisable par le futur worker.
- Couche de persistance Supabase : fonctions atomiques de verrouillage, préparation des pages et publication. Elle ne connaît pas les payloads Qonto.
- `apps/web` : lecture de configuration serveur, contrôle `requireOwner`, déclenchement manuel, état de l'intégration, vues des données publiées et invalidation des vues.
- `packages/domain` conserve son indépendance de Qonto, Tiime, React, Next.js et Supabase. Les projections utilisent un solde initial normalisé et les soldes restant à encaisser des factures.

Ne pas créer de serveur permanent ou de file de messages au jalon 2. Une synchronisation manuelle est attendue explicitement par la requête serveur ; pas de tâche détachée dont la survie dépendrait du processus web.

Les publications et verrous sont indépendants par intégration. Une indisponibilité Tiime ne bloque pas une publication Qonto et inversement. Le dashboard peut donc afficher deux dates de fraîcheur distinctes ; aucune transaction distribuée entre les fournisseurs n'est promise.

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

Les transactions déjà incluses dans le solde bancaire ne sont pas rejouées dans le prévisionnel. Les factures manuelles restent soumises au mécanisme de paiement manuel existant ; les factures Tiime suivent les informations de règlement explicites du fournisseur et les règles de conflit de la section 12. Afficher cette limite dans la documentation pour éviter de promettre un rapprochement bancaire absent.

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
- [Tiime : accès API sur demande pour les éditeurs de logiciels](https://support.tiime.fr/fr/articles/26240-proposez-vous-une-api)
- [Tiime : export des factures, devis et clients](https://support.tiime.fr/fr/articles/26190-comment-exporter-mes-factures-devis-et-clients)

## 12. Tiime : facturation en lecture seule

### 12.1 Découpage du jalon 2

Le jalon comprend deux lots fonctionnels : 2A, connexion bancaire Qonto ; 2B, facturation Tiime. Le propriétaire utilise actuellement seulement l'application Tiime et fera lui-même la demande d'accès API. Aucun message de demande n'est envoyé en son nom.

Le plan détaillé Qonto reste exécutable indépendamment. Le lot Tiime comporte une préparation réalisable maintenant, puis un plan de connecteur rédigé après réception de la documentation. Cette séparation évite d'inventer des endpoints, scopes, credentials, formats de réponses ou capacités de paiement. Tiime reste dans le jalon 2, même si l'attente d'accès retarde sa clôture.

### 12.2 Préparation réalisable sans accès API

- Présenter Tiime dans Intégrations avec l'état exact « Accès API à obtenir », une explication et l'accès au parcours CSV existant. Aucun bouton de synchronisation actif et aucun faux statut de connexion.
- Définir les contrats métier de facturation indépendants du fournisseur, en réutilisant les invariants du jalon 1 : client, identifiant externe stable, numéro de facture, dates, montants HT/TVA/TTC, devise, statut et règlement connu ou inconnu.
- Prévoir l'identité fournisseur dans `integrations`, `sync_runs` et `provider_object_mappings`, sans créer de faux run ni simuler une connexion en production.
- Documenter les informations à demander à Tiime : éligibilité d'une installation open source self-hosted, authentification officielle, permissions de lecture, documentation des ressources clients/factures/règlements, pagination, mises à jour, limites de débit, environnement de test et conditions de production.
- Conserver le format CSV déjà supporté. Tiime documente un export, mais pas son schéma dans l'article consulté : ne pas promettre une compatibilité directe ni écrire un parseur natif sans format documenté ou exemple entièrement anonymisé. Une conversion explicite vers le CSV existant reste possible.

Ces livrables constituent une préparation Tiime et ne doivent jamais être présentés comme un connecteur Tiime fonctionnel.

### 12.3 Connecteur après obtention de la documentation

Vérifier d'abord les capacités effectivement disponibles et formaliser le contrat d'authentification, les schémas de réponse, l'historique accessible et les règles de reprise dans une spécification complémentaire. Toute incompatibilité matérielle avec le périmètre demandé est présentée au propriétaire avant implémentation. Ne pas inventer de variables Tiime dans `.env.example` avant cette vérification.

La cible est une synchronisation manuelle de clients, factures, échéances et informations de règlement exposées par Tiime. Les données suivent les garanties Qonto : validation Zod aux frontières, centimes entiers, ownership/RLS, idempotence, verrou par intégration, préparation invisible et publication atomique, conservation après échec, retries bornés pour les erreurs temporaires, six codes d'erreur stables et journalisation par liste blanche.

Toutes les lectures sont côté serveur. Aucune création, modification, émission, annulation ou suppression de facture chez Tiime. Aucun accès par API privée déduite de l'application web, scraping ou réutilisation de cookies de session. Les secrets restent hors de Git, du navigateur, des logs, des fixtures et des comptes rendus. Si Tiime exige OAuth avec persistance de tokens, le stockage chiffré et le cycle de renouvellement font l'objet de la conception complémentaire avant toute implémentation.

### 12.4 Factures existantes et autorité des règlements

Une facture Tiime est identifiée par propriétaire, fournisseur et identifiant externe. Une facture déjà importée en CSV ou saisie manuellement ne doit pas être dupliquée lors de l'activation du connecteur. Un numéro identique déclenche une comparaison des attributs disponibles (client, devise, montants et dates), jamais une association au seul nom du client.

Une correspondance certaine permet de lier l'identifiant Tiime à la facture existante en conservant son identifiant interne et ses relations métier. Une collision ambiguë ou contradictoire bloque la publication Tiime avec un message stable de conflit à résoudre, sans écraser l'existant. Aucun rapprochement bancaire automatique n'est ajouté.

Ne jamais additionner un total payé fourni par Tiime et des paiements manuels qui peuvent représenter les mêmes règlements. Pour une facture déjà dotée de paiements manuels, un conflit d'autorité doit être résolu explicitement avant sa prise en charge Tiime. Une donnée de règlement absente signifie « inconnue », jamais « impayée ». Les modalités précises de reprise des paiements dépendent des identifiants et totaux officiellement disponibles et seront spécifiées avant le transport Tiime.

Les factures normalisées alimentent la vue Facturation, les encaissements attendus, les retards et le prévisionnel selon leur reste à payer. Les champs locaux tels que le lien à une commande et les ajustements de date attendue ne sont pas écrasés implicitement par une nouvelle synchronisation.

### 12.5 Validation et clôture

Après accès à la documentation, les tests Tiime utilisent des fixtures fictives conformes au contrat officiel : pagination, rejeu, mise à jour de facture, paiement partiel si exposé, annulation si exposée, donnée absente, conflit CSV/manuel, erreur de connexion, limites de débit, panne de persistance et absence de double comptage au dashboard.

La procédure réelle Tiime est distincte de Qonto et des tests automatisés. Lorsque les credentials deviennent nécessaires, s'arrêter pour indiquer au propriétaire les noms et l'emplacement local précis à renseigner, sans demander les valeurs dans le chat. La vérification réelle n'enregistre ni réponses brutes ni données financières dans les rapports.

Le jalon 2 élargi est terminé seulement lorsque Qonto et Tiime ont chacun leur connecteur conforme au contrat officiel, leurs tests, leur documentation et leur validation réelle. Si l'accès Tiime est encore en attente, rapporter séparément l'état du lot Qonto et la dépendance externe du lot Tiime ; ne pas déplacer silencieusement Tiime au jalon 3 ni déclarer le jalon 2 achevé.
