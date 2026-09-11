# Détection des sorties mensuelles depuis Qonto

Date : 2026-09-11
Statut : conception proposée, en attente de revue de la spécification par l’utilisateur.

## Objectif et décisions validées

L’application sert à projeter la trésorerie. Les soldes publiés par Qonto constituent le point de départ ; les transactions historiques ne sont jamais rejouées pour reconstruire ce solde. L’historique sert ici à détecter les dépenses susceptibles de se reproduire.

L’utilisateur a validé une première version mensuelle : au moins trois paiements cohérents, suggestions à confirmer avant effet sur le prévisionnel, édition et suppression possibles. Le compte Qonto et le Supabase hébergé sont configurés. Les tests restent isolés avec des données fictives ; aucun test automatisé ne synchronise le compte réel.

## Approche retenue

Trois approches sont possibles : créer directement des charges actives, créer des suggestions persistantes à confirmer, ou effectuer une simple analyse sans mémoriser les décisions. Les suggestions persistantes sont retenues : elles rendent l’hypothèse explicite, conservent les refus et évitent les changements silencieux de projection. Aucune IA externe n’est nécessaire ; le moteur est déterministe, testable et exécuté côté serveur.

La détection utilise les transactions déjà publiées. Elle ne demande ni nouvel accès Qonto ni import supplémentaire. Une suggestion n’est pas une charge active. Sa confirmation crée, ou associe, une ligne de `recurring_cashflows`, utilisée par le moteur de projection existant.

## Règles de détection proposées pour la version 1

- Fenêtre : six mois calendaires jusqu’à la date métier du propriétaire, limitée aux données réellement importées.
- Transactions éligibles : sorties strictement positives, statut `completed`, comptes actuels actifs dans la devise de projection. Aucune conversion de devise. Les opérations pending, declined et reversed sont exclues.
- Regroupement : propriétaire, intégration, compte, devise et libellé normalisé. La normalisation uniformise casse, accents, ponctuation et espaces. Elle ne supprime pas arbitrairement les chiffres, dates ou références : une référence variable peut donc produire un faux négatif, préférable à fusionner deux fournisseurs. `counterparty` est actuellement nul dans l’adaptateur ; aucune identité fournisseur n’est inventée.
- Un groupe doit contenir au moins trois paiements, exactement un par mois sur une séquence d’au moins trois mois consécutifs. Si plusieurs paiements du groupe existent dans un des mois de la séquence, celle-ci est ambiguë et n’est pas proposée. La séquence la plus récente est retenue, puis étendue vers le passé tant que ces conditions tiennent.
- Montant proposé : médiane des montants de la séquence, arrondie au centime supérieur si nécessaire. Chaque montant doit être à plus ou moins 10 % de cette médiane. Calculs en centimes entiers, sans arrondi flottant intermédiaire ; aucun pourcentage de confiance n’est affiché.
- Jour proposé : jour du mois de 1 à 31 minimisant la somme des écarts absolus, en ramenant ce jour au dernier jour des mois plus courts. Chaque paiement doit être à trois jours au plus de cette date dans son mois. En cas d’égalité, retenir le plus grand jour. Cette règle couvre les fins de mois sans imposer un intervalle de trente jours.
- Activité récente : la date théorique du mois suivant le dernier paiement, augmentée de sept jours, ne doit pas être antérieure à la date métier courante. Une série ancienne arrêtée n’est pas reproposée comme active.
- Les paiements ordinaires irréguliers, libellés instables, plusieurs abonnements sous un même libellé et périodicités autres que mensuelles ne sont pas inférés dans cette version. Les virements internes ne sont pas identifiables avec certitude avec les champs actuels ; les justificatifs et la confirmation permettent de les refuser.

Les paramètres sont des constantes versionnées dans le moteur, pas des réglages supplémentaires dans l’interface de cette première version.

## Parcours utilisateur

