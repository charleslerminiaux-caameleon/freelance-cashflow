# Task 10 — Rapport de fiabilité E2E CI

## Diagnostic confirmé

Le journal CI décrit un parcours stateful non idempotent : la première tentative persistait le propriétaire pendant l’action Server Action, puis expirait avant la redirection vers `/dashboard`. Le retry Playwright relançait ensuite le même parcours avec un propriétaire déjà présent et était redirigé directement vers le dashboard, où l’attente du titre d’onboarding échouait. Le problème est donc dans le harnais E2E, pas dans l’authentification, l’application ou la base.

## RED observé

À `baa7ab3`, `apps/web/e2e/manual-cashflow.spec.ts` utilisait le timeout Playwright implicite de 5 secondes pour l’attente de l’écran d’onboarding et de l’URL `/dashboard`, et `apps/web/playwright.config.ts` configurait `retries: 1` en CI. La commande `CI=true corepack pnpm --filter @fc/web e2e` a été relancée avant correction ; elle s’arrête ici car aucune stack Supabase locale n’est démarrée dans cet environnement (`La stack Supabase locale ... doit être démarrée`).

## Changements

- Attente explicite de 30 secondes pour la transition connexion → titre exact `Préparer votre prévision de trésorerie`.
- Attente explicite de 30 secondes pour la transition validation onboarding → URL `/dashboard`.
- Retries Playwright désactivés (`retries: 0`) pour éviter de rejouer un parcours stateful et de masquer un échec réel.
- Aucun changement applicatif, schéma, base ou secret.

## Commandes et résultats

- `git diff --check` — OK.
- `CI=true corepack pnpm --filter @fc/web exec playwright test --list` — OK, 1 test listé.
- `corepack pnpm typecheck` — OK, tous les packages terminés avec succès.
- `CI=true corepack pnpm --filter @fc/web e2e` — BLOQUÉ avant lancement : Supabase locale indisponible.
- `corepack pnpm dlx supabase@2.116.0 status` — BLOQUÉ par l’environnement sandbox (`EPERM` lors de l’écriture de `~/.supabase/telemetry.json`).

## Auto-review

Le diff ne touche que la configuration Playwright et le scénario E2E concernés sous `apps/web`. Les attentes fonctionnelles restent précises, les valeurs ajoutées sont des timeouts locaux non secrets, et aucun retry implicite ne peut relancer ce parcours. Le test E2E complet doit encore être exécuté sur une machine disposant d’une stack Supabase locale propre et d’une instance Next froide.

## Commit

Commit atomique initial : `5a18c6fbd6d73e6a50126397460a4b6668c9e8f1`. Le rapport a ensuite été amendé uniquement pour enregistrer cette référence ; le SHA final amendé est fourni dans le compte rendu de tâche.

## Réserves

La vérification E2E de bout en bout n’a pas pu être réalisée ici faute de Supabase locale accessible ; le typecheck et le chargement/listing Playwright sont validés.
