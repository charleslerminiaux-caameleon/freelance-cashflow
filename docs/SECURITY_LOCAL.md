# Sécurité de l’environnement local

## Clés et fichiers d’environnement

Tous les fichiers `.env*` sont ignorés par Git, sauf `.env.example`, qui ne contient que des noms de variables et des valeurs vides.

`NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` peuvent être exposées au navigateur. `SUPABASE_SERVICE_ROLE_KEY` contourne la Row Level Security : elle reste exclusivement côté serveur et ne doit jamais être journalisée, copiée dans une capture ou préfixée par `NEXT_PUBLIC_`.

Les clés locales servent uniquement au développement. Ne les réutilisez jamais pour un projet hébergé.

## Données et tests

Le seed, les tests pgTAP et le parcours Playwright utilisent uniquement des données fictives. N’importez aucune donnée bancaire ou facture réelle dans cette stack.

Le setup E2E :

- refuse toute URL Supabase autre que `127.0.0.1` ou `localhost` ;
- génère le mot de passe de `owner@example.test` en mémoire et ne l’écrit ni dans un fichier ni dans les logs ;
- limite les mutations directes à la création et à la suppression de ce compte de test ;
- désactive captures, traces et vidéos ;
- supprime le compte et ses données même après un test en échec.

Les artefacts Playwright restent ignorés. Avant de partager un diagnostic local, vérifiez néanmoins qu’il ne contient aucune valeur de formulaire sensible.

## Hygiène des logs

Les logs applicatifs doivent utiliser une liste blanche de champs : identifiant technique, durée, compteur et code d’erreur stable. N’enregistrez jamais :

- token, cookie, mot de passe ou clé API ;
- clé service-role ou future clé Qonto ;
- IBAN complet, libellé bancaire sensible ou payload financier brut ;
- contenu d’un fichier CSV importé ;
- dump des variables d’environnement.

Les erreurs renvoyées à l’interface doivent rester actionnables sans révéler les messages bruts de PostgreSQL ou d’un fournisseur.

## Détection et rotation

La CI analyse le repository avec Gitleaks. Avant un commit, contrôlez aussi les fichiers suivis et indexés :

```bash
git status --short
git diff --cached
```

Si un secret est exposé, considérez-le comme compromis même après suppression du fichier : révoquez-le chez le fournisseur, créez une nouvelle valeur, mettez à jour les environnements autorisés et auditez l’historique Git.

Pour une compromission locale, détruisez les données de la stack concernée si nécessaire avec `corepack pnpm dlx supabase@2.116.0 stop --no-backup`. Pour Supabase hébergé ou Qonto, suivez la procédure de rotation du fournisseur ; modifier seulement un fichier `.env` ne révoque pas l’ancienne clé.
