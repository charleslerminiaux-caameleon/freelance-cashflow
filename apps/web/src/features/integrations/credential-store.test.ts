// @vitest-environment node
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { createCredentialStore } from "./credential-store";
const directories: string[] = [];
function fixture() { const directory = mkdtempSync(join(tmpdir(), "fc-credentials-")); directories.push(directory); return { directory, store: createCredentialStore(directory) }; }
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
it("persists encrypted credentials across instances with restricted file permissions", () => {
  const { directory, store } = fixture();
  expect(store.read("qonto")).toBeUndefined();
  store.write("qonto", { login: "demo", secretKey: "private-canary" });
  expect(createCredentialStore(directory).read("qonto")).toEqual({ login: "demo", secretKey: "private-canary" });
  for (const file of readdirSync(directory)) {
    expect(readFileSync(join(directory, file), "utf8")).not.toContain("private-canary");
    expect(statSync(join(directory, file)).mode & 0o777).toBe(0o600);
  }
});
it("persists disconnection instead of accidentally falling back to environment credentials", () => {
  const { store } = fixture(); store.write("bunq", { apiKey: "old" }); store.write("bunq", null);
  expect(store.read("bunq")).toBeNull();
});
it("rejects corruption and provider-swapped ciphertext without exposing credentials", () => {
  const { directory, store } = fixture(); store.write("qonto", { secretKey: "private-canary" });
  writeFileSync(join(directory, "bunq.json"), readFileSync(join(directory, "qonto.json")));
  expect(() => store.read("bunq")).toThrow("Configuration sécurisée indisponible");
  writeFileSync(join(directory, "qonto.json"), "invalid private-canary");
  expect(() => store.read("qonto")).toThrow("Configuration sécurisée indisponible");
});
it("isolates updates to each provider and rejects arbitrary paths", () => {
  const { store } = fixture(); store.write("qonto", { login: "first" }); store.write("bunq", { apiKey: "second" });
  expect(store.read("qonto")).toEqual({ login: "first" });
  expect(() => store.write("../escape" as "qonto", {})).toThrow();
});
