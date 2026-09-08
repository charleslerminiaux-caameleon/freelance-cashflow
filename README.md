# Freelance Cashflow

Freelance Cashflow relie le pipeline commercial, la facturation, les paiements, les charges et la prévision de trésorerie d’un freelance. L’application est conçue pour une installation self-hosted appartenant à un seul propriétaire fonctionnel.

![Référence visuelle du dashboard](docs/assets/dashboard-reference.png)

## Périmètre actuel

Le Jalon 1 couvre le parcours manuel complet :

`Client → Opportunité → Commande → Échéancier → Facture → Paiement → Prévision → Dashboard`

Il comprend aussi l’import de factures CSV, les charges récurrentes et ponctuelles, les réserves, les horizons 30/90/180 jours et les scénarios certain/engagé/probable. Toutes les données affichées par le dashboard proviennent de PostgreSQL et du moteur de prévision déterministe.

La connexion Qonto n’est pas encore incluse : elle constitue le Jalon 2 et restera strictement en lecture seule. La saisie manuelle et l’import CSV continueront à fonctionner sans fournisseur externe.

## Architecture

Le repository est un monorepo pnpm :

- `apps/web` : application Next.js, authentification, écrans métier et dashboard ;
- `packages/domain` : règles financières et moteur de prévision sans dépendance à Next.js ou Supabase ;
- `packages/integrations` : normalisation des imports CSV et futurs connecteurs ;
- `packages/shared` : montants en centimes, dates locales et primitives partagées ;
- `supabase` : migrations PostgreSQL, RLS, fonctions métier, seed et tests pgTAP.

Supabase PostgreSQL est la source de vérité. Une installation correspond à un propriétaire, et les tables financières sont isolées par `owner_user_id` et Row Level Security.

## Démarrage local

Prérequis : Node.js 24, pnpm 10 via Corepack, Docker et une connexion nécessaire au premier téléchargement des dépendances.

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm dlx supabase start
corepack pnpm dlx supabase db reset --local
cp .env.example apps/web/.env.local
```

Renseignez ensuite dans `apps/web/.env.local` les trois valeurs locales indiquées par `corepack pnpm dlx supabase status --output env`, puis lancez :

```bash
corepack pnpm dev
```

Le guide détaillé est disponible dans [docs/INSTALLATION.md](docs/INSTALLATION.md). Les règles de manipulation des clés sont décrites dans [docs/SECURITY_LOCAL.md](docs/SECURITY_LOCAL.md).

## Vérifications

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:run
corepack pnpm build
corepack pnpm dlx supabase test db
corepack pnpm e2e
```

Le test E2E crée un compte fictif local, exécute le parcours complet dans Chromium et le supprime en fin d’exécution. Il refuse une URL Supabase non locale.

## Statut open source

Le code est destiné à être publié en open source, mais le repository doit rester privé tant que le propriétaire n’a pas choisi la licence et audité l’historique Git. Aucune licence n’est attribuée implicitement.

Les données et calculs présentés ne constituent ni une comptabilité complète ni un conseil fiscal, social ou financier.
