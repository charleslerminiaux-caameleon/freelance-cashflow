# Dashboard, catégories et charges depuis l’historique bancaire

Date : 2026-09-12.
Statut : conception en conversation approuvée ; spécification écrite à valider.

## Objectif et périmètre

Améliorer les parcours existants sans modifier le modèle financier : le solde publié par Qonto reste le point de départ, les transactions historiques ne sont jamais rejouées comme événements prévisionnels. Cette évolution complète le jalon 2 sur la branche isolée existante, encore non fusionnée.

L’utilisateur a approuvé : catégories plus accessibles, scénario compact, indicateur Qonto à la place du timestamp brut, actualisation après 24 heures à l’ouverture et pendant l’utilisation, création explicite d’une charge mensuelle depuis une opération, section active colorée. L’application fermée ne synchronise pas ; worker, Scaleway et déploiement cloud restent hors périmètre.

Approches considérées : conserver les composants métier et améliorer leurs points d’entrée (retenu), ou refaire le dashboard et introduire une nouvelle navigation (écarté comme inutile). Pour les charges issues de l’historique, réutiliser l’identité persistante des séries existantes évite un deuxième système de rapprochement et de suppression.

## 1. Catégories

La création, le renommage et la suppression existent déjà dans la page Charges. Ajouter un accès visible « Gérer les catégories » dans son en-tête, menant au panneau correspondant. Conserver les règles actuelles : catégories personnalisées de sortie ; catégories système protégées ; suppression sans suppression des charges, leurs catégories devenant vides selon la contrainte existante.

Dans les formulaires de création/modification de charge, de confirmation d’une suggestion et de création depuis l’historique, proposer « Créer une catégorie » à proximité du sélecteur. Ouvrir un petit formulaire accessible, sans formulaire HTML imbriqué. Après succès, ajouter et sélectionner la catégorie créée, conserver les autres valeurs saisies. Après erreur, préserver ces valeurs et afficher un message stable. Réutiliser les actions et les contrôles propriétaire existants. Pas de nouvel écran de taxonomie, de couleurs de catégories ou de classification automatique.

## 2. Scénario et navigation

Organiser le bloc scénario en deux rangées intentionnelles : groupe de trois scénarios, puis grille de quatre inclusions. Les libellés ne sont pas tronqués. Sur grand écran, chaque groupe tient sur sa rangée ; aux largeurs intermédiaires, les inclusions utilisent une grille 2 × 2 ; sur mobile, disposition verticale adaptée sans débordement horizontal. Conserver radios/checkboxes natifs, légendes, focus clavier, infobulles explicatives, soumission et paramètres URL existants. Ne pas changer les règles de projection ou les options actives lors d’un simple changement visuel.

La navigation desktop et mobile partage la même détermination de section active, fondée sur le pathname. Correspondance exacte ou chemin enfant délimité par « / » pour les pages de détail ; paramètres de recherche sans effet. Lien actif vert, fond discret, contraste et focus visibles, aria-current="page". Ne pas rendre toute l’application cliente pour cela : composant de liens client limité au besoin.

## 3. Carte Solde et état Qonto

Quand la source du solde est Qonto, afficher le logo Qonto local, une icône de statut et une information accessible au clavier/survol donnant la date et l’heure françaises dans le fuseau du propriétaire. Le timestamp brut n’est plus rendu comme texte visible. Utiliser un asset officiel identifié et conservé localement ; aucun chargement tiers à chaque affichage. L’identité de l’asset sera vérifiée avant intégration.

Fraîcheur : date de dernière publication réussie datant de moins de 24 heures. Vert et libellé accessible « Synchronisé il y a moins de 24 h » uniquement si aucun échec ultérieur connu. Synchronisation en cours : état distinct ; données anciennes : état neutre/ambre ; échec : avertissement distinct avec accès à Intégrations. La couleur seule ne porte jamais l’information. Ne pas afficher « aujourd’hui » pour une publication d’hier encore âgée de moins de 24 heures. Les dates invalides ou futures ne donnent pas un faux état vert.

Si la source est manuelle, conserver une indication manuelle avec une date lisible. Les devises exclues et avertissements existants restent accessibles et ne sont pas masqués par le badge. Les montants et les cartes ne doivent pas déborder aux largeurs testées.

## 4. Actualisation après 24 heures, application ouverte

Un petit composant monté dans le layout authentifié demande au serveur une vérification à l’ouverture, au retour au premier plan et toutes les cinq minutes lorsque l’onglet est visible. Une seule demande en vol par composant ; timer/listeners nettoyés au démontage. L’interface reste utilisable pendant la synchronisation.

L’action serveur ne reçoit ni propriétaire ni date de décision du navigateur. Elle vérifie le propriétaire, la configuration Qonto et les dates serveur. La première connexion reste manuelle : une intégration sans publication réussie ne déclenche pas cette actualisation automatique. Une publication âgée de moins de 24 heures ne déclenche aucun appel Qonto.

La décision d’acquérir une synchronisation automatique est atomique sous le verrou d’intégration existant : revérifier la fraîcheur et la temporisation à cet endroit, avant de créer un run. Ainsi, deux onglets ne lancent pas deux synchronisations successives même si le premier finit entre leurs vérifications. Une synchronisation manuelle conserve son comportement et partage le verrou. La décision « rien à faire / déjà en cours » est neutre, sans fausse erreur utilisateur.

