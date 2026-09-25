# Freelance Cashflow Desktop Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Read the approved spec before execution.

**Goal:** Livrer un assistant d’installation macOS et Windows permettant de configurer Supabase puis de lancer Freelance Cashflow dans le navigateur sans terminal.

**Architecture:** Un lanceur Electron indépendant de Next.js conserve la configuration, pilote la CLI Supabase embarquée et démarre un serveur Next.js standalone avec Node.js embarqué. La configuration publique est fournie à l’exécution ; les secrets restent dans les processus privilégiés. Les données utilisateur sont séparées des binaires.

**Tech Stack:** Next.js 16 du lockfile, TypeScript pour l’application web, Node.js 24, modules JavaScript ESM et tests `node:test` pour le lanceur, Electron, electron-builder, CLI Supabase 2.116.0, Playwright pour les parcours.

**Spec:** `docs/superpowers/specs/2026-09-25-desktop-installer-design.md` — approuvée par l’utilisateur le 25 septembre 2026.

## Global Constraints

- « Aucun terminal ni outil de développement ne doit être nécessaire. »
- « interface et serveur locaux, authentification et données dans le projet Supabase de l’utilisateur. »
- « Windows ARM natif et Linux exclus de cette première version. »
- « Aucun lancement automatique à l’ouverture de session dans la V1. »
- « Utiliser une origine stable `http://localhost:3000`, cohérente avec les réglages Auth. »
- « La première version se met à jour en exécutant le nouvel installateur, sans mise à jour silencieuse. »
- Mac Apple Silicon et Intel : paquets distincts ; Windows : x64, NSIS par utilisateur.
- Ne jamais exécuter une migration sur le projet réel pendant le développement ; utiliser des bases jetables.
- Ne jamais fournir `.env.local`, clés réelles, coffre bancaire ou contexte bunq dans un paquet.
- Les fichiers déjà modifiés dans le checkout appartiennent au travail existant. Créer une isolation au début de l’exécution, sans les déplacer ni les réinitialiser ; n’intégrer que des changements identifiés pour cette fonctionnalité.
- Ne pas annoncer un système compatible sans preuve de recette sur ce système. Les certificats de distribution et la publication ne sont pas nécessaires aux tests unitaires.

## Review Focus

1. Une URL trompeuse ou une clé d’un autre projet ne doit pas recevoir de secret : tests de validation et de destination en tâche 2.
2. Le port 3000 appartient à un autre logiciel : ne pas ouvrir son contenu, le terminer ou réutiliser sa réponse de santé ; tests en tâche 3.
3. Une migration est interrompue ou la base est plus récente : inspecter l’historique avant toute nouvelle mutation ; tests en tâche 4.
4. Un chemin Windows contient espaces et caractères accentués : lancement sans shell, stockage et packaging vérifiés en tâches 2, 3 et 7.
5. Un projet ou coffre existant doit survivre à la mise à jour, à une écriture interrompue et à la désinstallation : tests en tâches 2, 6 et 7.

## Structure des fichiers et contrats

Les modules du lanceur sont organisés par responsabilité dans `apps/desktop/src/`.
Ils utilisent des dépendances injectées pour les tests ; les imports Electron restent
dans `main.mjs`, `preload.cjs` et les adaptateurs système. Pas de dépendance Electron
dans les modules métier testés avec Node.

```js
// Contrats JSDoc à définir dans apps/desktop/src/contracts.mjs.
/** @typedef {{url:string, anonKey:string, serviceRoleKey:string, projectRef:string}} InstallationConfig */
/** @typedef {{version:1, url:string, anonKey:string, projectRef:string, encryptedServiceRoleKey:string}} SavedConfig */
/** @typedef {{code:string, stage:string, retryable:boolean}} Failure */
/** @typedef {{version:string, filename:string, sha256:string}} Migration */
/** @typedef {{projectRef:string, kind:'empty'|'compatible'|'pending'|'incompatible', pending:Migration[], fingerprint:string}} DatabaseInspection */
/** @typedef {{origin:string, stop:()=>Promise<void>}} RunningServer */
```

