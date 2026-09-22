# Exploitation et déploiement web facultatif

## Cible retenue

L'installation utilisée reste **Next.js local + Supabase hébergé**. Scaleway et
le worker sont retirés du jalon 3 par décision du propriétaire du 15 septembre
2026. Aucun cron ni traitement autonome n'est requis.

Le navigateur déclenche une vérification à l'ouverture, au retour sur l'onglet
et toutes les cinq minutes s'il est visible. L'action serveur vérifie le
propriétaire puis l'admission atomique en base. Une publication datant de moins
de cinq minutes empêche un nouvel appel Qonto ; les requêtes simultanées partagent
le verrou. Après échec, le délai est de quinze minutes. La première synchronisation
se fait depuis **Intégrations**. L'application fermée ne déclenche plus de demande,
mais une requête serveur déjà lancée peut se terminer.

Le serveur Next.js doit être lancé pour utiliser Libra. Les données conservées
restent visibles pendant une panne fournisseur. La date affichée dans le badge
Qonto indique la dernière publication, pas une garantie d'absence de nouvelles
opérations depuis cette date.

## Préparer Vercel ultérieurement

Créer un projet Next.js dont le dossier racine est `apps/web`. Garder l'accès aux
fichiers extérieurs à ce dossier pour les packages du workspace ; Vercel prend
en charge les monorepos pnpm. Utiliser Node.js 24 et le lockfile du dépôt. Voir
[monorepos Vercel](https://vercel.com/docs/monorepos) et
[accès aux packages partagés](https://vercel.com/docs/monorepos/monorepo-faq).

Configurer les cinq variables de `.env.example` dans l'environnement approprié.
Seules l'URL et la clé publique Supabase portent `NEXT_PUBLIC_`. Ne pas configurer
`E2E_STACK_PROJECT` : ce marqueur appartient aux tests isolés. Les previews doivent
avoir un Supabase distinct et des fournisseurs fictifs ; leur configuration ne
doit pas réutiliser automatiquement celle de production.

Configurer l'URL et les redirections Auth pour le domaine HTTPS choisi. Vérifier
le budget des fonctions serveur : le moteur bancaire est borné à 120 secondes,
et l'analyse des récurrences peut demander 45 secondes supplémentaires. Prévoir
une marge pour les lectures et l'invalidation des pages ; contrôler les limites
du plan et les réglages effectifs dans la
[documentation des durées Vercel](https://vercel.com/docs/functions/configuring-functions/duration).

La recette cloud doit vérifier connexion, formulaire avec action serveur,
synchronisation, retour après inactivité, absence d'appels onglet masqué,
concurrence multi-onglets et conservation des données après erreur. Ce document
prépare le déploiement ; aucun projet Vercel n'a été créé ou publié par ce jalon.
