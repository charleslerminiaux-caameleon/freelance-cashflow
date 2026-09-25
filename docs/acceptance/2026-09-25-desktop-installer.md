# Recette de l’installateur — 25 septembre 2026

Statut : implémentation et validation locale en cours ; aucune livraison publique.

## Périmètre vérifié

- Worktree isolé sur la branche `codex/desktop-installer`, issu de `e746f4f`.
- macOS Apple Silicon : compilation standalone, Node embarqué, démarrage avec deux configurations fictives, assets servis et arrêt propre.
- Assistant Electron natif : ouverture sans Supabase, champs masqués et refus d’une URL étrangère.
- Tests web : 629 tests passent avec deux workers ; types et frontière client vérifiés.
- Aucun identifiant réel ni projet Supabase hébergé modifié.

## Limites de la validation

Les comptes Supabase réels, la signature/notarisation, Windows et Mac Intel nécessitent une recette distincte. La workflow de fabrication native est fournie mais n’a pas été exécutée sur les serveurs GitHub dans cette session.

Les cas unitaires de migration utilisent des réponses simulées ; ils ne remplacent pas un premier parcours complet sur un projet Supabase jetable hébergé. La fabrication d’un DMG ne remplace pas la recette de son installation sur une machine vierge.

Les résultats finaux, artefacts et éventuels contrôles bloqués sont ajoutés à la fin de ce rapport avant remise.