`Failure` ne contient jamais de message brut fournisseur. Les versions de migration
sont des chaînes : conserver les identifiants et l’ordre de la CLI sans conversion
numérique, notamment les migrations historiques dont les longueurs diffèrent.

## Task 1: Configuration web évaluée au lancement

**Files:** modifier `apps/web/src/lib/env/public.ts`, `server.ts`, les trois clients
Supabase `browser.ts`, `server.ts`, `proxy.ts` et `admin.ts`. Créer
`apps/web/src/lib/env/runtime.ts`, `runtime.test.ts`,
`apps/web/src/app/api/runtime-config/route.ts` et `route.test.ts`.
Modifier `apps/web/src/proxy.ts` pour exempter uniquement les routes techniques
identifiées, ainsi que `scripts/check-client-boundary.mjs` et son test.

**Interfaces:** `readRuntimeConfig(env): {url, anonKey}` pur ;
`readServerConfig()` réservé serveur retourne `{url, anonKey, serviceRoleKey}` ;
`GET /api/runtime-config` expose exclusivement `{url, anonKey}` avec `Cache-Control: no-store`.
Le client navigateur devient `async createClient()` ; aucune utilisation actuelle
de ce module n’a été trouvée, mais refaire cette recherche avant de modifier sa signature.

- [ ] Ajouter le test de configuration évaluée avec deux jeux de variables et aucun secret :

```ts
expect(readRuntimeConfig({FC_SUPABASE_URL:'https://a.supabase.co',
  FC_SUPABASE_ANON_KEY:'public-a', SUPABASE_SERVICE_ROLE_KEY:'secret-a'}))
  .toEqual({url:'https://a.supabase.co', anonKey:'public-a'});
expect(readRuntimeConfig({FC_SUPABASE_URL:'https://b.supabase.co',
  FC_SUPABASE_ANON_KEY:'public-b'}).url).toBe('https://b.supabase.co');
```

- [ ] Exécuter `corepack pnpm --filter @fc/web exec vitest run src/lib/env/runtime.test.ts` ; constater l’échec dû au module absent.
- [ ] Implémenter la sélection runtime et le maintien du `.env.local` de développement :

```ts
export function readRuntimeConfig(env: Record<string,string|undefined>) {
  const parsed = parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: env.FC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.FC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return {url:parsed.NEXT_PUBLIC_SUPABASE_URL, anonKey:parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY};
}
```

  Importer `parsePublicEnv` depuis le schéma existant. Les modules serveur lisent
  les variables lors de l’appel, jamais à l’import. L’API dynamique appelle le lecteur
  serveur et sérialise seulement les deux propriétés publiques. Le navigateur attend
  cette réponse avant `createBrowserClient`. Le build n’utilise que des canaris fictifs.
- [ ] Tester route anonyme, réponse sans secret, absence de cache, erreur de configuration
  à code fixe et absence de boucle de redirection. Étendre le scanner des bundles
  aux canaris `service_role` et aux variables privées desktop.
- [ ] Exécuter les tests env/Supabase/proxy affectés, puis `corepack pnpm typecheck`.
  Conserver un test de paquet construit une fois avec deux configurations au lancement
  dans la tâche 7 ; un simple test du lecteur ne prouve pas le comportement compilé.
- [ ] Commit limité à ces fichiers : `feat: load Supabase configuration at runtime`.

## Task 2: Configuration desktop et protection des secrets

**Files:** créer `apps/desktop/package.json`, `src/contracts.mjs`, `src/config.mjs`,
`src/config.test.mjs`, `src/config-store.mjs`, `src/config-store.test.mjs`.
Créer un script de tests `node --test src/*.test.mjs` ; les autres commandes workspace
(`lint`, `typecheck`, `build`) doivent réellement vérifier le nouveau paquet.

**Interfaces:** `validateConfig(input): InstallationConfig`,
`createConfigStore({directory, encryptString, decryptString}).read()/write(config)`.
Les fonctions de chiffrement proviennent de `safeStorage` après `app.whenReady()`.

- [ ] Ajouter et lancer les tests rejetant les destinations trompeuses :

