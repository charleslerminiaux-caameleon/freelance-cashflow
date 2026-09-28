# Notifications de nouvelles versions

À partir de la version 0.1.5, Freelance Cashflow vérifie les publications de sa distribution au démarrage, puis au maximum une fois par jour pendant son utilisation. Aucun compte GitHub n’est nécessaire. La version 0.1.4 doit être remplacée manuellement une première fois pour disposer de cette fonction.

Un bandeau permet de lire les nouveautés, puis de choisir :

- **Télécharger la mise à jour Mac** : téléchargement volontaire de l’installateur pour une installation de bureau Mac Apple Silicon ; quittez ensuite l’application et remplacez-la dans Applications.
- **Voir la procédure de mise à jour** : pour une installation manuelle (Windows notamment), ou lorsque la publication ne contient pas d’installateur compatible.
- **Plus tard** : masquer le bandeau pendant 24 heures.
- **Ignorer cette version** : conserver la version actuelle, tout en restant informé des versions suivantes.

Dans **Paramètres → Mises à jour**, retrouvez la version installée, la provenance, le dépôt suivi et le canal de publication. Vous pouvez désactiver les vérifications, réafficher une version ignorée ou consulter toutes les publications. Les préférences sont propres au navigateur et à la distribution ; effacer les données du navigateur les réinitialise.

Aucune installation ou migration n’est automatique. Lisez les consignes de chaque publication et sauvegardez votre base avant toute migration. Une panne réseau ne bloque pas l’application ; la prochaine vérification automatique aura lieu après 24 heures. Les vérifications ne transmettent aucune donnée financière ni clé Supabase. GitHub reçoit une requête publique depuis le serveur local (et donc son adresse IP).

## Distributions communautaires et forks

Un fork suit ses propres publications. Changer de distribution n’est pas une mise à jour ordinaire : vérifiez sa compatibilité, ses consignes de migration et sa provenance, puis sauvegardez vos données. L’application ne propose aucun changement automatique de dépôt.

Avant de distribuer un fork, son mainteneur doit modifier `apps/web/src/features/updates/source.ts` : nom visible, dépôt GitHub public, version installée, préfixe des tags, canal de préversions et préfixe du nom de l’installateur Mac. Recompiler ensuite l’application web et le lanceur. Ne conservez pas l’identité officielle pour un fork.

## Publier une version détectable

1. Augmenter la version dans `source.ts` et dans `apps/desktop/package.json` pour la distribution de bureau.
2. Construire et vérifier le paquet ; publier son code source sous le même tag.
3. Publier une Release GitHub (un simple commit ou tag ne suffit pas), avec un tag `desktop-vX.Y.Z` et des notes décrivant nouveautés, incompatibilités et éventuelles migrations. Les numéros sont comparés numériquement ; les tags à suffixe comme `-beta.1` ne sont pas utilisés dans ce premier parcours.
4. Joindre le fichier `Freelance.Cashflow-X.Y.Z-mac-arm64.dmg` et sa somme de contrôle avant de publier la release. Un brouillon n’est jamais proposé.

Le canal actuel inclut les préversions GitHub, car les installateurs officiels ne sont pas encore signés/notariés. Le réglage `includePrereleases: false` permet à une distribution de suivre uniquement les releases stables. La vérification examine les 100 publications les plus récentes du dépôt, filtre le préfixe configuré puis choisit la plus grande version supérieure à celle installée. Les liens sont construits vers ce même dépôt et les notes sont affichées comme texte, jamais comme HTML exécutable.
