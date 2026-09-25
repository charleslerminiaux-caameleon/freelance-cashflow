# Connexions directes

Freelance Cashflow propose Pennylane, Revolut Business et bunq sans Bridge ni autre agrégateur, en complément de Qonto. Les identifiants appartiennent au propriétaire de l’installation. Tous les connecteurs configurés se synchronisent automatiquement lorsque l’application est ouverte et visible, avec la même cadence de cinq minutes et un délai de quinze minutes après une tentative automatique échouée. La synchronisation manuelle reste disponible dans **Intégrations**. Après chaque publication bancaire réussie, Qonto, Revolut Business et bunq analysent leurs propres opérations pour détecter les charges récurrentes. Pennylane synchronise la facturation, sans détection bancaire. Les suggestions des trois banques et les actions depuis leur historique partagent les mêmes validations.

## Installation

1. Appliquer les migrations additives `supabase/migrations/202609180001_direct_integrations.sql` et `supabase/migrations/202609240001_multi_provider_automation.sql` sur la base de l’installation, avec la procédure de mise à jour et sauvegarde habituelle. Ne pas réinitialiser une base existante.
2. Ouvrir **Intégrations → Configurer**, puis renseigner les accès dans le formulaire du fournisseur. Qonto utilise l’identifiant et la clé secrète ; Pennylane un jeton v2 ; bunq une clé API. Revolut propose un lien de consentement READ et l’échange du code d’autorisation, ou un jeton de renouvellement existant.
3. Cliquer **Connecter et synchroniser**. La connexion est testée avant l’enregistrement, puis la première synchronisation démarre. Aucun redémarrage n’est nécessaire. En cas d’échec du test, la configuration précédente est conservée.

Les essais SQL utilisent exclusivement la stack jetable dédiée `jalon-2-qonto-tests`. Après validation, les migrations manquantes jusqu’à `202609240001` ont été appliquées le 24 septembre 2026 à l’installation Freelance Cashflow, dans une seule transaction. La présence des fonctions et leurs permissions serveur ont ensuite été vérifiées.

| Fournisseur | Accès direct vérifié | Configuration |
| --- | --- | --- |
| Pennylane | Company API v2, offre Essential ou supérieure, administrateur | `PENNYLANE_API_TOKEN`, permissions `customer_invoices:readonly`, `customers:readonly` |
| Revolut Business | Business API, offre Grow ou supérieure, autorisation `READ` | `REVOLUT_CLIENT_ID`, `REVOLUT_REFRESH_TOKEN`, `REVOLUT_ISSUER`, `REVOLUT_PRIVATE_KEY` |
| bunq | Clé API du titulaire, offre compatible API et enregistrement de l’appareil | `BUNQ_API_KEY`, éventuellement `BUNQ_CONTEXT_PATH` |

« Direct » ne signifie pas que l’offre du fournisseur est gratuite. Revolut personnel/Pro n’est pas Revolut Business. BNP Paribas, SG, Crédit Agricole et BPCE ne sont pas proposés avec leurs API DSP2 réservées aux prestataires autorisés. L’accès Crédit Mutuel n’a pas été validé comme accessible directement à cette installation personnelle.

## Données et limites

- **Pennylane** : clients et factures en EUR, montants et reste à encaisser ; brouillons et avoirs exclus avec compteurs affichés. Soldes inconnus, états non pris en charge et devises étrangères font échouer toute la publication. Les factures se modifient chez Pennylane, puis se resynchronisent. Les règlements connus n’inventent ni date ni événement de paiement. Les objets absents d’une nouvelle lecture sont conservés. Un numéro en conflit avec une facture manuelle/CSV bloque le lot entier, sans fusion arbitraire. Les clients sont identifiés par l’identifiant Pennylane, pas par leur nom. Voir [guide Pennylane](PENNYLANE.md).
- **Revolut** : comptes, soldes et mouvements avec leurs legs par compte ; montants signés convertis en centimes et direction. La pagination par date est contrôlée, y compris les égalités à la frontière d’une page. L’historique est relu pour retrouver les mises à jour d’anciennes opérations. Voir [adaptateur Revolut](../packages/integrations/src/revolut/README.md).
- **bunq** : comptes de paiement et paiements comptabilisés ; épargne, placements et autorisations carte non comptabilisées exclus. Authentification par installation/appareil/session, signatures vérifiées. Voir [adaptateur bunq](../packages/integrations/src/bunq/README.md).
- Les soldes publiés de toutes les banques actives sont agrégés pour la projection ; les devises différentes de celle de Freelance Cashflow sont exclues et signalées. Une synchronisation en erreur conserve la dernière publication. Chaque fournisseur dispose de son propre verrou et de ses identifiants externes.

