# Freelance Cashflow

**Anticipez l’argent disponible sur votre compte dans les prochaines semaines et les prochains mois.**

Freelance Cashflow aide les indépendants à suivre leurs clients, leurs factures, leurs encaissements et leurs dépenses au même endroit. Vous pouvez comparer plusieurs prévisions, selon les revenus déjà confirmés et les missions encore en discussion.

## Installer et commencer

L’application s’utilise dans votre navigateur. Dans l’installation décrite ici, elle fonctionne sur **votre ordinateur**, tandis que vos données sont conservées dans **votre propre espace Supabase**, un service de base de données en ligne. Une installation est prévue pour une seule personne.

Il n’existe pas encore d’installation en un clic : quelques commandes sont nécessaires la première fois. Si vous n’avez jamais utilisé un terminal, vous pouvez vous faire accompagner pour cette étape. Ensuite, la gestion quotidienne se fait dans l’interface.

### 1. Préparer les outils

Vous aurez besoin de :

- **Node.js 24**, pour faire fonctionner l’application ;
- **Git**, pour télécharger le projet ;
- **un compte Supabase et un nouveau projet vide**, pour conserver vos données.

Docker n’est pas nécessaire pour cette installation. Les banques peuvent être connectées plus tard.

### 2. Télécharger l’application

Ouvrez un terminal — l’application qui permet de saisir des commandes sur votre ordinateur — puis exécutez ces lignes dans l’ordre :

```bash
git clone https://github.com/charleslerminiaux-caameleon/freelance-cashflow.git
cd freelance-cashflow
npm install --global corepack
corepack enable
corepack pnpm install --frozen-lockfile
```

Corepack et pnpm servent à installer les composants nécessaires au projet. Si Corepack est déjà installé, vous pouvez passer la ligne `npm install --global corepack`.

### 3. Relier votre espace Supabase

Dans le dossier téléchargé, copiez le fichier `.env.example` dans le sous-dossier `apps/web`, puis renommez cette copie **`.env.local`**. Ouvrez-la dans un éditeur de texte et renseignez ces trois valeurs depuis les paramètres de votre projet Supabase :

| Ligne à remplir | Valeur à copier depuis Supabase |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | L’URL du projet |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | La clé publique `anon` |
| `SUPABASE_SERVICE_ROLE_KEY` | La clé secrète `service_role` |

Les clés `anon` et `service_role` se trouvent dans la rubrique des clés API historiques (« legacy »). Gardez ce fichier privé : la clé `service_role` donne un accès privilégié à vos données. Laissez les autres valeurs vides pour commencer sans connexion bancaire.

Préparez ensuite la base de données avec les commandes suivantes. Remplacez `REFERENCE_DU_PROJET` par l’identifiant de votre nouveau projet Supabase, disponible dans ses paramètres :

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
