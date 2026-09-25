# Fabrication et livraison des installateurs

## Environnement

Utiliser un checkout propre, sans fichiers `.env` locaux, Node.js 24.20.0 et pnpm 10.17.1. Le lockfile épingle Electron 44.4.5 et electron-builder 26.15.3. Les sources de la version Next.js installée dans `apps/web/node_modules/next/dist/docs` restent la référence locale.

Construire nativement sur chaque cible : macOS arm64 et Windows x64. La workflow (manuelle ou déclenchée sur la branche de test `codex/desktop-installer`) `.github/workflows/desktop.yml` vérifie l’architecture effective avant de fabriquer un artefact non signé. Elle ne publie aucune release.

## Commandes

```sh
corepack pnpm install --frozen-lockfile
node apps/desktop/node_modules/electron/install.js
corepack pnpm --filter @fc/desktop test:run
corepack pnpm --filter @fc/web exec vitest run --maxWorkers=2
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm desktop:stage
corepack pnpm desktop:smoke
corepack pnpm --filter @fc/desktop exec playwright test
corepack pnpm desktop:package
```

`desktop:stage` compile Next.js dans `.next-desktop` avec des valeurs fictives, matérialise les dépendances pnpm, copie les migrations et télécharge les runtimes officiels. Les archives Node 24.20.0 et Supabase CLI 2.116.0 ont des SHA-256 épinglées dans `apps/desktop/runtime-manifest.json`. La CLI comprend `supabase` et son compagnon `supabase-go`. Les licences accompagnent les binaires.

Les fichiers sortent dans `apps/desktop/dist`, avec `SHA256SUMS.txt`. Ne pas committer les runtimes, caches, paquets ou fichiers de données. L’application fonctionne ensuite sans outil de développement sur la machine cible.

Le smoke démarre le même serveur compilé avec deux configurations fictives, en retirant les outils du PATH enfant. Il vérifie configuration runtime, fichiers statiques, preuve d’identité du serveur et arrêt. Les tests Electron utilisent un profil temporaire et aucune clé réelle.

## Contrats de schéma Supabase

Les empreintes de chaque préfixe de migrations sont conservées dans `apps/desktop/schema-contracts.json`. Elles couvrent les colonnes, fonctions/signatures/corps, RLS, politiques, contraintes et déclencheurs. Si une migration change, le staging refuse un contrat périmé. Pour les régénérer avec la stack PostgreSQL jetable de test déjà démarrée :

```sh
node apps/desktop/scripts/generate-schema-contracts.mjs
node apps/desktop/scripts/inspect-database.integration.mjs
node apps/desktop/scripts/schema-contract.integration.mjs
```

Le générateur crée sa propre base temporaire, applique les migrations dans l’ordre, teste les altérations et supprime uniquement cette base. L’inspection suivante reste en lecture seule sur la stack existante. Aucune de ces commandes n’utilise un projet hébergé. La lecture du contrat impose `SET LOCAL search_path = pg_catalog` dans sa transaction pour obtenir les mêmes noms qualifiés via le CLI, le générateur et l’API Management. Le test de régression compare deux chemins de recherche différents, sans modifier la base.

## Signature avant publication

`desktop:package` génère par défaut des paquets de recette. Pour une livraison signée, fournir les certificats et accès au système de fabrication, puis lancer :

```sh
corepack pnpm desktop:package --signed
```

Variables requises : `CSC_LINK`, `CSC_KEY_PASSWORD` ; sur Mac, également `MAC_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. Elles ne doivent jamais être enregistrées dans le dépôt. La configuration de livraison impose la signature et la notarisation macOS, avec les exécutables embarqués. Vérifier le résultat de signature sur les deux systèmes ; une signature Windows ne garantit pas à elle seule l’absence immédiate d’avertissement de réputation.

L’achat de certificats, les comptes de développeur et la publication ne sont pas automatisés par ce chantier.

## Recette de livraison

Sur un profil de test sans Node, Git, pnpm ou Docker :

1. Installer le paquet et ouvrir l’assistant.
2. Préparer un projet Supabase jetable dédié ; vérifier le projet affiché et les migrations.
3. Créer et confirmer le premier compte, se reconnecter, enregistrer une opération fictive.
4. Quitter et relancer ; tester un second double-clic.
5. Tester port occupé, mauvaise clé, panne réseau et reprise après interruption.
6. Configurer une intégration fictive, remplacer l’application et vérifier la conservation du coffre.
7. Désinstaller le logiciel ; confirmer que les réglages et le projet distant restent présents.
8. Vérifier signature/notarisation et les sommes de contrôle avant publication.

Compléter le rapport de recette pour chaque OS et architecture. Un build réussi sur Mac ne valide pas Windows. Mac Intel est exclu du périmètre à la demande de l’utilisateur.

## Références officielles

- [Variables à l’exécution Next.js](https://nextjs.org/docs/app/guides/environment-variables)
- [Sortie standalone Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [Compatibilité des versions Electron](https://www.electronjs.org/docs/latest/breaking-changes)
- [Notarisation avec electron-builder 26](https://www.electron.build/v26/docs/notarization/)
- [Runners natifs GitHub](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
