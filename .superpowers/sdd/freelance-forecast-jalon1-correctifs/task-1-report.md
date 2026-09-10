# Task 1 — Dates courtes du dashboard

## Implémentation

- Ajout de `formatShortLocalDate(LocalDate): string` dans `@fc/shared`, qui produit `JJ/MM` sans conversion de fuseau horaire.
- Export public du formateur depuis `@fc/shared`.
- Application aux graduations et à l’infobulle du graphique, au résumé de risque, aux échéances à facturer et aux flux à venir.
- Les `LocalDate` utilisés pour les calculs, tris et le view-model restent au format ISO. La date longue localisée de l’en-tête n’a pas été modifiée.

## Fichiers modifiés

- `packages/shared/src/local-date.ts`
- `packages/shared/src/local-date.test.ts`
- `packages/shared/src/index.ts`
- `apps/web/src/features/dashboard/cashflow-chart.tsx`
- `apps/web/src/features/dashboard/action-list.tsx`
- `apps/web/src/features/dashboard/upcoming-lists.tsx`
- `apps/web/src/features/dashboard/view-model.ts`
- `apps/web/src/features/dashboard/dashboard-components.test.tsx`
- `apps/web/src/features/dashboard/view-model.test.ts`

## Preuve TDD

1. RED — `pnpm --filter @fc/shared test:run -- src/local-date.test.ts` : échec attendu, `formatShortLocalDate is not a function`, après ajout du test `2026-12-31 → 31/12` et avant tout code de production.
2. GREEN — même commande : 2 fichiers / 11 tests réussis après l’implémentation minimale et son export.
3. RED dashboard — `pnpm --filter @fc/web test:run -- src/features/dashboard/dashboard-components.test.tsx src/features/dashboard/view-model.test.ts` : 3 échecs attendus ; les échéances et flux rendaient encore `2026-09-15`/`2026-09-20`, et le résumé de risque `2026-11-13`.
4. GREEN dashboard — même commande : 47 fichiers / 192 tests réussis, puis `@fc/shared` : 2 fichiers / 11 tests réussis.

## Vérifications

- `pnpm test:run` : réussi. Shared 11 tests, domain 39, integrations 10, web 192, tooling 12.
- `pnpm typecheck` : réussi pour shared, domain, integrations et web.
- `git diff --check` : réussi, sans erreur d’espaces.

## Auto-review

- Vérifié que `formatShortLocalDate` prend un `LocalDate` validé et découpe directement l’ISO (`jour/mois`), ce qui évite les effets de fuseau horaire.
- Vérifié que les données de domaine et de calcul demeurent ISO ; seules les chaînes rendues au dashboard changent.
- Vérifié que le graphique utilise le même formateur pour les graduations et l’infobulle.
- Les tests ajoutés couvrent le contrat partagé, le résumé de risque, les échéances à facturer et les flux à venir avec des attentes littérales.

## Préoccupations

Aucune. Les sorties des callbacks Recharts sont désormais protégées par des tests comportementaux ciblés.

## Fix round 1

### Changements et fichiers

- Extraction de `formatCashflowChartTick` et `formatCashflowChartTooltipLabel` dans `apps/web/src/features/dashboard/cashflow-chart.tsx`, puis branchement des callbacks Recharts réels sur ces fonctions.
- Ajout de deux tests comportementaux à `apps/web/src/features/dashboard/dashboard-components.test.tsx`, avec l’attente littérale `2026-12-31 → 31/12` pour les graduations et `Date : 31/12` pour l’infobulle.

### Preuve RED/GREEN

1. RED — `pnpm --filter @fc/web test:run -- src/features/dashboard/dashboard-components.test.tsx` : 2 échecs attendus, `formatCashflowChartTick is not a function` et `formatCashflowChartTooltipLabel is not a function`, avant l’extraction.
2. GREEN — même commande : 47 fichiers / 194 tests réussis après l’extraction et le branchement des callbacks.

### Vérifications

- `pnpm --filter @fc/web test:run -- src/features/dashboard/dashboard-components.test.tsx` : réussi, 47 fichiers / 194 tests.
- `pnpm --filter @fc/web typecheck` : réussi (`next typegen && tsc --noEmit`).
- `git diff --check` : réussi.