Mémoriser une date de dernière tentative automatique côté serveur ; au maximum une nouvelle tentative automatique toutes les quinze minutes en cas d’échec. Ne pas créer une boucle de relances lors des rendus ou actualisations de route. Ce délai reste distinct des retries réseau bornés déjà implémentés. Conserver les budgets de synchronisation et d’analyse, les codes stables, le fencing et les données valides existants. Une erreur d’authentification est signalée avec accès à Intégrations ; aucune invite de secret dans le navigateur.

Après publication, réutiliser l’analyse des récurrences existante et actualiser les vues concernées. Le succès bancaire reste indépendant du succès de l’analyse. Aucun effet de bord réseau bancaire dans le rendu serveur ou une route GET : le déclenchement passe par une action authentifiée.

## 5. Créer une charge depuis l’historique

Sur une sortie positive comptabilisée, d’un compte courant actif dans la devise de projection, afficher « Créer une charge récurrente ». Les autres opérations n’offrent pas cette action. Le serveur revérifie ces critères à l’ouverture et à la confirmation, ainsi que l’appartenance et la publication source. Aucune donnée financière n’est transportée dans l’URL : seul l’identifiant interne nécessaire est transmis.

Le formulaire préremplit le libellé, le montant et le jour du prélèvement, fréquence mensuelle, certitude Engagé et catégorie vide. Proposer une première échéance strictement future, dans un mois postérieur à celui de l’opération. Permettre de modifier les champs comme dans la confirmation existante. Une opération suffit pour ce choix explicite : il ne s’agit pas d’une détection automatique et le seuil automatique de trois paiements ne change pas.

Réutiliser recurring_suggestions comme identité et décision persistantes, avec une provenance explicite distinguant détection et décision depuis l’historique. Une RPC propriétaire dédiée valide l’opération publiée puis crée/associe la charge et confirme la série atomiquement, avec une seule référence justificative suffisante pour cette voie manuelle. Ne pas affaiblir les validations de publication du moteur automatique. L’identité reste compte/devise/libellé normalisé/fréquence avec contrôle du texte complet en cas de collision d’empreinte.

Si une série pending existe, la décision explicite la confirme avec la référence sélectionnée ; si elle est dismissed, montrer clairement qu’il s’agit d’une recréation volontaire avant confirmation. Si elle est déjà confirmed, proposer d’ouvrir la charge liée plutôt que d’en créer une autre. Double soumission ou deux opérations de la même série ne créent pas deux charges. Une charge ressemblante non liée déclenche le choix existant association ou création explicitement malgré la ressemblance. L’association laisse tous ses champs inchangés.

La suppression conserve le refus de série ; la désactivation et les modifications ne sont pas annulées par la détection suivante. La provenance est visible comme « Créée depuis Qonto », distincte d’une détection automatique. Les preuves de paiement utilisent le montant observé de l’opération sélectionnée, pas le montant édité de la charge, avec la tolérance mensuelle existante ; les mois déjà payés sont exclus sur le même instantané que le solde et une opération reversed ne constitue plus une preuve. Les autres fréquences restent éditables ensuite avec l’avertissement existant sur l’exclusion mensuelle.

Verrouillage : ordre intégration puis série/charge comme les RPC et triggers existants ; contrainte de lien unique et clés étrangères propriétaire conservées. Publication devenue obsolète : demander de recharger, sans écrire une décision sur une source périmée. La voie manuelle ne nécessite ni nouveau compte fournisseur ni appel Qonto.

## 6. Sécurité, migrations et validation

Toutes les mutations restent côté serveur ou dans des RPC propriétaires avec RLS, contrôles d’appartenance et search_path fixé. Aucune clé dans Git, HTML, URL, fixtures, logs ou comptes rendus. Logs par liste blanche, sans libellé, montant individuel, IBAN ou payload brut. Utiliser uniquement des données synthétiques pour captures de validation et tests.

Prévoir une migration additive pour la temporisation automatique et la provenance/voie de confirmation depuis l’historique. Les migrations déjà appliquées ne sont pas éditées. L’application de toute nouvelle migration sur Supabase hébergé fera l’objet d’une autorisation explicite sur les fichiers préparés et revus ; les autorisations précédentes ne sont pas réutilisées.

Tests TDD : création de catégorie et conservation du formulaire ; sélection active y compris pages enfant ; options scénario inchangées ; affichage de date, frontières 24 heures, échec/chargement et accessibilité ; absence de premier import automatique ; temporisation serveur, deux onglets et concurrence manuel/automatique ; confirmation depuis une opération, double clic, refus/recréation explicite, association, corrections, suppression, source obsolète, propriétaire étranger et RLS ; neutralité avant confirmation et mois déjà payé/reversed.

Recette intégration/browser avec Qonto simulé exclusivement sur la stack jetable dédiée jalon-2-qonto-tests, ports API56321/DB56322, Next3200. Ne pas utiliser la configuration hébergée pour les tests. Le serveur utilisateur3001 partage .next : coordonner son arrêt temporaire avant build/browser et le relancer après compatibilité du schéma. Vérifier visuellement desktop, tablette et mobile avec des données fictives. Tests, typecheck, lint, build, frontière client et revue précèdent la proposition d’intégration. La recette réelle reste séparée et ne doit pas être représentée comme couverte par les simulations.