La page Sorties présente « Récurrences à confirmer », avec le nombre de suggestions. Chaque carte affiche le libellé, le montant mensuel proposé, la prochaine date et le nombre de paiements observés. Un détail révèle leurs dates, montants et libellés exclusivement au propriétaire connecté.

Actions :

1. Confirmer : formulaire prérempli permettant de corriger libellé, montant, jour, première échéance, catégorie et niveau de certitude. La fréquence initiale est mensuelle, la sortie est de type dépense, sans catégorie imposée, certitude `committed`. Ces valeurs restent modifiables par l’utilisateur.
2. Déjà saisie : associer la suggestion à une sortie mensuelle existante de type dépense, sans la modifier. Le choix est explicite et limité aux sorties du même propriétaire.
3. Ignorer : retirer la suggestion et mémoriser le refus pour cette série.

Une suggestion ne produit aucun événement financier avant confirmation. Une sortie confirmée apparaît dans la liste existante avec l’origine Qonto et conserve les actions éditer, désactiver et supprimer. Une suppression retire la charge et conserve un refus de la série ; une désactivation conserve son association et n’entraîne pas de recréation. Les séries ignorées sont accessibles dans une liste secondaire avec une action Réexaminer, qui ne les réactive jamais sans confirmation.

Un bouton « Analyser les transactions importées » permet le premier calcul sur l’historique déjà disponible et la reprise après erreur, sans appeler Qonto. La détection est aussi déclenchée après une publication Qonto réussie. Une synchronisation échouée ne lance pas l’analyse.

## Projection et échéances déjà payées

La première échéance proposée est dans un mois strictement postérieur au dernier paiement observé et à une date strictement future au jour de confirmation. Si une ancienne proposition est confirmée tardivement, le serveur recalcule cette borne et demande une correction si la date saisie n’est plus valide.

Après confirmation, les futures transactions publiées peuvent constater un paiement de la même série : groupe identique et montant dans la tolérance de la série observée, sans modifier les champs choisis par l’utilisateur. Pour une charge liée encore mensuelle, un débit completed du même mois que l’échéance exclut cette échéance de la projection, car il est déjà inclus dans le solde Qonto. Cela couvre notamment un prélèvement arrivé quelques jours avant la date prévue.

Ce filtrage se fait sur un instantané bancaire cohérent au moment du calcul de projection, indépendamment du succès du dernier calcul de suggestions. Une opération devenue reversed ne constitue plus une preuve de paiement. Les charges manuelles non liées et les autres périodicités conservent leur fonctionnement existant. Si la fréquence d’une charge liée devient trimestrielle ou annuelle, cette exclusion mensuelle est désactivée et l’interface l’indique. Aucun rapprochement de factures ou de sorties ponctuelles n’est ajouté.

La confirmation ou l’association recharge les candidats existants avant écriture. Des ressemblances avec des charges manuelles (même libellé normalisé et montant proche) sont signalées et proposent l’association. Une ressemblance n’autorise jamais une fusion silencieuse ; créer malgré le signal demande un choix explicite. Des libellés entièrement différents ne peuvent pas être reconnus automatiquement comme doublons.

## Persistance et concurrence

Ajouter des tables dédiées pour les séries détectées, leurs transactions justificatives et l’état de l’analyse. Toutes les lignes portent `owner_user_id`, des clés étrangères vérifient l’appartenance des comptes, intégrations, transactions et charges. RLS protège les lectures et les mutations ; aucun navigateur n’obtient de clé privilégiée.

Identité d’une série : empreinte déterministe incluant propriétaire, fournisseur, compte, devise, libellé normalisé et périodicité. Ni montant ni jour ne composent cette identité afin qu’une variation ne recrée pas une série refusée. La version des règles est distincte et ne réinitialise pas les décisions. L’empreinte est une clé technique, pas une anonymisation des libellés.

