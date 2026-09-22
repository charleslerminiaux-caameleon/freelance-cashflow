# Mettre à jour Libra

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
