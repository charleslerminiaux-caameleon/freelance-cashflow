# Freelance Cashflow

**Anticipez l’argent disponible sur votre compte dans les prochaines semaines et les prochains mois.**

Freelance Cashflow aide les indépendants à suivre leurs clients, leurs factures, leurs encaissements et leurs dépenses au même endroit. Vous pouvez comparer plusieurs prévisions, selon les revenus déjà confirmés et les missions encore en discussion.

## Installer et commencer

L’application s’utilise dans votre navigateur. Dans l’installation décrite ici, elle fonctionne sur **votre ordinateur**, tandis que vos données sont conservées dans **votre propre espace Supabase**, un service de base de données en ligne. Une installation est prévue pour une seule personne.

Il n’existe pas encore d’installation en un clic : quelques commandes sont nécessaires la première fois. Si vous n’avez jamais utilisé un terminal, vous pouvez vous faire accompagner pour cette étape. Ensuite, la gestion quotidienne se fait dans l’interface.

### 1. Préparer les outils

Les étapes ci-dessous sont à faire une seule fois. Docker n’est pas nécessaire et les banques peuvent être connectées plus tard.

#### Ouvrir le terminal

Le terminal est une fenêtre dans laquelle vous collez des commandes, puis appuyez sur **Entrée** pour les lancer.

- **Sur Mac** : appuyez sur **⌘ + Espace**, tapez `Terminal`, puis appuyez sur Entrée.
- **Sur Windows** : ouvrez le menu Démarrer, tapez `cmd`, puis ouvrez **Invite de commandes**.
- **Sur Linux** : ouvrez l’application **Terminal** de votre distribution.

Pour la suite, copiez une ligne à la fois et attendez qu’elle se termine avant de passer à la suivante. Les lignes ci-dessous ne sont pas à saisir dans la barre d’adresse du navigateur.

#### Installer Node.js

Node.js permet à Freelance Cashflow de fonctionner sur votre ordinateur.

