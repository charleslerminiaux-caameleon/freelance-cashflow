# Sécurité

## Signaler une vulnérabilité

Utiliser le bouton **Report a vulnerability** dans l'onglet **Security** du dépôt
GitHub pour envoyer un signalement privé aux mainteneurs. Ce canal doit être
activé dans les paramètres de sécurité du dépôt dès sa publication. Ne pas ouvrir
une issue publique contenant des secrets, données bancaires, exports, jetons de
session ou une preuve permettant d'accéder à une instance. Décrire la version,
le composant affecté, les étapes avec données fictives et l'impact observé.

## Garanties et exploitation

Une instance possède un propriétaire. Les actions serveur contrôlent sa session
et les politiques RLS isolent les données. La clé service-role contourne RLS et
reste exclusivement serveur ; son utilisation impose une vérification explicite
du propriétaire. Qonto est en lecture seule. Il n'existe aucun endpoint public de
synchronisation autonome ni ordonnanceur externe.

Les réponses web ajoutent les en-têtes anti-encadrement, anti-détection de type,
sans transmission du référent, et désactivent caméra/micro/géolocalisation. Ils
complètent les contrôles d'accès ; ils ne constituent pas à eux seuls une garantie
de sécurité. Une politique CSP stricte nécessite une conception compatible avec
les scripts Next.js et ne fait pas partie de cette version.

## Secrets et incidents

Les fichiers `.env.local` sont ignorés et ne doivent jamais être joints à une
revue ou à une sauvegarde publique. Utiliser des secrets distincts entre tests,
preview et installation réelle. En cas d'exposition : révoquer ou renouveler la
clé chez le fournisseur, mettre à jour la configuration serveur, redémarrer et
vérifier le fonctionnement. Nettoyer un fichier Git ne révoque pas une clé et ne
la retire pas de l'historique. Faire auditer l'historique avant publication.

Les journaux doivent se limiter aux codes, dates, durées et compteurs autorisés.
Conserver les exports chiffrés et leur accès séparé. Voir
[SECURITY_LOCAL.md](docs/SECURITY_LOCAL.md) et
[BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md).
