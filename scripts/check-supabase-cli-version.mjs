import { readFile } from "node:fs/promises";

const expectedVersion = "2.116.0";
const localCommandFiles = [
  "README.md",
  "docs/INSTALLATION.md",
  "docs/SECURITY_LOCAL.md",
  "apps/web/e2e/run-local.sh",
];
const localInvocationPattern =
  /\b(?:corepack\s+)?pnpm\s+dlx\s+(supabase(?:@[^\s`"'\\]+)?)(?=\s)/gu;
const failures = [];

for (const file of localCommandFiles) {
  const contents = await readFile(file, "utf8");
  const invocations = [...contents.matchAll(localInvocationPattern)];

  if (invocations.length === 0) {
    failures.push(`${file}: aucune invocation locale Supabase CLI trouvée`);
    continue;
  }

  for (const invocation of invocations) {
    if (invocation[1] !== `supabase@${expectedVersion}`) {
      failures.push(`${file}: Supabase CLI doit utiliser @${expectedVersion}`);
    }
  }
}

const workflow = await readFile(".github/workflows/ci.yml", "utf8");
const workflowLines = workflow.split(/\r?\n/u);
const setupLineIndexes = workflowLines.flatMap((line, index) =>
  /^\s*uses:\s*supabase\/setup-cli@[^\s#]+\s*(?:#.*)?$/u.test(line)
    ? [index]
    : [],
);

if (setupLineIndexes.length === 0) {
  failures.push(".github/workflows/ci.yml: aucun setup Supabase CLI trouvé");
}

for (const [setupIndex, setupLineIndex] of setupLineIndexes.entries()) {
  const usesIndent = workflowLines[setupLineIndex].length
    - workflowLines[setupLineIndex].trimStart().length;
  let stepEnd = workflowLines.length;

  for (let index = setupLineIndex + 1; index < workflowLines.length; index += 1) {
    const line = workflowLines[index];
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;

    if (trimmed.startsWith("- ") && indent < usesIndent) {
      stepEnd = index;
      break;
    }
  }

  const stepLines = workflowLines.slice(setupLineIndex + 1, stepEnd);
  const withLineOffset = stepLines.findIndex((line) => {
    const indent = line.length - line.trimStart().length;
    return line.trim() === "with:" && indent === usesIndent;
  });
  let version;

  if (withLineOffset >= 0) {
    const withLineIndex = setupLineIndex + 1 + withLineOffset;

    for (let index = withLineIndex + 1; index < stepEnd; index += 1) {
      const line = workflowLines[index];
      const trimmed = line.trim();
      const indent = line.length - line.trimStart().length;

      if (trimmed.length > 0 && indent <= usesIndent) break;

      const versionMatch = trimmed.match(/^version:\s*([^\s#]+)\s*(?:#.*)?$/u);
      if (versionMatch) {
        version = versionMatch[1];
        break;
      }
    }
  }

  if (version !== expectedVersion) {
    failures.push(
      `.github/workflows/ci.yml: setup Supabase CLI #${setupIndex + 1} doit définir version: ${expectedVersion}`,
    );
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Supabase CLI ${expectedVersion}: commandes locales et CI cohérentes.`);
}
