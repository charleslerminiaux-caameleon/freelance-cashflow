# Installateur Freelance Cashflow — macOS et Windows

Date : 25 septembre 2026. Statut : proposition à relire avant implémentation.

## Intention et décisions acquises

L’utilisateur a validé un installateur avec assistant Supabase, puis un lancement
par double-clic dans le navigateur. Les deux systèmes, Mac et Windows, font partie
de la première version. L’application conserve son architecture mono-propriétaire :
interface et serveur locaux, authentification et données dans le projet Supabase
de l’utilisateur. Aucun terminal ni outil de développement ne doit être nécessaire.

Les choix techniques et limites ci-dessous constituent la proposition de réalisation.

## Approches comparées

1. **Lanceur de bureau avec application précompilée — retenu.** Un lanceur Electron
   gère l’assistant, un serveur Next.js local et les commandes Ouvrir / Quitter.
   Le navigateur habituel reste l’interface métier. Le paquet est plus volumineux,
   mais tous les composants nécessaires sont fournis et le parcours est homogène.
2. **Scripts d’installation.** Moins de packaging, mais téléchargement d’outils,
   problèmes de droits et démarrage plus fragile. Ils ne satisfont pas aussi bien
   l’objectif d’une installation accessible sans connaissances techniques.
3. **Hébergement web centralisé.** Supprime le serveur local, mais change le modèle
   d’exploitation et la gestion des identifiants. Hors du périmètre validé.

## Livrables et compatibilité

- macOS : image `.dmg` avec application à déplacer dans Applications ; paquets
  Apple Silicon et Intel distincts, sous réserve de validation sur chaque architecture.
- Windows : installateur `.exe` NSIS pour x64, installation par utilisateur et
  raccourci du menu Démarrer ; raccourci sur le bureau facultatif.
- Versions minimales des systèmes alignées sur la version Electron épinglée lors
  de l’implémentation et annoncées dans la documentation de livraison.
- Windows ARM natif et Linux exclus de cette première version.
- Node.js, serveur compilé, fichiers statiques et CLI Supabase sont embarqués
  avec versions et empreintes contrôlées ; aucun Git, pnpm ou Docker requis chez l’utilisateur.
- Recettes et fabrication natives sur macOS et Windows. Un build Mac seul ne
  constitue pas une validation Windows.

## Première ouverture

1. L’assistant explique que les données restent en ligne chez Supabase et qu’une
   connexion Internet est nécessaire. Il propose une nouvelle installation ou le
   raccordement à une installation Freelance Cashflow existante.
2. Pour une nouvelle installation, un lien ouvre Supabase et un guide accompagne
   la création d’un compte et d’un projet dédié. Cette création reste manuelle en V1.
3. Un formulaire demande l’URL du projet, les clés publique et serveur attendues
   par l’application. Les champs secrets sont masqués. La référence de projet est
   déduite de l’URL et affichée pour éviter une sélection accidentelle.
4. Pour préparer la base, le lanceur pilote la CLI Supabase embarquée : authentification,
   liaison au projet, aperçu des migrations puis application. Les accès nécessaires
   à la CLI sont distincts de la clé `service_role` : celle-ci ne suffit pas à exécuter
   les migrations. Le jeton et le mot de passe de base sont demandés dans l’assistant,
   transmis sans argument de ligne de commande et conservés seulement en mémoire.
5. Avant application, afficher le projet cible et la liste des migrations. Le bouton
   « Préparer ma base » autorise cette opération. Refuser une base contenant des
   objets métier étrangers à Freelance Cashflow ; ne jamais lancer `db reset`.
6. Guider les paramètres d’authentification Supabase : URL locale du site,
   redirections et inscription initiale. Cette étape sur le tableau de bord reste
   guidée en V1 ; ne pas annoncer une automatisation complète de ces réglages.
7. Vérifier configuration, schéma et démarrage local, puis ouvrir la création du
   compte dans le navigateur. Les banques restent facultatives.

Le raccordement à une base existante commence par des contrôles en lecture seule.
Toute migration manquante relève du parcours de mise à jour, avec sauvegarde préalable.
Un schéma inconnu ou plus récent que le logiciel bloque les mutations.

## Architecture et frontières

- Nouveau paquet `apps/desktop` : cycle de vie, assistant autonome, configuration
  privée et orchestration de la CLI. Il doit démarrer sans aucune variable Supabase.
- Interface de l’assistant locale, sans intégration Node dans le renderer ; échanges
  IPC limités et validés, isolation de contexte, aucune navigation distante intégrée.
- Next.js en sortie `standalone`, avec traçage du monorepo, assets statiques et
  dépendances natives inclus. Processus Node embarqué indépendant du renderer.
