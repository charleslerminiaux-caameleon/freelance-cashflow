# Sauvegarde et restauration

## Ce qui doit être conservé

Une sauvegarde de Libra comprend les tables, fonctions, contraintes et politiques
RLS de `public`, les données Auth (notamment l'identifiant du propriétaire et son
moyen de connexion), ainsi que l'historique `supabase_migrations`. Les factures,
clients et paramètres doivent conserver leurs identifiants et relations.

Conservez séparément, dans un gestionnaire de secrets, la configuration Supabase
et Qonto, les réglages Auth (URL du site, redirections, fournisseur e-mail), la
version du code et les éventuels paramètres de déploiement. Ne placez aucun dump
ou fichier de secrets dans le repository. Libra ne stocke actuellement aucun
fichier utilisateur dans Supabase Storage ; si cela change, les objets devront
avoir leur propre sauvegarde. Les sauvegardes de base ne contiennent pas ces
fichiers. Voir les [limites des sauvegardes Supabase](https://supabase.com/docs/guides/platform/backups).

## Procédure pour Supabase hébergé

Utilisez le [guide officiel Supabase de sauvegarde/restauration](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), vérifié le 15 septembre 2026.
Il distingue exports de rôles, schéma et données, historique des migrations et
réglages hors base. Il précise aussi le traitement des schémas gérés et du
chiffrement éventuel. Évitez de restaurer un dump brut des schémas internes dans
un projet hébergé.

1. Fermez Libra pendant l'export et laissez finir la requête de synchronisation
   éventuelle. Identifiez explicitement le projet source et la version du code.
2. Dans un dossier privé hors Git, exportez `roles.sql`, `schema.sql`, `data.sql`
   avec la CLI Supabase 2.116.0 et les commandes du guide. Exportez également
   `history_schema.sql` et `history_data.sql` pour `supabase_migrations`.
3. Faites saisir les identifiants localement ; ne les mettez pas dans une capture,
   un ticket ou un journal partagé. Chiffrez les exports avant leur transfert et
   conservez une copie hors de l'ordinateur. Notez la date et une somme SHA-256.
4. Créez un projet de destination **distinct et vide**. Préparez ses extensions et
   réglages Auth. Vérifiez deux fois la destination avant toute écriture.
5. Suivez l'ordre et la transaction de restauration du guide officiel, avec arrêt
   dès la première erreur. Restaurez également l'historique des migrations.
6. Configurez une copie de Libra sur cette destination et vérifiez les critères
   ci-dessous avant de remplacer la configuration utilisée au quotidien.

Cette procédure est destinée à une opération explicitement autorisée. Le jalon 3
ne restaure pas automatiquement le projet hébergé du propriétaire. Une ancienne
version du code ne doit pas être reliée aveuglément à une base plus récente.

## Recette de restauration

Après restauration, vérifier :

- connexion avec le compte propriétaire existant, sans recréer un autre UUID ;
- paramètres, solde manuel, clients, factures, montants payés et rapprochements ;
- réserves, charges et résultats du dashboard sur le même horizon/scénario ;
- refus d'accès d'un second utilisateur ;
- diagnostic de compatibilité et historique des migrations ;
- intégrations conservées, puis synchronisation explicite sans doublon une fois
  les secrets reconfigurés et l'accès fournisseur autorisé.

Gardez l'ancienne installation comme recours jusqu'à la fin de cette recette.
N'effacez aucune sauvegarde avant d'avoir vérifié une restauration. Une politique
simple est de sauvegarder avant chaque mise à jour et chaque import important,
puis de choisir une fréquence régulière selon la perte de saisie acceptable.
L'absence de synchronisation en arrière-plan n'empêche pas les sauvegardes gérées
par Supabase ; leur disponibilité dépend de la configuration du projet.

## Preuve automatisée locale

```bash
node scripts/run-isolated-tests.mjs db
node scripts/test-backup-restore.mjs
```

La recette `db` inclut déjà la restauration ; la seconde commande permet de la
relancer seule. Elle refuse les utilisateurs préexistants dans la stack jetable,
les autres conteneurs et une base de destination déjà présente. Elle crée des
données fictives, exporte `public`, `auth` et `supabase_migrations`, restaure dans
`libra_restore_probe` dans le seul conteneur `supabase_db_jalon-2-qonto-tests`, puis
vérifie identité, relations, montants et RLS. Un service Auth temporaire, accessible
uniquement sur l'interface locale, vérifie le mot de passe du compte restauré.
Les ressources temporaires créées sont supprimées, y compris en cas d'échec.

Cette recette utilise `pg_dump`/`pg_restore` avec les privilèges du PostgreSQL
jetable. Elle vérifie les invariants de Libra ; elle ne remplace pas la recette
du guide officiel sur un projet hébergé distinct et ne prouve pas la restauration
des configurations externes, secrets, fichiers ou futurs fournisseurs.
