# Freelance Cashflow

Freelance Cashflow relie le pipeline commercial, la facturation, les paiements, les charges et la prévision de trésorerie d’un freelance. L’application est conçue pour une installation self-hosted appartenant à un seul propriétaire fonctionnel.

![Référence visuelle du dashboard](docs/assets/dashboard-reference.png)

## Périmètre actuel

Le Jalon 1 couvre le parcours manuel complet :

`Client → Opportunité → Commande → Échéancier → Facture → Paiement → Prévision → Dashboard`

Il comprend aussi l’import de factures CSV, les charges récurrentes et ponctuelles, les réserves, les horizons 30/90/180 jours et les scénarios certain/engagé/probable. Toutes les données affichées par le dashboard proviennent de PostgreSQL et du moteur de prévision déterministe.

La connexion Qonto en lecture seule, sa synchronisation atomique et ses vues bancaires sont implémentées et testées avec HTTP fictif et PostgreSQL réel. La validation du compte réel reste à effectuer. Tiime dispose de contrats internes et d’un écran de préparation ; son connecteur attend l’accès API officiel. Le Jalon 2 complet reste donc en attente des validations réelles. Voir [Qonto](docs/QONTO.md) et [Tiime](docs/TIIME.md). Les parcours manuels/CSV restent disponibles.

## Architecture

Le repository est un monorepo pnpm :

- `apps/web` : application Next.js, authentification, écrans métier et dashboard ;
- `packages/domain` : règles financières et moteur de prévision sans dépendance à Next.js ou Supabase ;
- `packages/integrations` : normalisation CSV, adaptateur Qonto serveur et contrats Tiime ;
- `packages/shared` : montants en centimes, dates locales et primitives partagées ;
- `supabase` : migrations PostgreSQL, RLS, fonctions métier, seed et tests pgTAP.

Supabase PostgreSQL est la source de vérité. Une installation correspond à un propriétaire, et les tables financières sont isolées par `owner_user_id` et Row Level Security.

## Démarrage

L’installation choisie utilise **Next.js local avec Supabase hébergé**. Node.js 24 et pnpm 10 via Corepack suffisent au fonctionnement ; Docker est réservé aux tests isolés et à l’alternative de développement locale.

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Le propriétaire configure auparavant les variables Supabase et Qonto dans le fichier ignoré `apps/web/.env.local`. Le guide [INSTALLATION.md](docs/INSTALLATION.md) distingue cette installation de la stack Docker de test. Les deux nouvelles migrations de détection des récurrences restent en attente d’une autorisation explicite sur le projet hébergé ; aucun reset n’est autorisé sur celui-ci.

Les charges mensuelles détectées apparaissent dans **Sorties** après analyse. Elles restent sans effet financier avant confirmation ou association ; les corrections sont conservées et les mois déjà payés sont exclus de la projection. Voir [Détection des récurrences](docs/RECURRING_DETECTION.md).

## Vérifications

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:run
corepack pnpm build
corepack pnpm test:isolated
corepack pnpm test:client-boundary
```

Les tests isolés dérivent une stack jetable `jalon-2-qonto-tests` (ports 563xx) et lancent Chromium sur 3200. Ils refusent toute autre stack, gardent les identifiants en mémoire et remplacent les variables Qonto par des canaris fictifs sous interception HTTP. Les parcours manuel, Qonto et récurrences créent chacun leur propriétaire fictif puis le suppriment. Voir les sous-commandes dans [QONTO.md](docs/QONTO.md).

## Statut open source

Le code est destiné à être publié en open source, mais le repository doit rester privé tant que le propriétaire n’a pas choisi la licence et audité l’historique Git. Aucune licence n’est attribuée implicitement.

Les données et calculs présentés ne constituent ni une comptabilité complète ni un conseil fiscal, social ou financier.
