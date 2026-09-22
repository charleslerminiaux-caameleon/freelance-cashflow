# Freelance Cashflow MVP — Design

> Révision du 15 septembre 2026 : le propriétaire a retiré Scaleway et le worker
> autonome. La synchronisation a lieu uniquement pendant l’utilisation de Libra,
> avec un seuil de cinq minutes. Next.js reste local avec Supabase hébergé.
> Le [cadrage du jalon 3](2026-09-15-milestone-three-design.md) remplace les
> dispositions historiques contraires ci-dessous.

**Date:** 5 septembre 2026  
**Statut:** validé en conversation  
**Document source:** `cahier_des_charges_freelance_cashflow_v0.2_open_source.md`

## 1. Objectif

Construire le MVP P0 complet de Freelance Cashflow : une application open source et self-hosted permettant à un freelance français de relier activité commerciale, facturation, banque, dépenses et prévisions de trésorerie.

Le produit doit répondre rapidement aux questions suivantes : combien l'utilisateur possède aujourd'hui, quelle part est réellement disponible, quels montants vont entrer ou sortir, quand la trésorerie passera sous le seuil de sécurité et combien de jours d'autonomie restent.

La première livraison comprend le code, les migrations, les tests, la documentation et un déploiement réel sur les comptes Supabase, Vercel et Scaleway du propriétaire. Les secrets et validations externes seront fournis par le propriétaire au moment des étapes de déploiement concernées.

## 2. Contraintes structurantes

- Le projet est open source et self-hosted.
- Une installation correspond à un propriétaire fonctionnel.
- Il n'existe ni organisation métier, ni équipe, ni rôle SaaS, ni base partagée entre plusieurs installations.
- Supabase PostgreSQL est la source de vérité.
- Le frontend et les workers utilisent TypeScript.
- Next.js suffit comme couche serveur du MVP ; aucun backend FastAPI n'est ajouté.
- Les connecteurs externes sont des adaptateurs du modèle interne.
- La saisie manuelle et l'import CSV sont des parcours officiels et restent utilisables sans fournisseur externe.
- Les calculs financiers sont déterministes, explicables et indépendants de tout LLM.
- La documentation d'installation et de mise à jour fait partie du produit.

## 3. Stratégie de livraison

Le développement suit une verticale complète, puis l'enrichit progressivement.

### Jalon 1 — Parcours manuel démontrable

Construire le parcours :

`Client → Opportunité → Commande → Échéancier → Facture → Paiement → Prévision → Dashboard`

Ce jalon fonctionne avec saisie manuelle et imports CSV. Il valide le modèle métier, le moteur prévisionnel et l'interface sans dépendre d'un accès fournisseur.

### Jalon 2 — Connexion Qonto réelle

Ajouter la récupération des comptes, soldes et transactions depuis le compte Qonto du propriétaire. Le rapprochement permet ensuite de constater les paiements et d'actualiser la prévision.

Le MVP utilise la clé API Qonto propre à chaque installation. Ce mécanisme officiel correspond au cas d'un propriétaire qui automatise son propre compte et permet une validation réelle sans attendre l'approbation d'une application OAuth. L'interface fournisseur reste suffisamment isolée pour permettre l'ajout futur d'OAuth sans modifier le domaine.

### Jalon 3 — Installation et durcissement

Terminer l'onboarding, le diagnostic système, le worker Scaleway, les contrôles de sécurité, les tests de bout en bout, la sauvegarde/restauration et la documentation open source.

Chaque jalon doit produire un logiciel utilisable et testable indépendamment.

## 4. Architecture du repository

Le projet utilise un monorepo `pnpm` sans orchestrateur supplémentaire tant que les scripts de workspace suffisent.

```text
/
├── apps/
│   ├── web/                  # Next.js, UI, routes serveur et webhooks
│   └── sync-worker/          # synchronisation périodique Scaleway
├── packages/
│   ├── database/             # client serveur, types générés et repositories
│   ├── domain/               # règles métier, rapprochement et prévision
│   ├── integrations/         # Qonto et import CSV
│   └── shared/               # schémas Zod, erreurs, dates et journalisation
├── supabase/
│   ├── migrations/           # schéma, contraintes, fonctions et RLS
│   └── seed.sql              # données de démonstration fictives
├── docs/                     # installation, déploiement, mises à jour et sécurité
├── .env.example
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
```

### `apps/web`

Responsabilités :

- authentification et onboarding du propriétaire ;
- CRUD métier ;
- imports CSV ;
- dashboard et graphiques ;
- déclenchement manuel des synchronisations ;
- endpoints serveur nécessaires au connecteur Qonto ;
- page de diagnostic de l'installation.