- Refactorer la configuration publique : URL et clé publique chargées depuis le
  serveur à l’exécution, validées puis transmises au client avant son initialisation.
  Ne pas figer une configuration utilisateur dans les bundles `NEXT_PUBLIC_*`.
- Configuration privilégiée exclusivement côté serveur ; aucune clé serveur dans
  les réponses de configuration publique, les bundles ou les messages d’erreur.
- Maintenir le lancement de développement existant à partir de `.env.local`.

## Lancement quotidien et stockage

Le double-clic prend un verrou d’instance, lit les réglages, démarre le serveur puis
ouvre le navigateur après un contrôle de disponibilité. Un second lancement ouvre
l’instance existante. Le menu du lanceur offre Ouvrir, Diagnostic et Quitter.
Fermer un onglet ne quitte pas le lanceur ; Quitter arrête son processus serveur.
Aucun lancement automatique à l’ouverture de session dans la V1.

Le serveur écoute uniquement sur l’interface de boucle locale. Utiliser une origine
stable `http://localhost:3000`, cohérente avec les réglages Auth. Si le port appartient
à un autre programme, afficher une erreur actionnable sans tuer ce programme ni
ouvrir son contenu. Vérifier l’identité de l’instance avant d’ouvrir le navigateur.

Configuration et identifiants sont conservés dans le dossier de données utilisateur
fourni par le système, séparément des binaires et caches. La clé serveur est protégée
par le mécanisme système via le lanceur ; aucun fichier `.env` secret livré dans le
paquet. Les chemins du coffre bancaire et du contexte bunq pointent vers ce dossier.
Le coffre existant doit être testé sous Windows, notamment droits et écritures atomiques.

Les échanges locaux privilégiés vérifient l’origine et l’émetteur. Aucun endpoint HTTP
anonyme ne doit pouvoir réécrire les réglages ou déclencher une migration. Les journaux
contiennent seulement codes d’erreur, étapes et versions, sans valeurs sensibles.

## Échecs, reprise et mises à jour

Chaque étape indique son état et propose Réessayer. Une configuration invalide ne
remplace pas une configuration fonctionnelle. Les fichiers sont enregistrés de façon
atomique. Les erreurs réseau ont un délai maximal et ne provoquent pas une attente infinie.

Après une interruption des migrations, comparer leur historique avec les fichiers
livrés avant de reprendre ; ne pas rejouer aveuglément une opération ambiguë. La CLI
et son répertoire de travail sont propres à l’installation, sans modifier un projet
Supabase déjà lié dans un dépôt de développement.

La première version se met à jour en exécutant le nouvel installateur, sans mise à
jour silencieuse. Les réglages et le coffre bancaire sont conservés. Une évolution
de schéma exige un aperçu des migrations et une sauvegarde vérifiée selon le guide
existant ; aucune restauration destructive automatique. La désinstallation ne supprime
ni le projet Supabase ni les données utilisateur par défaut.

## Distribution et validation

Préparer les pipelines de fabrication avec artefacts versionnés et sommes de contrôle.
La publication publique reste une étape distincte. La distribution macOS doit prévoir
signature et notarisation ; Windows doit prévoir signature de l’éditeur. Les certificats
et accès associés sont des prérequis de livraison, jamais des secrets committés.
Des builds de recette non signés ne doivent pas être présentés comme prêts au grand public.

Critères d’acceptation :

- installation sur machine sans Node, Git, pnpm ni Docker ;
- nouvelle configuration et réouverture sans terminal ;
- même paquet testé avec deux configurations Supabase fictives différentes ;
- aucune fuite de secrets dans assets, journaux, arguments de processus ou diagnostic ;
- clé erronée, réseau coupé, port occupé, double lancement et interruption récupérables ;
- migrations testées sur base jetable et refus d’un projet incompatible ;
- création de compte, confirmation éventuelle et reconnexion dans le navigateur ;
- remplacement du logiciel conservant paramètres et coffre ;
- arrêt propre du serveur et désinstallation conservant les données ;
- vérifications réelles sur macOS et Windows avant déclaration de compatibilité.

Les tests existants de lint, types, métier et frontière client restent applicables.
Les recettes utilisent uniquement des secrets fictifs et des bases jetables.

## Références techniques

- Next.js : https://nextjs.org/docs/app/guides/environment-variables
- Next.js standalone : https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- Packaging : https://www.electron.build/docs/
- Signature : https://www.electron.build/docs/features/code-signing/
- Guides du dépôt : `docs/INSTALLATION.md`, `docs/UPDATES.md`,
  `docs/BACKUP_RESTORE.md`, `docs/SECURITY_LOCAL.md`.
