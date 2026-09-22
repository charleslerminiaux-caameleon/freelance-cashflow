# Jalon 3 — Installation et durcissement

Statut : périmètre confirmé le 15 septembre 2026.

## Décisions du propriétaire

Next.js reste local avec Supabase hébergé. Le déploiement web cloud est seulement
préparé. Scaleway, le worker autonome et toute synchronisation application fermée
sont supprimés du périmètre. Cette décision remplace les dispositions contraires
sur le worker dans la conception MVP du 5 septembre.

Le navigateur vérifie à l'ouverture, au retour et toutes les cinq minutes quand
l'onglet est visible. Le serveur admet une synchronisation après cinq minutes
sans publication réussie, sous verrou partagé avec le parcours manuel. La
première synchronisation demeure explicite ; après échec, le délai de quinze
minutes protège le fournisseur. Une requête déjà lancée peut se terminer après
fermeture de l'onglet ; aucune nouvelle exécution autonome n'est planifiée.

## Installation et diagnostic

Ajouter une page propriétaire `/settings/installation`, accessible depuis les
paramètres et après l'onboarding. Les étapes reprenables pointent vers les
paramètres, charges/réserves, factures/import et intégrations. Leur état provient
des données persistées ; une étape facultative vide n'est pas une erreur.
Le dashboard demeure accessible immédiatement.

Le diagnostic indique la connectivité, la compatibilité du contrat de base du
jalon 3, la présence de configuration Qonto, la dernière publication et la version
web. Les erreurs sont neutralisées ; aucun secret ou payload financier n'est
retourné. Une migration manquante doit être visible comme incompatibilité, et
non masquée par une requête réussie sur une table ancienne. Aucun diagnostic de
worker n'est nécessaire.

## Sauvegarde et distribution

Fournir une procédure Supabase officielle couvrant schéma, données, identité Auth,
secrets séparés, restauration vers projet distinct et vérification fonctionnelle.
Une recette locale sur données fictives vérifie export/restauration, identité du
propriétaire, RLS et valeurs financières. Distinguer cette preuve locale d'une
restauration hébergée réelle. Documenter installation, mise à jour, déploiement
web facultatif, contribution, sécurité et choix de licence avant publication.

## Contraintes et acceptation

Préserver les changements locaux antérieurs sur scénarios, factures et
opportunités. Tests exclusivement sur la stack `jalon-2-qonto-tests`,
API56321/DB56322/Next3200, avec Qonto simulé et fichiers de build séparés du
serveur utilisé sur 3001. Ne pas lire/copier les secrets existants. Aucune
migration hébergée, publication, fusion ou restauration de données réelles
n'est incluse dans l'implémentation locale.

Vérifier fraîcheur et concurrence en PostgreSQL, états dégradés et permissions
du diagnostic, parcours installation navigateur, restauration fictive, tests
existants, types, lint et frontière client. Tiime reste en attente dans le jalon 2.