Les composants navigateur ne lisent que des données métier normalisées. Les accès privilégiés, clés externes et opérations de synchronisation restent dans du code serveur explicitement séparé.

### `apps/sync-worker`

Le worker sélectionne les intégrations actives dont `next_sync_at` est arrivé, exécute une synchronisation incrémentale, normalise les objets, effectue des upserts idempotents et enregistre un `sync_run`.

Le même service de synchronisation métier est appelable depuis une action manuelle côté web et depuis le job Scaleway. Il n'existe qu'une seule implémentation de la logique de synchronisation.

### `packages/domain`

Le domaine ne dépend ni de React, ni de Next.js, ni de Supabase. Il contient notamment :

- transitions d'opportunités et conversion en commande ;
- échéanciers de facturation ;
- statuts de facture ;
- rapprochement facture-paiement ;
- génération des événements de trésorerie ;
- scénarios et projection ;
- runway et seuil de sécurité.

### `packages/integrations`

Chaque fournisseur expose des objets normalisés et ne laisse jamais remonter son JSON brut dans le domaine. Le package contient :

- un client Qonto serveur ;
- les schémas Zod des réponses utilisées ;
- le mapping des comptes et transactions ;
- la pagination et les curseurs ;
- l'adaptateur d'import CSV ;
- les erreurs fournisseur normalisées.

## 5. Identité visuelle et navigation

Les fichiers `dashboard-5a.png` et `logo.jpeg` constituent les références visuelles du MVP.

Principes retenus :

- fond clair et surfaces sobres ;
- vert pétrole comme couleur principale ;
- alertes corail utilisées avec parcimonie ;
- monogramme blanc « FC » sur fond sombre ;
- typographie directe, chiffres tabulaires et forte hiérarchie ;
- densité d'information élevée mais espacements généreux ;
- navigation latérale sur grand écran et navigation compacte sur mobile.

La navigation principale contient :

- Dashboard ;
- Opportunités ;
- Commandes ;
- Facturation ;
- Trésorerie ;
- Charges ;
- Intégrations ;
- Paramètres.

La maquette définit une direction visuelle, pas des valeurs statiques. Tous les indicateurs et libellés affichés doivent provenir du modèle réel.

## 6. Modèle de données

Le modèle reprend les entités du cahier des charges :

- `app_settings` ;
- `customers` ;
- `opportunities` ;
- `engagements` ;
- `billing_schedule_items` ;
- `invoices` ;
- `invoice_payments` ;
- `bank_accounts` ;
- `bank_transactions` ;
- `recurring_cashflows` ;
- `planned_cashflows` ;
- `cashflow_categories` ;
- `integrations` ;
- `sync_runs` ;
- `provider_object_mappings`.

### Propriété et autorisation

Chaque ligne sensible porte `owner_user_id UUID NOT NULL`. Les politiques RLS autorisent le propriétaire authentifié à lire et modifier uniquement ses lignes. Les écritures serveur privilégiées vérifient également le propriétaire au niveau applicatif.

Le premier compte confirmé devient propriétaire de l'instance. Une configuration persistée verrouille ensuite la création libre de nouveaux comptes. Une installation ne possède pas de table `organizations`.

### Montants

Tous les montants métier sont représentés en centimes entiers dans TypeScript et en `BIGINT` dans PostgreSQL. Les frontières Zod refusent les nombres non entiers, non sûrs ou hors limites. Les conversions depuis les fournisseurs et CSV utilisent une fonction unique qui parse les valeurs décimales sans calcul flottant.

Les pourcentages et probabilités sont représentés en points de base entiers lorsque des calculs sont nécessaires. Par exemple, 40 % est stocké comme `4000`.

### Dates

Les dates métier sans heure, comme une échéance, sont stockées en `DATE` et manipulées comme chaînes ISO `YYYY-MM-DD`. Les instants techniques, comme une synchronisation, sont stockés en `TIMESTAMPTZ`. La timezone de l'instance, `Europe/Paris` par défaut, détermine la date métier courante.

### Idempotence

Les ressources fournisseur possèdent une contrainte unique sur `owner_user_id`, `provider`, `object_type` et `external_id`, ou son équivalent adapté à la table. Les paiements, transactions et factures ne peuvent pas être dupliqués par un retry.

## 7. Parcours fonctionnels

### Onboarding

1. Créer ou confirmer le propriétaire.
2. Paramétrer devise, timezone et forme juridique.
3. Définir le seuil de sécurité et les réserves.
4. Configurer les charges principales.
5. Configurer Qonto ou passer temporairement cette étape.
6. Choisir la saisie manuelle ou l'import CSV pour la facturation.
7. Lancer une première synchronisation lorsqu'une intégration est configurée.
8. Ouvrir le dashboard.