```js
for (const url of ['http://project.supabase.co', 'https://project.supabase.co.attacker.test',
  'https://user:password@project.supabase.co', 'https://project.supabase.co/path']) {
  assert.throws(() => validateConfig({url, anonKey:'a', serviceRoleKey:'s'}));
}
```

- [ ] Implémenter une URL Supabase hébergée HTTPS avec nom de projet attendu,
  sans identifiants, chemin, fragment, query ou port personnalisé. La V1 ne supporte
  pas les domaines Supabase personnalisés. Déduire la référence, contrôler le format
  et rôle des clés legacy attendues ; ces contrôles locaux ne remplacent pas une
  vérification réseau. Réserver les URLs locales aux fixtures injectées de tests.
- [ ] Définir un stockage atomique et versionné, avec refus des versions inconnues :

```js
const saved = {version:1, url:config.url, anonKey:config.anonKey,
  projectRef:config.projectRef,
  encryptedServiceRoleKey:encryptString(config.serviceRoleKey).toString('base64')};
// Écrire un fichier temporaire unique dans le même dossier, fermer/synchroniser,
// puis rename vers config.json ; nettoyer seulement le temporaire créé par cet appel.
```

  Refuser d’enregistrer si le chiffrement système est indisponible. Le jeton CLI et
  le mot de passe de base ne font pas partie de `SavedConfig`. Les redirections HTTP
  des vérifications sont refusées pour éviter de transférer des clés ailleurs.
- [ ] Tester écriture interrompue conservant l’ancienne configuration, corruption,
  chiffrement indisponible et dossier temporaire nommé `Équipe Freelance Cashflow`.
  Vérifier que les erreurs sérialisées ne contiennent ni clé ni valeur saisie.
- [ ] Exécuter `corepack pnpm --filter @fc/desktop test:run` ; commit
  `feat: persist protected desktop configuration`.

## Task 3: Serveur autonome et cycle de vie

**Files:** modifier `apps/web/next.config.ts` ; créer
`apps/web/src/app/api/desktop-health/route.ts` et son test,
`apps/desktop/src/server-process.mjs`, `server-process.test.mjs`,
`apps/desktop/scripts/stage-web.mjs`, `stage-web.test.mjs`.
Modifier le matcher proxy pour la route de santé exacte.

**Interfaces:** `startServer({nodePath, serverPath, config, dataDirectory, spawnProcess, fetchHealth}): Promise<RunningServer>`.
`GET /api/desktop-health` exige un jeton de lancement aléatoire dans un en-tête
et répond `{application:'freelance-cashflow', ready:true}`. Sans jeton : 404.

- [ ] Écrire un test dans lequel la santé répond 200 avec la mauvaise identité :

```js
await assert.rejects(startServer({...options,
  fetchHealth:async()=>({application:'another-app', ready:true})}),
  error => error.code === 'SERVER_IDENTITY_MISMATCH');
assert.equal(openedUrls.length, 0);
```

  Définir `options` avec un spawn factice et compteur d’arrêts ; tester aussi sortie
  prématurée, port occupé, timeout et deux appels idempotents à `stop()`.
- [ ] Activer `output:'standalone'` et `outputFileTracingRoot` couvrant le monorepo.
  Garder `.next-isolated` pour la recette existante et utiliser un répertoire de
  build desktop distinct. Copier `public` et les fichiers statiques à la position
  attendue dans le standalone ; exclure `.env*` et données privées de la copie.
- [ ] Implémenter le lancement sans shell avec environnement explicite :

```js
spawnProcess(nodePath, [serverPath], {shell:false, windowsHide:true,
  cwd:dataDirectory, env:{...osRuntimeEnv, NODE_ENV:'production',
    HOSTNAME:'127.0.0.1', PORT:'3000', FC_SUPABASE_URL:config.url,
    FC_SUPABASE_ANON_KEY:config.anonKey,
    SUPABASE_SERVICE_ROLE_KEY:config.serviceRoleKey,
    FC_DESKTOP_HEALTH_TOKEN:healthToken,
    INTEGRATION_CREDENTIALS_DIR:credentialsDirectory,
    BUNQ_CONTEXT_PATH:bunqContextPath}});
```

  `osRuntimeEnv` est une liste blanche des variables système nécessaires, incluant
  SystemRoot sous Windows ; aucun héritage global de secrets. Santé : timeout 30 s,
  délai court entre tentatives et surveillance du processus ; seule une instance
  effectivement démarrée et authentifiée permet l’ouverture du navigateur.
  Vérifier la résolution de `localhost` vers le serveur IPv4 sur les deux systèmes.
