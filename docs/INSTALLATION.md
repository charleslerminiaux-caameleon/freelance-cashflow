# Installation locale

Ce guide démarre une installation de développement reproductible du parcours manuel. Il ne configure ni Qonto ni un déploiement cloud.

## Prérequis

- Node.js 24 ;
- Corepack et pnpm 10 ;
- Docker Desktop ou un moteur Docker compatible ;
- Git ;
- Chromium, installé automatiquement par Playwright à l’étape E2E.

Vérifiez les versions :

```bash
node --version
corepack pnpm --version
docker version
```

## 1. Installer les dépendances

Depuis la racine du repository :

```bash
corepack enable
corepack pnpm install --frozen-lockfile
```

## 2. Démarrer Supabase

Le projet utilise les ports dédiés définis dans `supabase/config.toml` afin de ne pas interférer avec une autre stack locale.

```bash
corepack pnpm dlx supabase@2.116.0 start
corepack pnpm dlx supabase@2.116.0 db reset --local
```

La remise à zéro recrée uniquement la base de cette stack locale, applique toutes les migrations et charge le seed fictif.

## 3. Configurer l’environnement web

Créez un fichier local ignoré par Git :

```bash
cp .env.example apps/web/.env.local
corepack pnpm dlx supabase@2.116.0 status --output env
```

Reportez les valeurs locales sans les publier ni les copier dans un ticket :

| Sortie Supabase | Variable dans `apps/web/.env.local` | Exposition |
| --- | --- | --- |
| `API_URL` | `NEXT_PUBLIC_SUPABASE_URL` | navigateur autorisé |
| `ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navigateur autorisé |
| `SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` | serveur uniquement |

Même en local, ne préfixez jamais la clé service-role par `NEXT_PUBLIC_`.

## 4. Lancer l’application

```bash
corepack pnpm dev
```

Ouvrez `http://localhost:3000`, créez le premier compte propriétaire puis terminez l’onboarding. Utilisez uniquement des données fictives pour le développement et les captures.

## 5. Exécuter les vérifications

Les commandes TypeScript et application :

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:run
corepack pnpm build
```

Les migrations, contraintes PostgreSQL, concurrence et scénarios Qonto sur la stack jetable dédiée :

```bash
corepack pnpm test:isolated
```

Le parcours complet Chromium :

```bash
corepack pnpm --filter @fc/web exec playwright install chromium
corepack pnpm e2e
```

Le lanceur E2E récupère toujours les clés de la stack dédiée en mémoire et remplace les valeurs héritées. Le mot de passe aléatoire du compte de test n’est écrit dans aucun fichier.

## 6. Arrêter l’environnement

Conservez les données locales :

```bash
corepack pnpm dlx supabase@2.116.0 stop
```

Supprimez les volumes et données de cette stack locale :

```bash
corepack pnpm dlx supabase@2.116.0 stop --no-backup
```

Cette dernière commande est destructive pour la stack du repository courant. Vérifiez toujours le `project_id` avant de l’utiliser.

## Acceptation isolée et fournisseurs

Pour les tests, utilisez `corepack pnpm test:isolated` : ce harness dérive une configuration jetable dans `.isolated-tests/`, sans toucher la configuration source ni copier `.env.local`. Il utilise le projet `jalon-2-qonto-tests`, API 56321, PostgreSQL 56322 et le serveur web 3200, sans réutiliser un serveur existant. `corepack pnpm test:client-boundary` construit avec de faux canaris et inspecte les fichiers clients. Docker doit être démarré et Chromium installé.

Pour Qonto réel, utilisez une autre installation avec son propre project_id et ses ports, puis renseignez vous-même son fichier ignoré `apps/web/.env.local` : [procédure Qonto](QONTO.md). Ne lancez jamais les tests contre cette installation. La préparation Tiime et la demande d’accès sont détaillées dans [TIIME.md](TIIME.md). Aucun accès fournisseur réel n’est requis pour les tests.