### Commercial et commandes

L'utilisateur crée un client, saisit une opportunité et la fait progresser entre les statuts. Une opportunité gagnée peut être convertie une seule fois en commande. La commande reprend les données utiles et reçoit un ou plusieurs jalons de facturation.

### Facturation

Une facture peut être saisie ou importée. Elle est rapprochée d'un jalon de facturation et éventuellement d'une ou plusieurs transactions bancaires. Les statuts internes restent indépendants du fournisseur : brouillon, émise, partiellement payée, payée, en retard ou annulée.

### Banque

La connexion Qonto lit les comptes, soldes et transactions. Le MVP n'émet aucun virement et n'initie aucun paiement. Une synchronisation manuelle est disponible, puis le worker assure l'actualisation périodique.

### Charges et réserves

L'utilisateur gère les charges récurrentes, les sorties ponctuelles, sa rémunération prévisionnelle et ses réserves fiscales ou sociales configurables. L'application ne présente jamais ces réserves comme un calcul fiscal officiel.

### Dashboard

Le dashboard expose :

- solde réel ;
- montant réellement disponible après réserves ;
- entrées et sorties sur la période ;
- solde projeté ;
- runway ;
- courbe de trésorerie certaine et probable ;
- date de passage sous le seuil ;
- factures à relancer ;
- éléments à facturer ;
- prochaines entrées et sorties.

Les horizons visibles sont 30 jours, 90 jours et 6 mois. Les scénarios restent certain, engagé et probable ; les contrôles permettent également d'inclure ou exclure explicitement les catégories d'événements décrites dans la maquette.

## 8. Moteur prévisionnel

Le moteur reçoit un solde initial, une période, un seuil de sécurité, un scénario et une liste de `CashflowEvent`. Il retourne les points de solde, les entrées et sorties quotidiennes, le solde minimum, sa date et le runway.

Les événements proviennent de :

- transactions constatées ;
- factures émises non encaissées ;
- échéances de commandes signées ;
- opportunités pondérées ;
- charges récurrentes ;
- sorties ponctuelles ;
- rémunérations ;
- réserves configurées.

Un scénario filtre ou pondère les événements à partir de règles explicites. Chaque point du graphique doit pouvoir être expliqué par la liste des événements qui le composent.

La projection est calculée à la demande à partir des données sources. Aucun cache persistant n'est nécessaire pour le volume d'une instance mono-utilisateur tant que les mesures ne démontrent pas le contraire.

## 9. Intégration Qonto

### Authentification du MVP

Chaque installateur renseigne ses propres valeurs Qonto dans les secrets serveur. La valeur de la clé API n'est jamais enregistrée dans Git, exposée dans le HTML, retournée par une route ou envoyée à un système de journalisation.

L'interface d'intégration indique seulement si la configuration est présente et si le dernier appel a réussi. Elle ne permet jamais de relire un secret existant.

### Synchronisation

La synchronisation :

1. crée un `sync_run` ;
2. récupère comptes et transactions page par page ;
3. valide chaque réponse avec Zod ;
4. normalise les objets ;
5. effectue les upserts idempotents ;
6. avance le curseur uniquement après une page persistée ;
7. termine le `sync_run` avec compteurs et statut ;
8. recalcule l'état visible du dashboard à la prochaine lecture.

Une exécution concurrente sur la même intégration est empêchée par un verrou explicite en base.

## 10. Gestion des erreurs et observabilité

Les erreurs externes sont converties en codes stables :

- `PROVIDER_AUTH_EXPIRED` ;
- `PROVIDER_RATE_LIMIT` ;
- `PROVIDER_UNAVAILABLE` ;
- `PROVIDER_INVALID_RESPONSE` ;
- `SYNC_LOCKED` ;
- `DATABASE_ERROR`.

L'interface affiche une explication actionnable et conserve la dernière donnée valide. Un échec de synchronisation ne supprime ni ne remplace les données existantes.

Les retries utilisent un délai exponentiel borné et ne s'appliquent qu'aux erreurs temporaires. Les erreurs d'authentification exigent une action de l'utilisateur. Les logs structurés contiennent identifiants techniques, durées, compteurs et codes d'erreur, mais aucun token, IBAN complet, libellé bancaire sensible ou payload financier brut.

La page de diagnostic affiche l'état de Supabase, du propriétaire, des migrations, de Qonto, du worker, de la dernière synchronisation et de la version déployée.

## 11. Sécurité et secrets