Le contexte bunq contient une clé privée et un jeton d’installation. Il est enregistré avec des permissions `0600` dans un dossier privé `.libra`, exclu de Git. Conserver ce fichier entre les redémarrages ; si la clé ou l’adresse IP change, suivre la procédure officielle de réautorisation. Ne pas placer ce fichier dans `public/` ni dans des sauvegardes non chiffrées.

Les connecteurs n’initient aucun paiement. bunq utilise des POST uniquement pour son authentification et Revolut pour renouveler son jeton. Aucune validation avec des identifiants financiers réels n’a été effectuée ; elle nécessite la configuration du titulaire.

## Sources officielles vérifiées

- [Pennylane : accès au jeton API](https://pennylane.readme.io/docs/generating-my-api-token), [factures](https://pennylane.readme.io/reference/getcustomerinvoices).
- [Revolut : Business API](https://developer.revolut.com/docs/api/business), [éligibilité](https://help.revolut.com/business/help/integrating-with-external-apps/revolut-business-api/question-using-revolut-business-api/).
- [bunq : clés API](https://doc.bunq.com/basics/authentication/api-keys), [production](https://doc.bunq.com/basics/moving-to-production).


## Stockage des connexions configurées dans l’interface

L’installation est mono-propriétaire et nécessite un disque serveur persistant. Les formulaires sont réservés au propriétaire authentifié. Les identifiants sont chiffrés avec AES-256-GCM dans `apps/web/.libra/credentials` (chemin relatif au dossier de démarrage du serveur), fichiers en mode `0600` et répertoire `0700`. `INTEGRATION_CREDENTIALS_DIR` permet de choisir un volume privé persistant. La clé `vault.key` est créée localement et reste sur le serveur : sauvegarder le répertoire complet dans une sauvegarde chiffrée. Le chiffrement ne protège pas contre une compromission du serveur qui possède aussi la clé. Pour plusieurs processus, utiliser le même volume privé ; les hébergements sans disque persistant ne conviennent pas à ce stockage.

Les configurations enregistrées prennent le pas sur les variables d’environnement. Les configurations existantes en environnement restent utilisables jusqu’à leur remplacement ou déconnexion dans l’interface. Une déconnexion masque également la configuration d’environnement, conserve les données importées et arrête les prochaines synchronisations (une opération déjà engagée peut terminer). Elle ne révoque pas les accès chez le fournisseur ; cette révocation se fait chez la banque.

Les contextes d’authentification bunq sont conservés par clé API pour réutiliser l’installation/appareil entre le test et les synchronisations. Ne pas les supprimer tant que la clé est enregistrée chez bunq. Ils contiennent une clé privée d’installation et un jeton, protégés par les permissions de fichiers, et doivent être inclus dans les sauvegardes chiffrées. Aucun identifiant saisi n’est renvoyé dans les réponses des actions serveur.

Tiime reste en **attente d’accès API direct** demandé au fournisseur. Aucun endpoint ni protocole d’authentification privé n’est supposé. Le connecteur pourra être finalisé après réception de la documentation et des permissions. Aucune intégration Make n’est utilisée.

## Historique du solde

Le dashboard affiche 30 jours par défaut, avec choix 0/30/90. Le solde comptabilisé est reconstitué depuis la publication bancaire et les opérations terminées, à leur date de valeur si disponible. Les devises exclues, comptes inactifs et opérations en attente n’y contribuent pas. La courbe s’arrête à la dernière période commune connue des banques ; elle n’extrapole pas une publication ancienne jusqu’à aujourd’hui. Le solde manuel ne permet pas de reconstituer le passé. La sélection de période est locale au graphique et revient à 30 jours lors d’une nouvelle navigation.


## Actualisation et analyse automatiques

Les vérifications ont lieu à l’ouverture, au retour sur l’onglet et toutes les cinq minutes lorsque celui-ci est visible. La base vérifie pour chaque fournisseur que la dernière publication date d’au moins cinq minutes et qu’aucun verrou n’est actif. Après une tentative automatique échouée, le délai est de quinze minutes. Une première synchronisation réussie reste nécessaire pour activer ce mécanisme. Fermer l’application arrête les vérifications : aucun cron serveur n’a été ajouté.

Chaque fournisseur conserve son propre verrou, son historique et ses décisions. Un échec bancaire n’analyse pas de nouvelles données ; un échec d’analyse conserve la publication bancaire réussie et les décisions antérieures. Les confirmations et exclusions déjà effectuées restent conservées. **Charges → Analyser** relance les trois sources bancaires et signale les échecs partiels. Une charge déjà associée à une banque n’est pas proposée pour une seconde association depuis une autre banque. Tiime n’est pas appelé tant que son accès API n’a pas été intégré.
