# Jalon 3 — Recette locale du 15 septembre 2026

## Périmètre livré

Installation Next.js locale avec Supabase hébergé conservée. Aucun worker,
Scaleway ou cron. Nouvelle admission SQL après cinq minutes de fraîcheur,
quinze minutes entre tentatives sans publication, première synchronisation
explicite. Badge aligné, onboarding vers une page reprenable dans les paramètres,
diagnostic propriétaire, lectures optionnelles bornées, en-têtes de sécurité,
recette de restauration et guides d'exploitation/distribution.

Les modifications préexistantes de scénarios, factures et opportunités ont été
conservées. Les E2E ont été alignés sur leurs libellés et leurs contrôles actuels.
Une correction de marge et taille du paragraphe explicatif garde le dashboard
complet visible à 1366 × 768, sans changement des calculs.

## Vérifications exécutées

| Vérification | Résultat |
| --- | --- |
| `corepack pnpm test:run` avec configuration Supabase fictive | 757 tests unitaires + 26 tests de scripts réussis |
| `corepack pnpm lint` | Réussi |
| `corepack pnpm typecheck` avec marqueur de stack dédiée | Réussi |
| `node scripts/run-isolated-tests.mjs db` | 637 assertions pgTAP et trois sondes de concurrence réussies |
| `node scripts/test-backup-restore.mjs` | Export/restauration séparée, Auth réel, montants, relations, historique et RLS réussis |
| `node scripts/run-isolated-tests.mjs integration` | Neuf tests réussis, PostgreSQL réel et Qonto simulé |
| Recette Chromium | Cinq parcours réussis : installation, parcours manuel, Qonto, récurrences, dashboard |
| `node scripts/run-isolated-tests.mjs build` | Build final réussi, 25 fichiers clients inspectés sans marqueurs de secrets/adaptateurs |
| `git diff --check` | Réussi |

La dernière recette dashboard a été relancée seule après la correction des marges.
Les captures d'installation 1440/390 et dashboard compact ont été inspectées.
La revue indépendante a identifié une lecture non bornée dans le layout ; elle
est corrigée, testée et revue. Des tests supplémentaires vérifient directement
les lectures PostgREST en cas de RPC absente, d'accès refusé ou de délai dépassé.

Les recettes utilisent exclusivement `jalon-2-qonto-tests`, API56321/DB56322 et
Next3200. Le dossier `.next-isolated` sépare leurs builds du serveur utilisateur.
Les dumps sont fictifs ; les secrets temporaires restent hors des rapports.
Le test de restauration est désormais inclus dans les modes `db` et `all` du
harness, et reste exécutable séparément.

## Activation et limites

Les migrations `202609150001_open_app_sync.sql` et
`202609150002_installation_diagnostic.sql` n'ont pas été appliquées sur Supabase
hébergé. Leur activation suit [UPDATES.md](../UPDATES.md) et la procédure existante
d'autorisation par fichiers. Tant que cette activation manque, la base garde son
ancienne politique et le diagnostic ne confirme pas sa compatibilité.

Aucun déploiement Vercel, accès Qonto réel, restauration hébergée, fusion, push ou
publication open source n'a été effectué. La branche locale est
`codex/jalon-3-installation` ; les changements restent non committés avec les
modifications antérieures. La licence reste à choisir avant publication et
Tiime reste en attente d'accès officiel dans le jalon 2.

Le scan Gitleaks de l'historique est configuré en CI mais n'a pas été exécuté
localement ; le contrôle de frontière client effectué ne remplace pas cet audit.
La recette de restauration locale ne couvre pas la configuration externe des
services ni une bascule réelle du propriétaire vers un nouveau projet hébergé.
