# Mettre à jour Freelance Cashflow

## Installateur Mac

Téléchargez la version souhaitée depuis l’avertissement dans l’application ou depuis la [page des versions](https://github.com/charleslerminiaux-caameleon/freelance-cashflow/releases). Consultez ses nouveautés et instructions, quittez Freelance Cashflow, puis remplacez l’application dans Applications. Les réglages sont conservés. Si une migration est nécessaire, l’assistant vous guide et demande une sauvegarde préalable. [Guide détaillé](DESKTOP_INSTALLATION.md).

## Installation manuelle, notamment sur Windows

Consultez d’abord les notes de la version et sauvegardez votre base. Dans le terminal où l’application fonctionne, utilisez **Ctrl+C** pour l’arrêter. Ouvrez le dossier `freelance-cashflow` avec le terminal, puis vérifiez votre état :

```bash
git status
```

Si des fichiers ont été modifiés, conservez ces modifications et faites-vous accompagner avant de continuer. Ne les effacez pas. Sur une copie sans modifications locales, la commande suivante récupère la dernière version de votre branche actuelle, depuis le dépôt que vous suivez :

```bash
git pull --ff-only
```

Si une erreur ou un conflit apparaît, arrêtez-vous à cette étape. Sinon, installez les dépendances :

```bash
npx --yes pnpm@10.17.1 install --frozen-lockfile
```

Conservez `apps/web/.env.local`. Si la publication annonce des migrations de base, appliquez la procédure de contrôle ci-dessous avant de redémarrer. Sinon, relancez :

```bash
npx --yes pnpm@10.17.1 dev
```

Ouvrez ensuite `http://localhost:3000`. La commande `git pull` suit votre branche ; elle ne sélectionne pas une ancienne version précise. Pour rester sur une version particulière ou passer à un fork, suivez les instructions du mainteneur. [Choix et notifications](APPLICATION_UPDATES.md).

## Contrôles avant migration

1. Sauvegardez et vérifiez la procédure de [restauration](BACKUP_RESTORE.md).
2. Notez le commit utilisé et préservez les modifications locales. Installez les
   dépendances du commit cible avec `corepack pnpm install --frozen-lockfile`.
3. Lisez les nouvelles migrations et exécutez la recette sur la stack jetable.
4. Pour la base hébergée, faites vérifier le projet lié et le dry-run selon
   [INSTALLATION.md](INSTALLATION.md). Obtenez l'accord portant sur les fichiers
   précis avant leur application. Aucun `db reset` hébergé.
5. Redémarrez Next.js avec sa configuration existante. Consultez
   **Paramètres → Installation et diagnostic**, puis vérifiez le parcours réel.

## Migrations du jalon 3

- `202609150001_open_app_sync.sql` : admission automatique après cinq minutes,
  temporisation de quinze minutes uniquement après tentative sans publication.
- `202609150002_installation_diagnostic.sql` : contrat de compatibilité en lecture
  seule réservé au propriétaire authentifié.

Elles sont additionnelles et doivent suivre toutes les migrations précédentes,
y compris `202609140001_invoice_corrections.sql`. Le jalon ne les applique pas
sur la base hébergée. L'interface peut être installée avant : elle indique une
compatibilité non confirmée tant que le contrat n'est pas accessible. Le serveur
conserve alors la politique SQL effectivement installée ; le nouveau badge
utilise déjà le seuil de cinq minutes.

Le diagnostic vérifie un contrat applicatif versionné. Ce n'est ni un audit de
l'intégrité de toutes les migrations ni un test réseau vers Qonto. La dernière
date de publication est présentée en UTC sur cette page.

## En cas de problème

Conservez les données et relevez uniquement le code d'erreur, la version et la
date. Préférez une correction additionnelle de schéma. Ne supprimez pas des
colonnes et ne réécrivez pas une migration déjà appliquée pour revenir en arrière.
Si une restauration devient nécessaire, utilisez d'abord un projet distinct et
validez les données avec le propriétaire avant toute bascule.
