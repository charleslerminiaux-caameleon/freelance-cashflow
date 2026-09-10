# Préparation Tiime

L’interface indique **Accès API à obtenir**. Les contrats internes de client, facture, statut et connaissance du paiement sont préparés et testés. Aucun client HTTP Tiime, endpoint supposé, schéma fournisseur inventé ou mécanisme d’authentification Tiime n’est implémenté.

La demande d’accès constitue une dépendance externe. Selon l’[aide officielle Tiime](https://support.tiime.fr/fr/articles/26240-proposez-vous-une-api), l’API est disponible sur demande pour les éditeurs de logiciels dans le cadre d’un partenariat. Vérifiez directement l’éligibilité de cette installation et les modalités avec Tiime. Aucun message de demande n’est envoyé automatiquement.

À obtenir avant de construire le connecteur : documentation officielle versionnée, procédure d’authentification et scopes, environnement de test, pagination, limites et quotas, identifiants stables, filtres de modification, devises/centimes, statuts des factures et avoirs, suppressions, règlements partiels/complets, dates et fuseaux, distinction entre paiement inconnu et absence de paiement. Demandez également les conditions d’accès et de révocation.

En attendant, exportez vos factures puis convertissez le fichier au contrat CSV déjà pris en charge dans **Facturation → Import CSV**. Un export natif Tiime n’est pas présumé compatible : adaptez les colonnes au modèle présenté par l’importateur et vérifiez la prévisualisation avant validation.

Le futur connecteur devra conserver les identifiants externes et l’origine pour éviter les doublons, définir comment traiter les factures déjà importées par CSV et publier seulement des ensembles cohérents. La source faisant autorité pour les paiements devra être définie avant import : un règlement inconnu ne devient pas un paiement inventé ou nul. Les paiements manuels existants ne seront pas silencieusement écrasés. Aucun rapprochement automatique Qonto/facture n’est prévu à ce stade.

La préparation est livrée ; la connexion réelle et la validation Tiime restent en attente. Consultez aussi [QONTO.md](QONTO.md) pour distinguer acceptation automatisée fictive et validation réelle du jalon.
