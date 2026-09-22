# Contribuer à Libra

Le code du projet est distribué sous la licence [GNU AGPL-3.0](LICENSE).
En proposant une contribution, vous acceptez que celle-ci soit distribuée sous
cette même licence.

## Environnement

Node.js 24, pnpm 10.17.1 via Corepack et Docker pour la recette isolée. Installer
avec `corepack pnpm install --frozen-lockfile`. Suivre [INSTALLATION.md](docs/INSTALLATION.md).
Utiliser exclusivement des données fictives pour les tests et captures. Le moteur
financier dans `packages/domain` reste déterministe et indépendant de Next.js.

## Proposer un changement

Créer une branche `codex/…` ou une branche de contribution distincte. Décrire le
problème concret, le comportement attendu et les résultats des vérifications.
Conserver les montants en centimes entiers, les contrôles propriétaire/RLS et la
séparation des secrets serveur. Ajouter une migration plutôt que modifier une
migration déjà distribuée. Écrire un test ciblé pour chaque nouvelle règle métier
ou correction qui le justifie.

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:run
corepack pnpm test:isolated
corepack pnpm test:client-boundary
```

Les tests unitaires nécessitent les trois variables Supabase avec des valeurs
fictives (URL `http://127.0.0.1:56321`, clés `fake-unit-anon` et
`fake-unit-service`). Les tests isolés récupèrent leurs identifiants en mémoire.
N'utilisez jamais les identifiants du propriétaire pour rendre un test vert.
La recette de restauration se lance séparément avec
`node scripts/test-backup-restore.mjs` après la recette PostgreSQL.

Pour Next.js, lire les consignes de `apps/web/AGENTS.md` et la documentation
installée. Les builds isolés utilisent `.next-isolated`, séparément du serveur
utilisateur. Les scans de secrets et de frontière client font partie de la CI.
