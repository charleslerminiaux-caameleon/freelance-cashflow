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
const setupSteps = workflowLines.flatMap((line, index) =>
  /^\s*(?:-\s+)?uses:\s*supabase\/setup-cli@[^\s#]+\s*(?:#.*)?$/u.test(line)
    ? [{ inline: /^\s*-\s+uses:/u.test(line), usesLineIndex: index }]
    : [],
);

if (setupSteps.length === 0) {
  failures.push(".github/workflows/ci.yml: aucun setup Supabase CLI trouvé");
}

for (const [setupIndex, setupStep] of setupSteps.entries()) {
  const usesLine = workflowLines[setupStep.usesLineIndex];
  const usesIndent = usesLine.length - usesLine.trimStart().length;
  let stepStart = setupStep.usesLineIndex;
  let stepIndent = usesIndent;

  if (!setupStep.inline) {
    for (let index = setupStep.usesLineIndex - 1; index >= 0; index -= 1) {
      const line = workflowLines[index];
      const indent = line.length - line.trimStart().length;

      if (line.trim().startsWith("- ") && indent < usesIndent) {
        stepStart = index;
        stepIndent = indent;
        break;
      }
    }
  }

  let stepEnd = workflowLines.length;

  for (let index = stepStart + 1; index < workflowLines.length; index += 1) {
    const line = workflowLines[index];
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;

    if (trimmed.length > 0 && indent <= stepIndent) {
      stepEnd = index;
      break;
    }
  }

  const stepLines = workflowLines.slice(stepStart + 1, stepEnd);
  const withLineOffset = stepLines.findIndex((line) => {
    const indent = line.length - line.trimStart().length;
    return line.trim() === "with:" && indent > stepIndent;
  });
  let version;

  if (withLineOffset >= 0) {
    const withLineIndex = stepStart + 1 + withLineOffset;
    const withLine = workflowLines[withLineIndex];
    const withIndent = withLine.length - withLine.trimStart().length;

    for (let index = withLineIndex + 1; index < stepEnd; index += 1) {
      const line = workflowLines[index];
      const trimmed = line.trim();
      const indent = line.length - line.trimStart().length;

      if (trimmed.length > 0 && indent <= withIndent) break;

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
