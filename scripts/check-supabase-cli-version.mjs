import { readFile } from "node:fs/promises";

const expectedVersion = "2.116.0";
const localCommandFiles = [
  "README.md",
  "docs/INSTALLATION.md",
  "docs/SECURITY_LOCAL.md",
  "apps/web/e2e/run-local.sh",
];
const localInvocationPattern =
  /\b(?:corepack\s+)?pnpm\s+dlx\s+supabase(?:@([0-9]+\.[0-9]+\.[0-9]+))?\b/gu;
const failures = [];

for (const file of localCommandFiles) {
  const contents = await readFile(file, "utf8");
  const invocations = [...contents.matchAll(localInvocationPattern)];

  if (invocations.length === 0) {
    failures.push(`${file}: aucune invocation locale Supabase CLI trouvée`);
    continue;
  }

  for (const invocation of invocations) {
    if (invocation[1] !== expectedVersion) {
      failures.push(`${file}: Supabase CLI doit utiliser @${expectedVersion}`);
    }
  }
}

const workflow = await readFile(".github/workflows/ci.yml", "utf8");
const ciVersions = [
  ...workflow.matchAll(
    /uses:\s*supabase\/setup-cli@v1\s+with:\s+version:\s*([^\s]+)/gu,
  ),
].map((match) => match[1]);

if (ciVersions.length === 0) {
  failures.push(".github/workflows/ci.yml: aucun setup Supabase CLI trouvé");
} else if (ciVersions.some((version) => version !== expectedVersion)) {
  failures.push(`.github/workflows/ci.yml: Supabase CLI doit utiliser ${expectedVersion}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Supabase CLI ${expectedVersion}: commandes locales et CI cohérentes.`);
}
