import { readFile } from "node:fs/promises";
import { parse } from "yaml";

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

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
let workflowDocument;

try {
  workflowDocument = parse(workflow);
} catch {
  failures.push(".github/workflows/ci.yml: document YAML invalide");
}

const setupSteps = [];
let workflowStructureValid = workflowDocument !== undefined;

if (workflowStructureValid) {
  if (!isRecord(workflowDocument) || !isRecord(workflowDocument.jobs)) {
    failures.push(".github/workflows/ci.yml: jobs doit être un objet");
    workflowStructureValid = false;
  } else {
    for (const [jobIndex, job] of Object.values(workflowDocument.jobs).entries()) {
      if (!isRecord(job)) {
        failures.push(
          `.github/workflows/ci.yml: job #${jobIndex + 1} doit être un objet`,
        );
        workflowStructureValid = false;
        continue;
      }

      if (!Object.hasOwn(job, "steps")) continue;

      if (!Array.isArray(job.steps)) {
        failures.push(
          `.github/workflows/ci.yml: steps du job #${jobIndex + 1} doit être une liste`,
        );
        workflowStructureValid = false;
        continue;
      }

      for (const [stepIndex, step] of job.steps.entries()) {
        if (!isRecord(step)) {
          failures.push(
            `.github/workflows/ci.yml: étape #${stepIndex + 1} du job #${jobIndex + 1} doit être un objet`,
          );
          workflowStructureValid = false;
          continue;
        }

        if (
          typeof step.uses === "string"
          && /^supabase\/setup-cli@.+$/u.test(step.uses)
        ) {
          setupSteps.push(step);
        }
      }
    }
  }
}

if (workflowStructureValid && setupSteps.length === 0) {
  failures.push(".github/workflows/ci.yml: aucun setup Supabase CLI trouvé");
}

for (const [setupIndex, setupStep] of setupSteps.entries()) {
  const version = isRecord(setupStep.with)
    ? setupStep.with.version
    : undefined;

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
