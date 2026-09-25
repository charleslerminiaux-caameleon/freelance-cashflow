# Recette de l’installateur — 25 septembre 2026

Statut : implémentation locale terminée et DMG Mac Apple Silicon de test produit. Pas de livraison publique. Windows et Mac Intel attendent l’autorisation d’exécuter les builds GitHub.

## Artefact local

- Branche : `codex/desktop-installer`, issue de `e746f4f`.
- Fichier : `apps/desktop/dist/Freelance Cashflow-0.1.0-mac-arm64.dmg`.
- SHA-256 : `db73be748a9eaaecec7e01cca00eb9b6d2bcb027d6420822d1465c1af219738e`.
- Cible : macOS 13 ou ultérieur, Apple Silicon.
- Paquet non signé, non notarisé, icône Electron par défaut : réservé à la recette.
- Les changements locaux non commités du checkout d’origine sont conservés et ne font pas partie de ce paquet.

## Résultats vérifiés

| Contrôle | Résultat |
| --- | --- |
| Tests desktop | 35 réussis |
| Tests web | 629 réussis, 100 fichiers, deux workers |
| Domaine / intégrations / partagé | 61 / 196 / 11 réussis |
| Outillage du dépôt | 28 réussis |
| Lint et types | Réussite |
| Assistant Electron natif | 1 parcours réussi, profil temporaire, saisie invalide refusée |
| Serveur standalone | Un même build, deux configurations runtime, aucun outil de développement dans le PATH enfant |
| Réseau local | Configuration et assets accessibles en IPv4 ; configuration accessible par le relais IPv6 ; HMAC et arrêt vérifiés |
| Contenu réel du DMG | Monté en lecture seule, audit du paquet et smoke réussis, volume démonté |
| Frontière client | Aucun marqueur de clé privée dans les assets analysés |
| PostgreSQL jetable | 24 fichiers pgTAP et sondes de concurrence/sauvegarde-restauration réussis avant la revue |
| Contrats de schéma | Chaque préfixe généré depuis les migrations ; suppression de colonne, modification de signature de fonction et désactivation RLS détectées |
| Catalogue existant | Inspection en lecture seule de la stack dédiée : reconnu compatible |
| Intégration web sur stack dédiée | 5 fichiers réussis |
| Navigateurs | Installation, trésorerie manuelle, Qonto et détection récurrente réussis |

Les tests PostgreSQL utilisent uniquement la stack dédiée `jalon-2-qonto-tests`. Le générateur de contrats crée et supprime sa propre base temporaire. Aucun projet Supabase hébergé ni identifiant utilisateur réel n’a été utilisé.

## Échec restant dans la suite navigateur

Le parcours `dashboard-workflows.spec.ts` échoue sur la contrainte de hauteur du tableau de bord : 836 px pour une fenêtre de 1366 × 768 (et 916 px pour 1440 × 900). Les opérations fonctionnelles du parcours précèdent cette assertion et passent. Les styles de l’application n’ont pas été modifiés par ce chantier ; ce défaut de mise en page reste à traiter séparément, en tenant compte des modifications d’interface présentes dans le checkout d’origine.

Deux assertions anciennes mentionnaient Qonto alors que l’interface commitée affiche « la banque ». Seuls leurs libellés attendus ont été remis en accord avec l’interface. L’échec de hauteur n’a pas été masqué ni son seuil assoupli. La suite navigateur complète n’est donc pas annoncée verte.

## Revue indépendante et décisions

Les quatre observations de la revue ont été acceptées et corrigées dans une passe de remédiation :

1. **IPv6** : le lanceur réserve `::1` avec son propre relais vers le serveur IPv4 authentifié. Un port IPv6 occupé est refusé ; le processus étranger reste intact.
2. **Fermeture pendant une opération** : annulation transmise au réseau, au serveur et au CLI ; arrêt de l’arbre de processus du CLI ; attente des opérations et du nettoyage avant de quitter ; aucun navigateur ouvert par une continuation tardive. Les tests couvrent attente de santé, dry-run, application et persistance.
3. **Serveur arrêté** : état vivant exposé par le handle, nouvelle preuve HMAC avant chaque ouverture, retour à l’assistant avec possibilité de réessayer.
4. **Schéma incompatible** : empreinte structurelle à chaque préfixe de migration couvrant colonnes, fonctions/signatures/corps, RLS/politiques, contraintes et déclencheurs. Refus des objets provenant de migrations encore non appliquées. Un SQL modifié invalide les contrats embarqués.

Autres choix documentés :

- HMAC par défi : ne pas envoyer le secret de lancement à un éventuel service étranger.
- Matérialisation des dépendances pnpm : préserver la résolution réelle dans le standalone, au prix d’un paquet plus volumineux.
- Supabase CLI épinglé avec son compagnon `supabase-go` et la licence officielle.
- Empreinte de schéma persistée : toute mise à jour modifiant les migrations impose une nouvelle inspection, sans conserver de jeton Management API.
- Secrets de configuration chiffrés avec Electron safeStorage ; clé publique seule exposée au navigateur.
- Contrats de catalogue stricts : une variation non reconnue est refusée et nécessite une analyse plutôt qu’une migration supposée sûre.

## Points non validés et blocage externe

- Windows x64 et Mac Intel : configuration de builds natifs fournie ; aucun binaire ni résultat natif pour ces cibles dans cette session.
- L’envoi de la branche vers `charleslerminiaux-caameleon/freelance-cashflow` a été refusé par la validation automatique, qui exige une autorisation explicite de transmettre le code au dépôt. Une demande est en attente ; aucun push, PR, merge ou publication n’a eu lieu.
- Signature et notarisation : configuration fournie, certificats absents et exécution non réalisée.
- Parcours complet sur un projet Supabase hébergé neuf, configuration Auth réelle et tests sur machines vierges : restent à effectuer.
- Mise à niveau, ACL/coffre Windows et désinstallation sur Windows/Intel : non vérifiés sur ces plateformes.
- Le DMG et le serveur qu’il contient ont été testés ; cela ne vaut pas certification d’une installation complète sur machine vierge.

Les guides `docs/DESKTOP_INSTALLATION.md` et `docs/DESKTOP_RELEASE.md` décrivent la configuration assistée, les commandes de fabrication et la recette restante.
