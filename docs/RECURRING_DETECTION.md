# Détection des charges mensuelles

La détection propose des charges depuis l’historique Qonto déjà publié. Une suggestion ne crée aucun mouvement prévisionnel avant votre confirmation ou son association à une charge existante. Le solde Qonto publié reste le point de départ : les paiements historiques ne sont jamais soustraits une deuxième fois.

## Examiner les propositions

Après **Intégrations → Synchroniser Qonto**, ouvrez **Sorties → Récurrences à confirmer**. Pour analyser un historique déjà importé, utilisez **Analyser les transactions importées**, sans nouvelle requête Qonto.

Chaque proposition présente le montant et la prochaine échéance estimés. Ouvrez **paiements observés** pour consulter les dates, libellés et montants qui l’expliquent. Corrigez le libellé, le montant, le jour, la première échéance, la catégorie ou la certitude avant de confirmer. La certitude proposée est **Engagé**, sans catégorie par défaut.

Vous pouvez :

- **Confirmer** pour créer une charge mensuelle modifiable dans les sorties récurrentes ; son badge indique **Détectée depuis Qonto**.
- **Associer** à une charge mensuelle existante : son identifiant et tous ses champs sont conservés. Une charge déjà liée à une autre série ne peut pas être réutilisée.
- **Ignorer** pour conserver le refus, y compris après resynchronisation. Le panneau secondaire **Suggestions ignorées** permet de **Réexaminer**, puis de relancer l’analyse ; une nouvelle confirmation reste nécessaire.

Une charge mensuelle de libellé similaire et de montant proche déclenche une protection contre les doublons. Associez-la, ou cochez explicitement **Créer quand même une nouvelle charge** si deux charges distinctes sont voulues. Deux confirmations simultanées de la même suggestion retournent la même charge.

Les modifications apportées à la charge restent prioritaires sur les estimations suivantes. Supprimer la charge liée ignore aussi la série ; une nouvelle synchronisation ne la recrée pas. Pour la proposer à nouveau, passez par **Réexaminer** puis l’analyse. Une suggestion devenue obsolète ou inéligible exige une nouvelle analyse et ne peut pas être confirmée telle quelle.

## Critères et limites

L’analyse porte sur les six derniers mois calendaires, dans le fuseau du propriétaire. Elle regroupe par compte, devise et libellé normalisé, en conservant notamment les références numériques. Elle exige au moins trois mois consécutifs avec exactement un débit positif `completed` par mois. Seuls les comptes actifs et courants dans la devise de projection sont retenus.

Chaque montant doit être à ±10 % de la médiane ; les jours doivent rester à ±3 jours d’un jour mensuel commun, avec ajustement aux fins de mois. Une série dont la dernière échéance attendue dépasse sept jours de retard n’est plus proposée. Les séquences ambiguës, références variables, prélèvements multiples dans le même mois, paiements irréguliers et périodicités trimestrielles ou annuelles peuvent donc ne produire aucune proposition. Cette version détecte uniquement les récurrences mensuelles ; elle ne reconnaît pas automatiquement tous les abonnements.

L’analyse lit toutes les pages, au-delà des mille premières lignes, dans une publication bancaire cohérente. Elle refuse un dépassement de 100 000 transactions ou 10 000 propositions, sans publication partielle. Une tentative dispose de 40 secondes, avec nettoyage borné à 45 secondes au total. Une analyse en cours ou échouée ne transforme pas une synchronisation bancaire réussie en échec et ne remplace pas les décisions antérieures. Les messages bancaires et d’analyse sont distincts ; relancez l’analyse depuis Sorties après résolution du problème.

## Mois déjà payé

Une charge mensuelle confirmée et liée ne produit pas d’échéance dans un mois où un paiement `completed` correspondant existe déjà dans l’historique courant. Le rapprochement conserve l’identité du compte, la devise et le libellé observé, et compare au montant médian observé avec la tolérance de 10 %. Une correction du montant de la charge n’efface pas ce paiement observé. Un paiement anticipé dans le même mois compte également.

Si le paiement passe à `reversed`, le mois redevient prévisionnel à la prochaine lecture de la publication bancaire. Cette exclusion ne s’applique ni aux charges manuelles non liées, ni aux sorties ponctuelles, ni aux charges devenues trimestrielles ou annuelles. Elle s’appuie sur l’historique disponible, sans rapprochement automatique avec les factures.

## Installation hébergée et recette

L’installation choisie exécute Next.js localement avec **Supabase hébergé**. Les deux migrations de cette fonctionnalité sont **en attente d’une autorisation distincte** :

- `202609110001_recurring_detection.sql` ;
- `202609110002_recurring_detection_functions.sql`.

L’accord antérieur sur les douze migrations précédentes ne couvre pas ces fichiers. Aucune migration hébergée n’est appliquée par les tests. Suivez la procédure de préparation et de revue dans [INSTALLATION.md](INSTALLATION.md), puis obtenez l’autorisation portant sur ces deux migrations avant leur application. N’utilisez jamais de remise à zéro sur le projet hébergé.

```bash
corepack pnpm test:isolated
corepack pnpm test:client-boundary
```

La recette utilise uniquement le projet jetable `jalon-2-qonto-tests`, API 56321, PostgreSQL 56322, et Next.js 3200. Elle couvre PostgreSQL/RLS, plusieurs connexions réellement concurrentes, les appels RPC/HTTP, plus de mille opérations synthétiques, le parcours manuel existant, la synchronisation Qonto et le cycle navigateur des récurrences. Les identifiants temporaires restent en mémoire, Qonto est simulé sous interception réseau qui refuse tout hôte externe non simulé, et les captures, traces et vidéos sont désactivées. Aucune route ou option de démonstration n’est ajoutée à l’application.

Ces résultats valident les scénarios synthétiques. Ils ne valent pas acceptation d’un compte Qonto réel ; cette vérification appartient au propriétaire après l’autorisation et l’application des migrations hébergées.
