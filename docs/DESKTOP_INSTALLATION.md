# Installer Freelance Cashflow sur Mac ou Windows

L’assistant de bureau remplace les commandes de la première installation. Il conserve le modèle actuel : un serveur sur votre ordinateur et les données dans votre propre projet Supabase. Internet reste nécessaire.

## Disponibilité et téléchargement

L’[installateur Mac 0.1.5](https://github.com/charleslerminiaux-caameleon/freelance-cashflow/releases/tag/desktop-v0.1.5) est disponible en préversion pour **macOS 13 ou ultérieur, Apple Silicon uniquement** (M1 et générations suivantes). Il n’est pas encore signé ni notarié par Apple. Les Mac Intel ne sont pas pris en charge par ce fichier.

**Sur PC Windows**, utilisez la [procédure manuelle du README](../README.md#installation-manuelle--windows-et-autres-systèmes) en attendant l’arrivée de l’installateur Windows. Aucun fichier Windows n’est encore proposé.

## Installer sur Mac

1. Téléchargez le `.dmg` depuis la page GitHub ci-dessus.
2. Ouvrez-le et déplacez Freelance Cashflow dans Applications.
3. Ouvrez l’application. Si macOS bloque le développeur non identifié, et si vous avez téléchargé le fichier depuis cette page GitHub, utilisez **Réglages Système → Confidentialité et sécurité → Ouvrir quand même**, puis confirmez. Consultez l’[aide Apple](https://support.apple.com/fr-fr/102445). Ne désactivez pas globalement les protections de macOS.
4. Suivez les étapes Supabase ci-dessous.

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

## Créer le jeton personnel Supabase

Dans les [réglages des jetons Supabase](https://supabase.com/dashboard/account/tokens), créez un jeton nommé par exemple **Installation Freelance Cashflow** :

- **Périmètre** : jeton **Scoped**, limité au seul projet utilisé par Freelance Cashflow.
- **Expiration conseillée** : **24 heures**, ou la durée la plus courte proposée qui vous laisse terminer l’installation. C’est une recommandation pour ce parcours, pas une durée imposée par Supabase.
- **Permissions** : **Database**, **Project Settings**, **API Keys** et **API Key Secrets**, toutes en **Read** (lecture). Laissez les autres permissions désactivées.

Copiez le jeton dans l’assistant. La lecture Database permet de vérifier la structure ; les trois autres permissions permettent de relier le projet avant les migrations. Les migrations se connectent avec le **mot de passe de la base** : les droits de lecture du jeton ne limitent pas les modifications autorisées par ce mot de passe. Voir la [documentation officielle des permissions Supabase](https://supabase.com/docs/guides/platform/personal-access-tokens).

Après l’installation réussie, révoquez le jeton dans Supabase. L’application ne le conserve pas et n’en a pas besoin au quotidien. Si une future mise à jour demande une nouvelle vérification, créez un nouveau jeton temporaire. S’il expire avant la fin de l’installation, remplacez-le dans l’assistant.

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

Depuis la version 0.1.5, un avertissement facultatif annonce les nouvelles versions dans l’application. Vous pouvez lire les nouveautés, reporter ou ignorer une version. Les réglages sont dans **Paramètres → Mises à jour**. Voir le [guide des mises à jour](APPLICATION_UPDATES.md).

Les réglages se trouvent dans le profil utilisateur : `~/Library/Application Support/Freelance Cashflow` sur Mac, et `%APPDATA%/Freelance Cashflow` sur Windows. La clé serveur est chiffrée via le stockage sécurisé du système. Le coffre bancaire reste séparé des binaires.

Quittez l’application puis exécutez le nouvel installateur. Les réglages et le coffre sont conservés. Si les migrations livrées ont changé, l’assistant demande une nouvelle vérification du projet. Il n’y a ni mise à jour silencieuse ni restauration destructive automatique.

La désinstallation du logiciel conserve par défaut ces réglages et ne supprime jamais le projet Supabase. Le chiffrement système ne rend pas le fichier de configuration portable vers un autre compte ou ordinateur : renseignez à nouveau les accès sur la destination.