- [ ] Tester le paquet staged sans accès au dépôt ni à ses node_modules, et un chemin
  avec espaces. `stop()` attend la fin puis termine seulement le processus possédé
  si le délai de 5 s est dépassé ; vérifier le comportement Windows.
- [ ] Exécuter les tests desktop, route et copie ; commit
  `feat: run the packaged web server from the desktop launcher`.

## Task 4: Inspection Supabase et préparation de la base

**Files:** créer `apps/desktop/src/supabase-inspection.mjs`,
`supabase-inspection.test.mjs`, `supabase-cli.mjs`, `supabase-cli.test.mjs`,
`migration-session.mjs`, `migration-session.test.mjs`,
`apps/desktop/scripts/migration-manifest.mjs` et son test.

**Interfaces:** `inspectDatabase({config, accessToken, manifest, request}): Promise<DatabaseInspection>` ;
`createMigrationSession({cliPath, temporaryRoot, spawnProcess}).preview(input)/apply(input)/dispose()`.
`input` contient config, jeton, mot de passe, manifeste ; `apply` exige également
le fingerprint confirmé et, pour une base existante, une sauvegarde vérifiée.

- [ ] Tester le refus d’une base étrangère et d’un aperçu devenu obsolète :

```js
assert.equal(classifyDatabase({unknownObjects:['public.payroll'],
  remoteVersions:[], manifest:[]}).kind, 'incompatible');
await assert.rejects(session.apply({...input, confirmedFingerprint:'old'}),
  error => error.code === 'DATABASE_CHANGED');
assert.equal(pushCalls.length, 0);
```

  Définir `classifyDatabase` comme fonction pure exportée du module d’inspection.
  Les tests créent une session avec transport et CLI factices ; aucune connexion réelle.
- [ ] Produire le manifeste depuis les fichiers SQL immuables : version chaîne,
  nom, SHA-256. Rejeter doublons et modification d’un fichier après aperçu.
- [ ] Inspecter via l’API Management Supabase, avec jeton temporaire et requêtes
  SQL fixes en lecture seule : inventaire des objets utilisateur hors extensions,
  historique des migrations, puis comparaison au manifeste et au contrat attendu.
  Utiliser `https://api.supabase.com/v1/projects/{ref}/database/query` seulement
  après vérification du contrat officiel ; pas de SQL fourni par le renderer.
  Ne pas utiliser `db dump` ou `db diff`, qui pourraient introduire Docker.
  Un historique connu ne suffit pas : contrôler les objets indispensables et refuser
  les objets étrangers. Un état ambigu est incompatible, jamais « base vide ».
- [ ] Piloter la CLI 2.116.0 dans un dossier temporaire privé contenant seulement
  config minimale et migrations du paquet. Ne pas appeler `login`, qui pourrait
  persister le jeton ; le fournir aux seuls processus enfants nécessaires :

```js
const env = {...osRuntimeEnv, SUPABASE_ACCESS_TOKEN:accessToken,
  SUPABASE_DB_PASSWORD:databasePassword};
const commands = [
  ['link','--project-ref',config.projectRef],
  ['db','push','--linked','--dry-run'],
];
// Après inspection renouvelée et confirmation exacte :
const applyArgs = ['db','push','--linked','--yes'];
```

  Vérifier ces options avec la version épinglée. Aucune valeur secrète dans argv,
  aucun `shell:true`, `reset`, `repair`, `--include-all`, `--include-seed` ou `--debug`.
  Les sorties brutes ne vont ni au renderer ni aux logs. Contrôler le code de sortie,
  borner sortie et durée à 180 s ; si l’opération est interrompue, marquer l’état
  incertain et refaire l’inspection avant de permettre une reprise.
