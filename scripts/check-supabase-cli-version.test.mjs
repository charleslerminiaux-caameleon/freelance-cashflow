import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const contractPath = fileURLToPath(
  new URL("./check-supabase-cli-version.mjs", import.meta.url),
);
const exactLocalCommand = "corepack pnpm dlx supabase@2.116.0 status --output env";
const exactSetupStep = `
      - name: Set up Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: 2.116.0
`;
const exactInlineSetupStep = `
      - uses: supabase/setup-cli@v1
        with:
          version: 2.116.0
`;

async function runContract({
  readmeCommand = exactLocalCommand,
  workflow = `jobs:
  database:
    steps:${exactSetupStep}
  e2e:
    steps:${exactSetupStep}`,
} = {}) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "freelance-cashflow-cli-pin-"));
  const fixtureFiles = new Map([
    ["README.md", readmeCommand],
    ["docs/INSTALLATION.md", exactLocalCommand],
    ["docs/SECURITY_LOCAL.md", exactLocalCommand],
    ["apps/web/e2e/run-local.sh", exactLocalCommand],
    [".github/workflows/ci.yml", workflow],
  ]);

  try {
    for (const [relativePath, contents] of fixtureFiles) {
      const absolutePath = join(fixtureRoot, relativePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents, "utf8");
    }

    return spawnSync(process.execPath, [contractPath], {
      cwd: fixtureRoot,
      encoding: "utf8",
    });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

test("accepts exact local and CI Supabase CLI versions", async () => {
  const result = await runContract();

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Supabase CLI 2\.116\.0/u);
});

test("rejects a prerelease suffix on a local Supabase package specifier", async () => {
  const result = await runContract({
    readmeCommand: "corepack pnpm dlx supabase@2.116.0-rc.1 status --output env",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /README\.md/u);
});

test("rejects a CI setup step whose Supabase version is absent", async () => {
  const result = await runContract({
    workflow: `jobs:
  database:
    steps:
      - name: Set up Supabase CLI
        uses: supabase/setup-cli@v1
`,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ci\.yml/u);
});

test("rejects an additional CI setup step without a Supabase version", async () => {
  const result = await runContract({
    workflow: `jobs:
  database:
    steps:${exactSetupStep}
  e2e:
    steps:
      - name: Set up another Supabase CLI
        uses: supabase/setup-cli@v1
`,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ci\.yml/u);
});

test("rejects an inline CI setup step without a version beside a pinned named step", async () => {
  const result = await runContract({
    workflow: `jobs:
  database:
    steps:
      - uses: supabase/setup-cli@v1
  e2e:
    steps:${exactSetupStep}`,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ci\.yml/u);
});

test("accepts an inline CI setup step with the exact version", async () => {
  const result = await runContract({
    workflow: `jobs:
  database:
    steps:${exactInlineSetupStep}`,
  });

  assert.equal(result.status, 0, result.stderr);
});

test("rejects version-like text inside a multiline scalar", async () => {
  const result = await runContract({
    workflow: `jobs:
  database:
    steps:
      - name: |
          This text is not step configuration.
          with:
            version: 2.116.0
        uses: supabase/setup-cli@v1
`,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ci\.yml/u);
});

test("rejects an invalid workflow document without echoing parser details", async () => {
  const result = await runContract({ workflow: "jobs: [" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /document YAML invalide/u);
});

test("rejects malformed workflow jobs", async () => {
  const result = await runContract({ workflow: "jobs: []" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /jobs doit être un objet/u);
});

test("rejects malformed workflow steps", async () => {
  const result = await runContract({
    workflow: `jobs:
  database:
    steps: invalid
`,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /steps du job #1 doit être une liste/u);
});

test("rejects a valid workflow with no Supabase setup step", async () => {
  const result = await runContract({
    workflow: `jobs:
  quality:
    steps:
      - run: corepack pnpm lint
`,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /aucun setup Supabase CLI trouvé/u);
});

test("accepts quoted setup values with YAML comments", async () => {
  const result = await runContract({
    workflow: `jobs:
  database:
    steps:
      - uses: "supabase/setup-cli@v1" # action pin
        with:
          version: "2.116.0" # CLI pin
`,
  });

  assert.equal(result.status, 0, result.stderr);
});
