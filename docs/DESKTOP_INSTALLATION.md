# Installer Freelance Cashflow sur Mac ou Windows

L’assistant de bureau remplace les commandes de la première installation. Il conserve le modèle actuel : un serveur sur votre ordinateur et les données dans votre propre projet Supabase. Internet reste nécessaire.

## Disponibilité

Le code fournit une cible **macOS 13 ou ultérieur** (Apple Silicon uniquement) et **Windows 10/11 x64**. La disponibilité réelle de chaque fichier et les tests effectués sont consignés dans le [rapport de recette](acceptance/2026-09-25-desktop-installer.md).

Les paquets de recette non signés ne constituent pas une version publique. Aucune publication automatique n’est effectuée. Il n’y a pas de lien de téléchargement public tant qu’une livraison n’a pas été validée et publiée.

## Installer

- **Mac** : ouvrez le fichier `.dmg`, déplacez Freelance Cashflow dans Applications, puis ouvrez l’application.
- **Windows** : ouvrez le fichier `.exe` et suivez les étapes de l’installateur. L’installation est propre à votre compte Windows.

Il n’est pas nécessaire d’installer Node.js, Git, pnpm, Docker ou Supabase CLI. Le lanceur contient les exécutables nécessaires.

## Relier Supabase

1. Choisissez **Nouveau projet dédié** ou **Installation existante**.
2. Depuis le lien proposé, créez votre compte et votre projet Supabase, ou retrouvez votre projet existant.
3. Saisissez l’URL du projet et ses clés **legacy anon / service_role**, disponibles dans Settings → API Keys. Les domaines personnalisés et les nouvelles clés publishable/secret ne sont pas pris en charge par cet assistant initial.
4. Fournissez un jeton personnel Supabase et le mot de passe de la base. Le lien vers les jetons personnels est dans l’assistant. Ces deux accès servent à la préparation et ne sont pas enregistrés dans les réglages.
5. Vérifiez l’identifiant du projet et l’aperçu des migrations avant de cliquer sur **Préparer ma base**. Pour une installation existante, vérifiez d’abord une [sauvegarde et sa restauration](BACKUP_RESTORE.md).
6. Dans Authentication → URL Configuration, utilisez `http://localhost:3000` pour Site URL et les redirections autorisées. Activez les inscriptions par e-mail pour le premier compte.
7. Confirmez ce réglage et ouvrez Freelance Cashflow. Créez votre compte, confirmez l’e-mail si demandé, puis configurez votre trésorerie.

La création du projet et les réglages d’authentification restent des étapes guidées sur Supabase. Les connexions bancaires sont facultatives.

## Utilisation quotidienne

Double-cliquez sur l’application ou son raccourci. Le navigateur s’ouvre une fois le serveur local prêt. Un deuxième double-clic réutilise le lanceur existant.

Fermer l’onglet laisse le serveur actif. Pour l’arrêter, choisissez **Quitter** dans le menu Freelance Cashflow, ou son icône de notification sous Windows. Aucun démarrage automatique à l’ouverture de session n’est configuré.

## En cas de difficulté

- **Port 3000 occupé** : fermez l’ancienne instance lancée dans un terminal ou le programme utilisant ce port, puis réessayez le démarrage. Le lanceur ne termine jamais ce programme à votre place.
- **Accès refusé** : vérifiez le projet, les rôles des clés, le jeton personnel et le mot de passe de la base.
- **Préparation interrompue** : revenez aux accès et relancez la vérification. Le logiciel inspecte l’historique avant toute reprise. Une base ambiguë ou plus récente est refusée.
- **Session expirée** : après quinze minutes, revenez aux accès et saisissez à nouveau les identifiants temporaires.
- **Réglages illisibles** : renseignez les accès à votre installation existante. Ne créez pas une nouvelle base pour remplacer vos données.
- **Serveur indisponible** : réinstallez le paquet correspondant à votre système, puis consultez le diagnostic du lanceur.

Ne partagez jamais vos clés ni une capture de formulaire contenant des données réelles.

## Réglages et mises à jour

Les réglages se trouvent dans le profil utilisateur : `~/Library/Application Support/Freelance Cashflow` sur Mac, et `%APPDATA%/Freelance Cashflow` sur Windows. La clé serveur est chiffrée via le stockage sécurisé du système. Le coffre bancaire reste séparé des binaires.

Quittez l’application puis exécutez le nouvel installateur. Les réglages et le coffre sont conservés. Si les migrations livrées ont changé, l’assistant demande une nouvelle vérification du projet. Il n’y a ni mise à jour silencieuse ni restauration destructive automatique.

La désinstallation du logiciel conserve par défaut ces réglages et ne supprime jamais le projet Supabase. Le chiffrement système ne rend pas le fichier de configuration portable vers un autre compte ou ordinateur : renseignez à nouveau les accès sur la destination.