1. Ouvrez la [page officielle de téléchargement de Node.js](https://nodejs.org/en/download).
2. Sélectionnez la **version 24 LTS** et votre système (**macOS**, **Windows** ou **Linux**).
3. Sur Mac ou Windows, téléchargez l’installateur **`.pkg`** ou **`.msi`**, ouvrez-le et suivez les étapes. Sur Linux, suivez les commandes proposées sur cette page pour votre système.
4. Fermez puis rouvrez votre terminal, et lancez :

```bash
node --version
npm --version
```

La première commande doit afficher `v24.` suivi d’autres chiffres. La seconde affiche un numéro de version : **npm est installé avec Node.js**, vous n’avez pas à l’installer séparément.

#### Installer Git

Git sert ici à télécharger l’application.

- **Sur Windows** : téléchargez l’installateur depuis la [page officielle Git pour Windows](https://git-scm.com/install/windows), ouvrez-le et conservez les choix proposés par défaut.
- **Sur Mac** : la [documentation Git pour macOS](https://git-scm.com/install/mac) propose les outils Apple. Lancez cette commande, puis acceptez l’installation dans la fenêtre qui s’ouvre :

```bash
xcode-select --install
```

Cette commande est réservée au Mac. Si un message indique que les outils sont déjà installés, passez à la vérification ci-dessous.

- **Sur Linux** : suivez la [procédure Git pour votre distribution](https://git-scm.com/install/linux).

Après l’installation, fermez puis rouvrez le terminal et vérifiez :

```bash
git --version
```

Vous devez obtenir `git version` suivi d’un numéro. Si `node`, `npm` ou `git` est « introuvable » ou « non reconnu », vérifiez que l’installation correspondante est terminée, puis rouvrez le terminal avant de continuer.

#### Créer votre espace Supabase

Supabase conserve les données de l’application. **Rien à installer sur votre ordinateur pour cette étape** : tout se passe sur son site.

1. Ouvrez [Supabase](https://supabase.com/dashboard) et créez un compte, ou connectez-vous si vous en avez déjà un.
2. Créez une organisation si le site le demande : c’est simplement l’espace qui regroupe vos projets. Vous pouvez lui donner votre nom.
3. Cliquez sur **New project** (« Nouveau projet ») et nommez-le `freelance-cashflow`.
4. Choisissez un mot de passe pour la base de données, conservez-le dans votre gestionnaire de mots de passe, puis choisissez une région proche de vous.
5. Validez la création et attendez que le projet soit prêt. Gardez cette page ouverte : vous y récupérerez les valeurs demandées à l’étape 3.

Le mot de passe de la base est distinct de celui de votre compte Supabase. Il pourra vous être demandé lors de la connexion du projet depuis le terminal.

### 2. Télécharger l’application

Dans votre terminal, exécutez ces lignes dans l’ordre. La première télécharge le projet dans un nouveau dossier `freelance-cashflow` ; la deuxième vous place dans ce dossier. Gardez ensuite ce terminal ouvert pour les étapes suivantes :

```bash
git clone https://github.com/charleslerminiaux-caameleon/freelance-cashflow.git
cd freelance-cashflow
npm install --global corepack
corepack enable
corepack pnpm install --frozen-lockfile
```

Corepack et pnpm servent à installer les composants nécessaires au projet. Si Corepack est déjà installé, vous pouvez passer la ligne `npm install --global corepack`.

### 3. Relier votre espace Supabase

Depuis le dossier `freelance-cashflow`, créez le fichier de configuration avec cette commande, identique sur Mac, Windows et Linux. Elle est destinée à une première installation : elle copie le modèle dans **`apps/web/.env.local`**.

```bash
node -e "require('node:fs').copyFileSync('.env.example', 'apps/web/.env.local', require('node:fs').constants.COPYFILE_EXCL)"
```

Si le message contient `EEXIST`, le fichier existe déjà : conservez-le et ouvrez-le directement.

Pour l’ouvrir **sur Windows**, lancez `notepad apps\web\.env.local`. **Sur Mac**, lancez `open -e apps/web/.env.local`. Sur Linux, ouvrez ce fichier avec votre éditeur de texte ; **Ctrl+H** permet généralement d’afficher les fichiers dont le nom commence par un point.

Revenez sur votre projet dans le [tableau de bord Supabase](https://supabase.com/dashboard). Le bouton **Connect** permet de retrouver l’URL du projet ; les clés sont dans **Settings → API Keys** (« Paramètres → Clés API »). Consultez au besoin l’[aide officielle pour retrouver les clés](https://supabase.com/docs/guides/api/api-keys).

Dans le fichier, collez chaque valeur après le signe `=` de la ligne correspondante, puis enregistrez avec **Ctrl+S** sur Windows ou **⌘+S** sur Mac :

| Ligne à remplir | Valeur à copier depuis Supabase |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | L’URL du projet |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | La clé publique `anon` |
| `SUPABASE_SERVICE_ROLE_KEY` | La clé secrète `service_role` |

Les clés `anon` et `service_role` se trouvent dans la rubrique des clés API historiques (« legacy »). Gardez ce fichier privé : la clé `service_role` donne un accès privilégié à vos données. Laissez les autres valeurs vides pour commencer sans connexion bancaire.

Préparez ensuite la base de données avec les commandes suivantes. Remplacez `REFERENCE_DU_PROJET` par l’identifiant de votre nouveau projet Supabase, disponible dans **Settings → General → Reference ID**. Vous le retrouvez aussi dans l’adresse de la page du projet : dans `https://supabase.com/dashboard/project/abcdefghijklmnopqrst`, la référence est `abcdefghijklmnopqrst`.

La commande `login` vous guide pour autoriser la connexion dans le navigateur. La commande `link` peut demander le mot de passe de la base choisi lors de sa création ; les caractères peuvent rester invisibles pendant la saisie, c’est normal.

```text
Exemple à adapter :
corepack pnpm dlx supabase@2.116.0 link --project-ref abcdefghijklmnopqrst
```

Voici les commandes à lancer dans l’ordre :

```bash
corepack pnpm dlx supabase@2.116.0 login
corepack pnpm dlx supabase@2.116.0 link --project-ref REFERENCE_DU_PROJET
corepack pnpm dlx supabase@2.116.0 db push --linked --dry-run
```

La dernière commande affiche les fichiers qui vont créer la structure de votre base. Vérifiez que le projet lié est bien le **nouveau projet vide dédié à Freelance Cashflow**, puis appliquez-les :

```bash
corepack pnpm dlx supabase@2.116.0 db push --linked
```

Dans les paramètres d’authentification Supabase, définissez aussi l’URL du site sur `http://localhost:3000` et autorisez les inscriptions par e-mail pour créer votre premier compte.

Vous avez déjà une installation ? Suivez le [guide de mise à jour](docs/UPDATES.md) avec sauvegarde préalable plutôt que cette procédure de première installation.

### 4. Ouvrir Freelance Cashflow

Dans le terminal, depuis le dossier `freelance-cashflow`, lancez :

```bash
corepack pnpm dev
```

Ouvrez **[http://localhost:3000](http://localhost:3000)** dans votre navigateur. Créez votre compte, confirmez votre adresse e-mail si Supabase le demande, puis connectez-vous et suivez les étapes de configuration. Le parcours **Paramètres → Installation et diagnostic** vous aide à vérifier votre installation.

Gardez le terminal ouvert pendant l’utilisation. Pour arrêter l’application, appuyez sur **Ctrl+C**. Pour la rouvrir, relancez `corepack pnpm dev` depuis son dossier, puis ouvrez la même adresse.

### 5. Faire votre première prévision

1. Renseignez votre solde de départ.
2. Ajoutez vos clients, vos missions et les paiements attendus.
3. Ajoutez vos dépenses ponctuelles ou récurrentes.
4. Consultez le tableau de bord pour voir l’évolution prévue de votre trésorerie sur 30, 90 ou 180 jours.

Vous pouvez commencer **sans connecter de banque** : la saisie manuelle et l’import de factures CSV sont disponibles. Un CSV est un fichier de tableau ; l’écran d’import indique les colonnes attendues et permet de vérifier les données avant de les enregistrer.

## Connecter vos banques et vos outils

Les connexions sont facultatives et configurables dans **Intégrations → Configurer**. Elles nécessitent les accès fournis par chaque service et, selon le fournisseur, une offre compatible. Les connecteurs lisent les données ; ils ne déclenchent aucun paiement.

| Service | Utilisation prévue |
| --- | --- |
| **Qonto** | Importer les comptes, soldes et opérations bancaires. |
| **Revolut Business** | Importer les comptes, soldes et opérations d’un compte Business compatible. |
| **bunq** | Importer les comptes de paiement et les opérations prises en charge. |
| **Pennylane** | Importer les clients et les factures. |
| **Tiime** | Connexion en préparation, en attente d’accès à son API. |

Les connecteurs Qonto, Revolut Business, bunq et Pennylane sont implémentés ; leur validation complète sur des comptes réels reste à effectuer. Les autres banques ne sont pas toutes prises en charge : consultez les [conditions et limites des connexions](docs/DIRECT_INTEGRATIONS.md).

**Pour Tiime**, il faut demander directement à Tiime un accès et une clé API spécifiques — une autorisation permettant à deux logiciels de communiquer. Cet accès est normalement réservé aux éditeurs de solutions dans le cadre d’un partenariat, comme le précise l’[aide officielle Tiime](https://support.tiime.fr/fr/articles/26240-proposez-vous-une-api). Un travail est en cours pour résoudre cette limitation et finaliser la connexion. Elle n’est donc pas encore utilisable dans l’application. En attendant, vous pouvez saisir vos factures ou les importer par CSV en adaptant les colonnes au modèle demandé.

## Aperçu

![Aperçu du tableau de bord de Freelance Cashflow](docs/assets/dashboard-reference.png)

## Informations techniques

Cette partie s’adresse aux personnes qui installent, maintiennent ou développent l’application.

### Architecture

Le projet utilise Next.js pour l’interface et le serveur, Supabase pour l’authentification et PostgreSQL pour les données. Les calculs de prévision sont regroupés dans un moteur métier indépendant de l’interface.

| Dossier | Contenu |
| --- | --- |
| `apps/web` | Interface, authentification et actions serveur Next.js |
| `packages/domain` | Règles financières et moteur de prévision |
| `packages/integrations` | Import CSV et connecteurs fournisseurs |
| `packages/shared` | Outils communs pour les montants et les dates |
| `supabase` | Migrations, règles d’accès et tests de la base |

Le dépôt utilise pnpm 10 via Corepack et Node.js 24. Chaque installation est mono-propriétaire ; les données financières sont protégées par `owner_user_id` et les règles Row Level Security de PostgreSQL.

Les migrations du dossier `supabase/migrations` préparent une nouvelle base. Pour une base existante, vérifiez les migrations en attente et sauvegardez les données avant application. Ne lancez pas `db reset` sur votre base hébergée.

Les connexions configurées depuis l’interface nécessitent un stockage serveur privé et persistant pour leurs identifiants. Consultez le [guide des connexions directes](docs/DIRECT_INTEGRATIONS.md) avant de choisir un hébergement web.

### Documentation détaillée

- [Installation et environnement de développement](docs/INSTALLATION.md)
- [Mises à jour](docs/UPDATES.md)
- [Sauvegarde et restauration](docs/BACKUP_RESTORE.md)
- [Qonto](docs/QONTO.md), [connexions directes](docs/DIRECT_INTEGRATIONS.md) et [préparation Tiime](docs/TIIME.md)
- [Détection des dépenses récurrentes](docs/RECURRING_DETECTION.md)
- [Exploitation et déploiement web](docs/DEPLOYMENT.md)
- [Contribuer](CONTRIBUTING.md) et [sécurité](SECURITY.md)

### Vérifications pour le développement

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:run
corepack pnpm build
corepack pnpm test:isolated
corepack pnpm test:client-boundary
```

Les deux dernières commandes nécessitent Docker et utilisent une base de test jetable dédiée, avec des fournisseurs simulés. Elles ne doivent pas utiliser les données ni les identifiants de votre installation réelle. Le [guide d’installation](docs/INSTALLATION.md) détaille les prérequis de test, dont Chromium.

## Licence

Le code est distribué sous licence [GNU AGPL-3.0](LICENSE). Les noms et logos des services tiers restent la propriété de leurs titulaires.

Freelance Cashflow est un outil de prévision : il ne remplace pas une comptabilité complète ni un conseil fiscal, social ou financier.