- [ ] Afficher la liste à partir du manifeste et de l’historique ; ne pas fonder
  l’autorisation sur une simple recherche de texte dans stdout. Refaire l’inspection
  juste avant et après application. Supprimer les temporaires possédés et oublier
  les identifiants transitoires en sortie de parcours, y compris sur erreur.
- [ ] Tester base vide, version plus récente, migration manquante intermédiaire,
  identifiants invalides, interruption, 401, 429, timeout et secrets dans stderr.
  Vérifier que le lien CLI du développeur reste inchangé.
- [ ] Exécuter les tests desktop ; commit `feat: guide safe Supabase database preparation`.

## Task 5: Assistant graphique et intégration du lanceur

**Files:** créer `apps/desktop/src/main.mjs`, `preload.cjs`, `ipc.mjs`, `ipc.test.mjs`,
`wizard-state.mjs`, `wizard-state.test.mjs`, `ui/index.html`, `ui/wizard.mjs`,
`ui/styles.css`, `apps/desktop/e2e/wizard.spec.mjs`.
Modifier le package desktop et le lockfile avec des versions exactes d’Electron,
electron-builder et Playwright compatibles et vérifiées au moment de l’installation.

**Interfaces:** bridge `window.cashflowDesktop` avec méthodes bornées
`getState`, `inspect`, `preview`, `apply`, `saveAndStart`, `openSupabase`, `quit`.
Les secrets ne ressortent jamais dans `getState`. Les mutations sont sérialisées.

- [ ] Écrire le test bloquant un passage direct de bienvenue à application :

```js
assert.throws(() => transition({step:'welcome'}, {type:'APPLY'}),
  error => error.code === 'INVALID_STEP');
assert.equal(isTrustedSender({url:'https://attacker.test', mainFrame:false}), false);
```

  Exporter `transition` et `isTrustedSender` des modules correspondants.
- [ ] Implémenter le parcours Bienvenue → Projet → Accès → Vérification → Aperçu →
  Préparation → Réglages Auth guidés → Terminé. Présenter distinctement nouveau
  projet et installation existante. Chaque échec propose une action et conserve
  seulement les entrées non sensibles utiles ; désactiver les doubles soumissions.
- [ ] Utiliser une fenêtre locale avec `nodeIntegration:false`, `contextIsolation:true`,
  `sandbox:true`, CSP restrictive et preload limité. Vérifier la fenêtre et frame
  émettrices, schémas et étape courante pour chaque IPC. Les liens externes sont
  choisis dans une liste fixe de pages Supabase ; aucune URL arbitraire issue de l’IPC.
- [ ] Utiliser `app.requestSingleInstanceLock()`, le dossier `app.getPath('userData')`,
  les adaptateurs config, migration et serveur précédents. Fournir un menu accessible
  Ouvrir / Diagnostic / Quitter, sur Mac et dans la zone de notification Windows.
  Au second lancement, ouvrir l’assistant s’il est incomplet, sinon le navigateur.
- [ ] À la fermeture de l’assistant avant fin, proposer quitter ou continuer ; après
  installation, le lanceur reste vivant jusqu’à Quitter. Ne pas tuer un serveur tiers.
  Sauvegarder la nouvelle configuration seulement après validation complète ; une
  reconfiguration ne détruit pas celle qui fonctionne si le nouveau lancement échoue.
- [ ] Tests Playwright avec transport factice : navigation clavier, champs masqués,
  migration refusée sans aperçu, réseau coupé, reprise et réouverture configurée.
  Le transport factice appartient exclusivement au harness et ne doit pas être activable
  par une variable utilisateur dans une version distribuée.
- [ ] Exécuter tests desktop, lint, types et parcours assistant ; commit
  `feat: add the desktop setup wizard for Mac and Windows`.

## Task 6: Mise à jour, coffre bancaire et diagnostic

