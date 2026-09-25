"use server";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { revalidatePath } from "next/cache";
import { createBunqProvider, createPennylaneProvider, createQontoProvider, createRevolutProvider } from "@fc/integrations/server";
import { requireOwner } from "@/lib/auth/require-owner";
import { credentialProviderSchema, createCredentialStore, type CredentialProvider } from "./credential-store";
import { directConfigSchemas, loadDirectConfig } from "./direct-config";
import { qontoConfigSchema } from "./qonto-config";
import { exchangeRevolutCode, buildRevolutAuthorizationUrl } from "./revolut-onboarding";
import { synchronizeDirectForOwner } from "./direct-sync";
import { synchronizeQontoForOwner } from "./sync-qonto";
import { integrationMessages } from "./status";
import type { SyncActionState } from "./integration-panel";

const name = { qonto: "Qonto", pennylane: "Pennylane", revolut: "Revolut Business", bunq: "bunq" };
function refreshPages() {
  for (const path of ["/integrations", "/integrations/setup", "/dashboard", "/cashflow", "/invoices", "/customers"]) revalidatePath(path);
  revalidatePath("/", "layout");
}
function bunqContextPath(apiKey: string): string {
  const existing = loadDirectConfig("bunq");
  if (existing?.apiKey === apiKey) return existing.contextPath;
  const fingerprint = createHash("sha256").update(apiKey).digest("hex");
  // Environment connections may have been disabled by a tombstone. Recover
  // their registered context by fingerprint, independently of active credentials.
  const legacyPath = process.env.BUNQ_CONTEXT_PATH || resolve(process.cwd(), ".libra/bunq-context.json");
  try { if (JSON.parse(readFileSync(/* turbopackIgnore: true */ legacyPath, "utf8")).fingerprint === fingerprint) return legacyPath; } catch { /* No matching legacy registration. */ }
  return resolve(process.env.INTEGRATION_CREDENTIALS_DIR || resolve(process.cwd(), ".libra/credentials"), `bunq-${fingerprint}.json`);
}
const field = (form: FormData, key: string) => { const value = form.get(key); return typeof value === "string" ? value.trim() : ""; };

export async function configureIntegrationAction(provider: CredentialProvider, _state: SyncActionState, form: FormData): Promise<SyncActionState> {
  const { userId } = await requireOwner();
  if (!credentialProviderSchema.safeParse(provider).success) return { success: false, message: "Cette connexion n’est pas disponible." };
  let credentials: Record<string, string>;
  try {
    const signal = AbortSignal.timeout(30_000);
    if (provider === "qonto") {
      credentials = qontoConfigSchema.parse({ login: field(form, "login"), secretKey: field(form, "secretKey") });
      await createQontoProvider(qontoConfigSchema.parse(credentials)).listAccounts(1, signal);
    } else if (provider === "pennylane") {
      const config = directConfigSchemas.pennylane.parse({ token: field(form, "token") });
      await createPennylaneProvider(config).readInvoices(signal);
      credentials = config;
    } else if (provider === "bunq") {
      const config = directConfigSchemas.bunq.parse({ apiKey: field(form, "apiKey"), contextPath: "unused" });
      // A bunq key is registered to its installation: retain the candidate context
      // even if later validation fails, and never overwrite another key's context.
      const contextPath = bunqContextPath(config.apiKey);
      await createBunqProvider({ apiKey: config.apiKey, contextPath }).listAccounts(1, signal);
      credentials = { apiKey: config.apiKey, contextPath };
    } else {
      const base = { clientId: field(form, "clientId"), issuer: field(form, "issuer"), privateKey: field(form, "privateKey").replace(/\\n/g, "\n") };
      const code = field(form, "code");
      const config = code
        ? await exchangeRevolutCode({ ...base, code })
        : directConfigSchemas.revolut.parse({ ...base, refreshToken: field(form, "refreshToken") });
      await createRevolutProvider(config).listAccounts(1, signal);
      credentials = config;
    }
  } catch {
    return { success: false, message: `Connexion ${name[provider]} non validée. Vérifiez les champs, les droits de lecture et l’accès API, puis réessayez. La configuration précédente est conservée.${provider === "revolut" ? " Le code Revolut expire après deux minutes : obtenez un nouveau code si nécessaire." : ""}` };
  }
  try { createCredentialStore().write(provider, credentials); }
  catch { return { success: false, message: "Connexion vérifiée, mais les identifiants n’ont pas pu être enregistrés. Vérifiez le stockage privé du serveur." }; }
  let state: SyncActionState;
  try {
    const result = provider === "qonto" ? await synchronizeQontoForOwner(userId) : await synchronizeDirectForOwner(userId, provider);
    state = !result.success
      ? { success: false, message: `Connexion enregistrée. ${integrationMessages[result.code].replaceAll("Qonto", name[provider])}` }
      : "skipped" in result && result.skipped
        ? { success: true, message: "Connexion enregistrée. Une synchronisation est déjà en cours ; consultez son état dans Intégrations." }
        : { success: true, message: `Connexion ${name[provider]} enregistrée et première synchronisation terminée.` };
  } catch { state = { success: false, message: "Connexion enregistrée. La première synchronisation a échoué ; relancez-la depuis Intégrations." }; }
  refreshPages();
  return state;
}

export async function disconnectIntegrationAction(provider: CredentialProvider, _state: SyncActionState, _form: FormData): Promise<SyncActionState> {
  await requireOwner();
  void _state; void _form;
  if (!credentialProviderSchema.safeParse(provider).success) return { success: false, message: "Cette connexion n’est pas disponible." };
  try { createCredentialStore().write(provider, null); }
  catch { return { success: false, message: "La déconnexion n’a pas pu être enregistrée. Réessayez." }; }
  refreshPages();
  return { success: true, message: `Connexion ${name[provider]} désactivée. Les données déjà importées sont conservées.` };
}

export async function prepareRevolutAuthorizationAction(_state: { url: string | null; message: string | null }, form: FormData): Promise<{ url: string | null; message: string | null }> {
  await requireOwner();
  try { return { url: buildRevolutAuthorizationUrl(field(form, "clientId"), field(form, "redirectUri")), message: null }; }
  catch { return { url: null, message: "Indiquez le Client ID et l’URL HTTPS de redirection enregistrés dans Revolut." }; }
}