- `.env*` est ignoré par Git, à l'exception de `.env.example`.
- `.env.example` contient des noms de variables et des valeurs vides ou manifestement fictives.
- Les secrets de production sont configurés dans Vercel et Scaleway.
- Les clés privilégiées ne sont importées que par des modules marqués serveur.
- Les routes et actions vérifient la session et la propriété des objets.
- Les tokens dynamiques futurs sont chiffrés avec AES-GCM avant persistance.
- La CI exécute une détection de secrets sur le repository.
- Les logs appliquent une liste blanche de champs autorisés plutôt qu'une suppression opportuniste de champs sensibles.
- La déconnexion Qonto supprime la configuration locale applicable et bloque les synchronisations suivantes.
- Le projet fournit une procédure de rotation et de révocation des secrets.

## 12. Tests et critères de qualité

### Tests unitaires

- calculs en centimes et arrondis ;
- statuts de facture ;
- conversion opportunité-commande ;
- génération de récurrences ;
- scénarios ;
- projection et runway ;
- rapprochement ;
- normalisation Qonto et CSV.

### Tests d'intégration

- migrations et contraintes ;
- politiques RLS ;
- verrouillage du propriétaire ;
- imports rejoués ;
- pagination et synchronisation incrémentale ;
- retry, indisponibilité et réponse invalide ;
- concurrence de synchronisation ;
- clé Qonto absente ou rejetée.

Les tests Qonto automatisés utilisent des fixtures anonymes et des réponses simulées. Une procédure séparée valide la connexion réelle avec la clé du propriétaire sans enregistrer cette clé ni les réponses brutes dans le repository.

### Tests E2E

Playwright couvre le parcours complet depuis l'onboarding jusqu'au dashboard : création d'une opportunité, conversion, échéancier, facture, paiement, charge, prévision et affichage du risque.

### Installation

Une vérification finale part d'un clone vierge, applique les migrations, lance l'application, effectue l'onboarding, importe des données fictives et affiche un dashboard cohérent. Le déploiement réel vérifie ensuite Supabase, Vercel, Scaleway et Qonto.

## 13. Déploiement

### Supabase

Le repository fournit les migrations, fonctions, politiques RLS, types générés et seed fictif. Le propriétaire crée son projet et fournit les URL et clés nécessaires au moment de la configuration.

### Vercel

Vercel déploie `apps/web`. Les variables publiques se limitent aux valeurs explicitement sûres pour le navigateur. Les clés privilégiées et Qonto restent des secrets serveur.

### Scaleway

Le worker TypeScript est produit sous forme d'image pour Serverless Jobs. Le job reçoit ses secrets via la configuration Scaleway et s'exécute périodiquement sans serveur permanent.

### Mise à jour et portabilité

Les migrations sont ordonnées, versionnées et non destructives autant que possible. La documentation décrit mise à jour, export PostgreSQL, restauration, migration vers un nouveau projet Supabase et reconnexion des fournisseurs.

## 14. Documentation open source

La première publication comprend :

- un `README.md` présentant le produit, l'architecture, les prérequis, l'installation et les limites ;
- `.env.example` documenté ;
- `CONTRIBUTING.md` ;
- `SECURITY.md` ;
- les guides Supabase, Vercel, Scaleway, Qonto, mise à jour et sauvegarde/restauration ;
- une licence choisie par le propriétaire avant publication.

La licence n'est pas sélectionnée implicitement par l'implémentation. Le repository reste privé tant que le propriétaire n'a pas choisi la licence et vérifié l'historique avant la première publication publique.

## 15. Hors périmètre du MVP

- comptabilité complète ;
- déclarations fiscales ou sociales ;
- initiation de paiements ;
- paie ;
- facturation native complète ;
- architecture multi-tenant ;
- API Tiime non officiellement accessible ;
- Pennylane et autres banques ;
- Open Banking ;
- PWA ;
- fonctions IA ;
- projections avancées au-delà des horizons du dashboard.

## 16. Critères d'acceptation

Le MVP est terminé lorsque :

1. le parcours commercial jusqu'au paiement et au dashboard fonctionne ;
2. les charges, rémunérations et réserves influencent la projection ;
3. les scénarios, le runway et la date de risque sont corrects et testés ;
4. Qonto récupère réellement comptes, soldes et transactions du propriétaire ;
5. la saisie manuelle et le CSV fonctionnent sans Qonto ;
6. la sécurité empêche l'accès d'un utilisateur non propriétaire ;
7. aucun secret n'est présent dans Git, le frontend, les fixtures ou les logs ;
8. une installation vierge peut reproduire le fonctionnement documenté ;
9. les déploiements Supabase, Vercel et Scaleway sont opérationnels ;
10. le dashboard respecte la direction visuelle validée et reste utilisable sur mobile.
