# Connexions directes

Libra propose Pennylane, Revolut Business et bunq sans Bridge ni autre agrégateur, en complément de Qonto. Les identifiants appartiennent au propriétaire de l’installation. La synchronisation de ces trois nouveaux connecteurs est manuelle depuis **Intégrations** ; seul Qonto conserve son actualisation automatique et son analyse automatique des récurrences. La création d’une charge depuis une opération de l’historique reste également réservée à Qonto ; la saisie manuelle des charges reste disponible pour toutes les installations.

## Installation

1. Appliquer la migration additive `supabase/migrations/202609180001_direct_integrations.sql` sur la base de l’installation, avec la procédure de mise à jour et sauvegarde habituelle. Ne pas réinitialiser une base existante.
2. Compléter les variables **serveur uniquement** dans `apps/web/.env.local`, d’après `.env.example` et le guide intégré `/integrations/setup`.
3. Redémarrer Libra, puis lancer la synchronisation depuis **Intégrations**.

Aucune migration n’a été appliquée à une base utilisateur pendant le développement. Les essais SQL utilisent exclusivement la stack jetable dédiée `jalon-2-qonto-tests`.

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
- Les soldes publiés de toutes les banques actives sont agrégés pour la projection ; les devises différentes de celle de Libra sont exclues et signalées. Une synchronisation en erreur conserve la dernière publication. Chaque fournisseur dispose de son propre verrou et de ses identifiants externes.

Le contexte bunq contient une clé privée et un jeton d’installation. Il est enregistré avec des permissions `0600` dans un dossier privé `.libra`, exclu de Git. Conserver ce fichier entre les redémarrages ; si la clé ou l’adresse IP change, suivre la procédure officielle de réautorisation. Ne pas placer ce fichier dans `public/` ni dans des sauvegardes non chiffrées.

Les connecteurs n’initient aucun paiement. bunq utilise des POST uniquement pour son authentification et Revolut pour renouveler son jeton. Aucune validation avec des identifiants financiers réels n’a été effectuée ; elle nécessite la configuration du titulaire.

## Sources officielles vérifiées

- [Pennylane : accès au jeton API](https://pennylane.readme.io/docs/generating-my-api-token), [factures](https://pennylane.readme.io/reference/getcustomerinvoices).
- [Revolut : Business API](https://developer.revolut.com/docs/api/business), [éligibilité](https://help.revolut.com/business/help/integrating-with-external-apps/revolut-business-api/question-using-revolut-business-api/).
- [bunq : clés API](https://doc.bunq.com/basics/authentication/api-keys), [production](https://doc.bunq.com/basics/moving-to-production).
