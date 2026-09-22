# Jalon 3 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Livrer le jalon installation/durcissement sans worker, avec actualisation pendant l'utilisation.

**Architecture:** Conserver les actions serveur et RPC existantes. Ajouter un rapport propriétaire en lecture seule et une page d'installation reprenable. Réutiliser la stack de tests isolée.

**Tech Stack:** Next.js 16, React 19, Supabase/PostgreSQL 17, Vitest, Playwright, Node.js 24.

**Spec:** `docs/superpowers/specs/2026-09-15-milestone-three-design.md`

## Global Constraints

- Next.js local + Supabase hébergé ; aucun worker ni cron.
- Admission après cinq minutes ; temporisation d'échec quinze minutes ; première synchro explicite.
- Tests exclusivement sur `jalon-2-qonto-tests`, API56321/DB56322/Next3200 ; Qonto fictif.
- Préserver modifications préexistantes et serveur3001 ; aucune mutation hébergée.

## Task 1 — Fraîcheur cinq minutes

Files: `supabase/migrations/202609150001_open_app_sync.sql`, `supabase/tests/database/automatic_qonto.test.sql`, `apps/web/src/features/integrations/qonto-freshness.ts`, `qonto-badge.tsx` et leurs tests.

- [x] Tester admission après cinq minutes, rejet avant, reprise après publication, cooldown d'échec et droits existants.
- [x] Observer les échecs sur l'ancienne politique.
- [x] Remplacer la fonction SQL par migration additionnelle : seuil cinq minutes, cooldown seulement sans publication réussie postérieure à la dernière tentative.
- [x] Aligner calcul et libellé de fraîcheur ; vérifier Vitest et concurrence PostgreSQL.

## Task 2 — Installation et diagnostic

Files: `supabase/migrations/202609150002_installation_diagnostic.sql`, `supabase/tests/database/installation_diagnostic.test.sql`, `apps/web/src/features/installation/{report.ts,report.test.ts,repository.ts}`, `apps/web/src/app/(app)/settings/installation/page.tsx`, paramètres et onboarding.

Interface: `loadInstallationReport(client, ownerUserId, qontoConfigured)` retourne des checks identifiés et leur état (`ok`, `attention`, `unknown`), messages fixes et étapes liées aux données persistées. RPC `installation_diagnostic()` retourne contrat1 et délai300, seulement au propriétaire authentifié.

- [x] Tests des états vide, renseigné, inaccessible, migration absente et propriétaire étranger.
- [x] Implémenter requêtes bornées, état dégradé sans erreur brute et page propriétaire avec liens d'étapes.
- [x] Ajouter liens paramètres, arrivée onboarding et recette Chromium reprenable sur mobile/desktop.

## Task 3 — Restauration et documentation

Files: `scripts/test-backup-restore.mjs`, `docs/BACKUP_RESTORE.md`, `docs/DEPLOYMENT.md`, `docs/UPDATES.md`, `CONTRIBUTING.md`, `SECURITY.md`, README, installation.

- [x] Écrire recette isolée refusant tout conteneur autre que `supabase_db_jalon-2-qonto-tests` et toute destination préexistante.
- [x] Exporter des données fictives avec Auth, restaurer dans une base distincte du conteneur jetable, vérifier identité/relations/RLS/montants puis supprimer exclusivement les ressources créées.
- [x] Documenter procédure hébergée officielle, différence avec recette locale, secrets séparés, exploitation sans cron et choix de licence.

## Task 4 — Validation et livraison

- [x] Séparer `.next-isolated` du serveur utilisateur pour les builds et E2E.
- [x] Exécuter tests, lint, types, recette isolée et frontière client ; inspecter rendu desktop/mobile.
- [x] Revoir les changements et corriger les défauts ; consigner résultats, limites et migrations à appliquer séparément.

## Résultats

Voir [la recette locale](../../acceptance/2026-09-15-milestone-three.md).
Les migrations hébergées restent à appliquer séparément ; aucun worker n’a été créé.