États persistants : pending, confirmed et dismissed, avec une association optionnelle vers la charge et des métadonnées de détection (version, publication analysée, date, montant et jour proposés). Les décisions de l’utilisateur sont distinctes des estimations recalculables. Une série pending qui ne remplit plus les critères devient non présentable, sans suppression de son identité ; une série confirmée ou refusée conserve toujours sa décision.

Les justificatifs sont référencés par identifiant bancaire, sans recopier le payload brut. Les lectures parcourent toutes les pages de l’historique nécessaire, pas uniquement les cinquante transactions affichées à l’écran. Les bornes de publication sont contrôlées avant et après lecture. Une analyse sur une publication devenue obsolète ne peut pas être validée en base.

Un verrou d’analyse par propriétaire et intégration et une validation atomique de la publication source empêchent deux analyses concurrentes d’écraser leurs résultats. La synchronisation bancaire ne conserve pas son verrou pendant l’analyse. Les RPC de confirmation, association, refus et suppression prennent les verrous nécessaires et sont idempotentes : double clic ou retry ne créent pas deux charges. L’analyse ne remplace jamais une décision ou des champs édités. La suppression d’une charge liée et la mémorisation du refus sont atomiques, y compris via le parcours de suppression existant.

## Échecs et sécurité

Le succès bancaire reste acquis si l’analyse échoue : afficher séparément « Données Qonto actualisées, analyse des récurrences à relancer ». Les dernières suggestions restent disponibles avec leur date ; leur confirmation valide à nouveau les éléments courants. Les échecs sont normalisés, sans message SQL ou fournisseur brut.

Les logs utilisent une liste blanche d’événements, durées, compteurs et codes stables. Aucun libellé, montant individuel, identifiant de compte externe, token, IBAN ou transaction brute dans les logs, fixtures ou rapports. Les transactions restent dans Supabase et dans les échanges nécessaires avec le serveur applicatif ; aucun service d’analyse tiers.

## Composants et vérification

- Moteur pur dans `packages/domain` : normalisation conservatrice, sélection des séries, médianes, dates et critères, testé avec fixtures fictives.
- Orchestration serveur : lecture paginée et cohérente, exécution après publication ou sur demande, persistance bornée et reprise sûre.
- Migration SQL additive : tables, index, RLS, fonctions atomiques et protection des liens et décisions.
- Interface dans la fonctionnalité Sorties : suggestions, détails, confirmation/association/refus, visibilité de l’origine et états d’analyse.
- Projection : exclusion des échéances mensuelles liées déjà payées, sans ajout des transactions historiques aux événements.

TDD pour chaque comportement : seuil de trois mois, deux mois insuffisants, interruptions de séquence, doublons, devises, statuts, variation des montants, dates proches, fins de mois et années bissextiles, séries inactives, références variables. Tests de persistance : RLS, propriétaire étranger, conflits analyse/confirmation/suppression, double confirmation, refus persistant, correction conservée, publication obsolète et pagination au-delà de mille lignes. Tests de projection : suggestion neutre, effet après confirmation, échéance future déjà payée exclue, opération reversed rétablie et aucune double soustraction. Parcours navigateur avec Qonto simulé pour détecter, confirmer, modifier, supprimer et resynchroniser.

Les tests utilisent exclusivement la stack jetable dédiée. Une validation manuelle sur les données réelles vient après les vérifications automatisées ; toute nouvelle migration sur le Supabase hébergé fait l’objet d’une autorisation explicite portant sur cette migration. L’autorisation donnée pour les douze anciennes migrations n’est pas réutilisée.

## Hors périmètre

Détection annuelle, trimestrielle ou hebdomadaire ; import historique étendu ; IA externe ; rapprochement factures/banque ; modification automatique d’une charge confirmée ; arrêt automatique d’un abonnement ; worker planifié, Scaleway et déploiement cloud de l’application. L’historique bancaire reste consultable comme justificatif, sans refonte de navigation dans cette évolution.
