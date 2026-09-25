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