**Files:** créer `apps/desktop/src/upgrade.mjs`, `upgrade.test.mjs`,
`diagnostic.mjs`, `diagnostic.test.mjs` ; modifier
`apps/web/src/features/integrations/credential-store.ts` et ses tests seulement si
la recette Windows révèle une incompatibilité ; créer
`apps/desktop/e2e/upgrade.spec.mjs`.

**Interfaces:** `assessUpgrade({savedVersion, packagedVersion, inspection}): {canStart, requiresMigration, reason}` ;
`publicDiagnostic(input)` retourne exclusivement version, plateforme, étape, codes
et états des contrôles. Ni chemins contenant un nom d’utilisateur ni identifiants.

- [ ] Tester que changer les binaires conserve exactement le coffre et la configuration :

```js
const before = await readFile(join(dataDirectory,'credentials','qonto.json'));
await installReplacement(packageV2, installationDirectory);
assert.deepEqual(await readFile(join(dataDirectory,'credentials','qonto.json')), before);
```

  `installReplacement` est un helper de test de remplacement des ressources du
  lanceur, pas une fonction installant réellement un logiciel sur la machine hôte.
- [ ] Bloquer les mutations sur schéma inconnu ou plus récent ; pour schéma antérieur,
  afficher sauvegarde/restauration et aperçu exact avant application. La vérification
  de sauvegarde renvoie au guide existant, sans promettre une sauvegarde automatisée.
- [ ] Vérifier les opérations réelles du coffre (création, concurrence, renommage,
  permissions) sur Windows. Ne pas assimiler les modes POSIX aux ACL Windows ;
  conserver les fichiers dans le profil privé utilisateur. Toute adaptation doit
  préserver la compatibilité de lecture des enveloppes existantes.
- [ ] Tester erreur déchiffrement, downgrade, diagnostic contenant un faux secret en
  entrée et connexion bunq après redémarrage. Le diagnostic doit filtrer, non masquer
  après coup une chaîne d’erreur arbitraire.
- [ ] Exécuter tests ciblés et recette de remplacement ; commit
  `feat: preserve desktop settings and integration credentials across upgrades`.

## Task 7: Paquets natifs reproductibles et recette de distribution

**Files:** créer `apps/desktop/electron-builder.yml`,
`apps/desktop/runtime-manifest.json`, `apps/desktop/scripts/fetch-runtimes.mjs`,
`fetch-runtimes.test.mjs`, `package-audit.mjs`, `package-audit.test.mjs`,
`apps/desktop/scripts/smoke-packaged.mjs`, `.github/workflows/desktop.yml`.
Modifier `package.json`, `.gitignore` et `pnpm-lock.yaml` pour commandes et sorties.

**Interfaces:** manifeste versionné de chaque binaire : fournisseur, version,
OS, architecture, URL officielle et SHA-256 vérifiée ; audit du staging avant packaging.
Scripts `desktop:stage`, `desktop:package`, `desktop:smoke` documentés à la racine.

- [ ] Tester qu’une empreinte incorrecte ou un fichier privé empêche le paquet :

```js
await assert.rejects(verifyDownload(archivePath, '0'.repeat(64)),
  error => error.code === 'CHECKSUM_MISMATCH');
await assert.rejects(auditPackage(fixtureContainingEnvLocal),
  error => error.code === 'PRIVATE_FILE_IN_PACKAGE');
```

  Exporter les deux fonctions des scripts correspondants sans effet de bord à l’import.
- [ ] Télécharger les runtimes uniquement à la fabrication, contrôler empreintes,
  chemins d’extraction et architectures. Fournir Node 24 et CLI 2.116.0 dans les
  ressources décompressées ; aucun besoin de téléchargement d’outillage à l’installation.
  Épingler les versions exactes et empreintes officielles dans le manifeste, après
  vérification des assets disponibles. Ne jamais fabriquer des checksums supposés.
- [ ] Configurer les cibles :

```yaml
appId: com.freelancecashflow.desktop
productName: Freelance Cashflow
asar: true
mac:
  target: dmg
win:
  target: nsis
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  deleteAppDataOnUninstall: false
```

  Restreindre `files` à l’UI et au lanceur et `extraResources` au standalone audité,
  runtimes et migrations. Ajouter notices/licences, icônes du projet et métadonnées
  de version. Ne pas copier le dépôt entier. Confirmer les noms de configuration
  auprès de la version electron-builder épinglée avant d’utiliser ce YAML.
