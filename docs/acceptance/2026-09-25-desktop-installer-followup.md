# Retours du premier essai Mac — version 0.1.1

## Identité visuelle

Le logo vert FC provient exactement du fichier `apps/web/public/logo-green.png` du checkout de travail de l’utilisateur. Aucun nouveau logo n’a été inventé. Il est utilisé pour l’assistant, la barre de menus, l’icône native macOS et la configuration de l’icône Windows. Les variantes natives sont des conversions/redimensionnements de cet asset. Le composant de navigation web embarqué utilise également cette variante verte.

L’assistant reprend la palette du site actuel (vert pétrole #287f79, texte #202928, fond #fafbfa, bordure #e1e6e4), sa pile de polices système et ses cartes claires. Les autres modifications d’interface non commitées dans le checkout original restent intactes.

## Refus Supabase : diagnostic réel, sans modification

Le projet lié dans le dossier de développement correspond à l’URL configurée dans l’application web. Les seules requêtes distantes exécutées sont des lectures du catalogue et de l’historique, sous transaction `BEGIN READ ONLY`. Aucune table métier n’a été lue et aucune migration ni modification n’a été effectuée.

Résultat : 21 migrations reconnues sur 21, aucune migration manquante ou inconnue ; empreinte structurelle identique à celle de l’application actuellement installée dans /Applications. Le classificateur de l’installateur reconnaît ce relevé comme compatible.

Le refus rapporté par l’utilisateur n’a donc pas été reproduit sur ce projet. L’URL effectivement saisie dans l’assistant a été demandée pour comparer les projets ; la cause du refus initial reste à confirmer.

## Diagnostic amélioré

Le message générique ne permettait pas de distinguer les causes et la phrase « Aucune migration n’a été appliquée » pouvait être comprise comme un historique vide. Les messages précisent désormais que l’assistant n’a rien modifié et distinguent :

- historique absent, migrations inconnues ou historique incomplet ;
- objets supplémentaires ou objets attendus absents ;
- structure ou règles d’accès différentes malgré un historique reconnu.

Les contrôles de compatibilité restent actifs. Aucun refus n’a été contourné.

## Vérifications

- 36 tests desktop passent, dont la distinction des raisons de refus ;
- 6 tests du composant de navigation web passent ;
- lint desktop et build standalone réussis ;
- parcours natif Electron réussi et capture inspectée ;
- smoke du serveur embarqué réussi ;
- version native 0.1.1 et fichier ICNS emballé identique au logo FC généré.

Artefact : `apps/desktop/dist/Freelance Cashflow-0.1.1-mac-arm64.dmg`, non signé.
SHA-256 : `891e7bda55a65409008e25f4fe66c6c966adb7f8b822a87682df1fb11f7d4dda`.

Mac Intel retiré de la matrice conformément au choix utilisateur. Windows sera traité après la recette Apple Silicon. Aucun envoi GitHub ni remplacement de l’application actuellement ouverte n’a été effectué.

## Correction confirmée en 0.1.2 — faux refus de schéma

L’utilisateur a confirmé l’URL du même projet et le code `DATABASE_SCHEMA_CHANGED`. Une requête directe à l’API Management avec `read_only: true`, exactement comme l’installateur, a reproduit le refus. Le relevé via CLI et celui via l’API différaient uniquement dans l’expression générée de `recurring_suggestions.normalized_label_hash` : `digest(...)` contre `extensions.digest(...)`. La fonction réellement référencée est la même ; la notation varie selon le `search_path` de la session.

Correction : fixer localement le chemin de recherche à `pg_catalog` pour la lecture du catalogue, afin de qualifier explicitement les objets applicatifs et les extensions. Cette option ne vit que dans la transaction de lecture ; elle ne modifie ni fonctions stockées, ni tables, ni politiques. Les 21 contrats de référence ont été régénérés depuis les migrations dans une base jetable. Aucun retrait de préfixe textuel ni assouplissement des contrôles structurels.

Preuves :

- test PostgreSQL de deux chemins de recherche : échec avant, réussite après ;
- génération de tous les préfixes et détection des altérations de colonne, signature et RLS : réussite ;
- inspection de la stack locale dédiée : compatible ;
- inspection directe du projet utilisateur via le véritable code `inspectDatabase` et l’API Management : compatible, zéro migration à appliquer ;
- 36 tests desktop et lint : réussite ;
- aucun secret affiché, aucun changement de donnée ou migration distante.

Le diagnostic initial par CLI n’était pas suffisant pour reproduire le contexte exact de connexion de l’assistant. La vérification finale utilise maintenant ce contexte exact.

Artefact corrigé : `apps/desktop/dist/Freelance Cashflow-0.1.2-mac-arm64.dmg`, SHA-256 `7ab9d61c3bd50fcb9d3ed3635e024612ad6fbae201d69146844eb72a4de18a30`. Paquet monté en lecture seule : manifeste corrigé identique, smoke avec Node embarqué et deux configurations réussi, volume démonté.

## Version courante intégrée en 0.1.3 et envoi de l’application sur GitHub

Le paquet précédent utilisait le dernier état commité, alors que les évolutions d’interface récentes étaient encore dans le checkout utilisateur. Les 22 fichiers concernés ont été copiés sans modifier ce checkout : nouveau tableau de bord Solde projeté, historique et commandes de projection, échantillonnage du graphique, navigation et pages d’intégration. Les tests restés sur les anciens libellés ou éléments supprimés ont été actualisés dans les copies de livraison.

La demande utilisateur autorise explicitement l’envoi de la dernière application sur GitHub, à l’exclusion de l’installateur. Une branche de travail propre, issue de `origin/main`, a reçu toutes les évolutions applicatives, y compris les intégrations et la migration multi-fournisseur précédemment commitées localement. Aucun fichier desktop, DMG, clé, configuration `.env.local`, plan ou spécification d’installateur n’a été inclus. Le commit `a89501fb166ef7cc02c73aef02428ce521fc0211` a été poussé par avance rapide sur `main` ; le SHA distant a été vérifié. Aucun push de la branche d’installateur.

Validation de l’application seule : 628 tests web, 61 domaine, 196 intégrations, 11 partagés et 28 outillage, soit 924 tests réussis ; lint, types, compilation et analyse de 28 assets client réussis. Validation du paquet : 633 tests web avec ses ajouts runtime, cinq parcours navigateur réussis sur la stack jetable, tableau de bord et intégrations identiques octet par octet à la copie GitHub, smoke du DMG monté en lecture seule réussi.

Artefact local : `apps/desktop/dist/Freelance Cashflow-0.1.3-mac-arm64.dmg`, SHA-256 `dcfd1dca871a0eb4d7d3a59c0ceacfc8c42814d40491f34e430bc9891c746764`. Le correctif Supabase, le logo FC et les réglages utilisateur sont conservés. Le schéma embarqué n’a pas changé depuis 0.1.2. Le paquet reste non signé et n’a pas été publié sur GitHub.