- [ ] Créer une matrice CI avec hôtes natifs pour macOS arm64, macOS x64 et Windows
  x64, sur déclenchement manuel initial. Vérifier l’architecture effective de l’hôte
  et la disponibilité du runner ; échouer explicitement plutôt que valider par émulation.
  Exécuter tests, build, staging, audit et smoke avant téléchargement des artefacts.
  La CI ne publie pas de release et ne reçoit aucun identifiant Supabase réel.
- [ ] Le smoke retire les outils de développement du PATH et lance depuis un dossier
  temporaire sans dépôt. Construire une seule fois ; lancer avec configurations
  fictives A puis B, et vérifier la réponse runtime, les assets et le démarrage.
  Les services réseau sont simulés par le harness externe, jamais par le paquet livré.
- [ ] Ajouter deux modes : recette explicitement non signée, livraison exigeant
  signature. L’absence de certificat ne doit pas produire une livraison annoncée
  comme signée. Prévoir notarisation Apple et signature Windows des binaires embarqués.
- [ ] Exécuter recette native d’installation, lancement, remplacement et désinstallation
  sur machines de test, y compris architecture Mac Intel ; capturer version, plateforme,
  résultats et limites. Pas de déclaration de compatibilité basée sur un build seul.
- [ ] Commit `build: package Freelance Cashflow for macOS and Windows`.

## Task 8: Documentation et validation finale

**Files:** créer `docs/DESKTOP_INSTALLATION.md`, `docs/DESKTOP_RELEASE.md`,
`docs/acceptance/2026-09-25-desktop-installer.md` ; modifier `README.md`,
`docs/INSTALLATION.md`, `docs/UPDATES.md`, `docs/SECURITY_LOCAL.md` et
`docs/DEPLOYMENT.md` de façon ciblée, en préservant les changements préexistants.

- [ ] Décrire les fichiers à télécharger, étapes encore manuelles Supabase, premier
  compte, lancement, arrêt, port occupé, réparation, désinstallation et accès aux
  données. Documenter Mac Intel/Apple Silicon et Windows x64 ainsi que les versions
  minimales effectivement supportées par la version Electron choisie.
- [ ] Documenter fabrication, signature, notarisation, validation et publication
  distinctes. Ajouter les licences des composants distribués. Les liens de téléchargement
  ne doivent pointer que vers des artefacts réellement disponibles.
- [ ] Exécuter une fois les contrôles complets après intégration :

```sh
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:run
corepack pnpm build
corepack pnpm test:isolated
corepack pnpm test:client-boundary
corepack pnpm --filter @fc/desktop test:run
corepack pnpm desktop:smoke
```

  Compléter par la matrice native de la tâche 7. Si Docker, certificat ou machine
  cible est indisponible, inscrire exactement le contrôle non réalisé dans la recette.
  Ne pas substituer un résultat unitaire à une recette système.
- [ ] Revoir le diff final pour secrets, fichiers étrangers au chantier et régressions
  du démarrage développeur ; consigner les commandes et résultats observés.
- [ ] Commit documentaire limité : `docs: document desktop installation and release checks`.

## Autorelecture du plan

La spec est couverte par les tâches 1 à 8 : configuration runtime (1), secrets et
stockage (2), serveur local (3), base et reprise (4), parcours et double-clic (5),
mises à jour (6), distribution et OS (7), accompagnement et preuves (8).
Les cinq cas de Review Focus sont attachés à leurs tests. Aucun déploiement réel,
achat de certificat ou mutation de la base utilisateur n’est inclus dans l’exécution.

## Exécution proposée

Implémentation directe dans cette session, tâche par tâche, puis revue indépendante
du changement complet. Cette méthode limite les passages de contexte entre composants
étroitement liés. Variante : un sous-agent d’implémentation et un de revue par tâche,
avec davantage de contrôles intermédiaires et de coût. Le choix et la revue du plan
précèdent l’exécution, conformément au skill writing-plans.
