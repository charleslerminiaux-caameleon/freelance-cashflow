import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, linkSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { z } from "zod";

export const credentialProviderSchema = z.enum(["qonto", "pennylane", "revolut", "bunq"]);
export type CredentialProvider = z.infer<typeof credentialProviderSchema>;
const credentialsSchema = z.record(z.string().max(16384)).nullable();
const envelopeSchema = z.object({ version: z.literal(1), iv: z.string(), tag: z.string(), data: z.string() });
const unavailable = () => new Error("Configuration sécurisée indisponible");
const isMissing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";

/** Installation-scoped vault for this single-owner, self-hosted app. Never import into a client. */
export function createCredentialStore(directory = process.env.INTEGRATION_CREDENTIALS_DIR || resolve(process.cwd(), ".libra/credentials")) {
  function key(create: boolean): Buffer {
    const path = join(directory, "vault.key");
    try { const value = readFileSync(path); if (value.length !== 32) throw unavailable(); return value; }
    catch (error) { if (!isMissing(error) || !create) throw unavailable(); }
    const temporary = join(directory, `${randomUUID()}.key`);
    const value = randomBytes(32);
    writeFileSync(temporary, value, { flag: "wx", mode: 0o600 });
    try { linkSync(temporary, path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw unavailable(); }
    finally { unlinkSync(temporary); }
    return key(false);
  }
  return {
    read(provider: CredentialProvider): Record<string, string> | null | undefined {
      credentialProviderSchema.parse(provider);
      let serialized: string;
      try { serialized = readFileSync(join(directory, `${provider}.json`), "utf8"); }
      catch (error) { if (isMissing(error)) return undefined; throw unavailable(); }
      try {
        const envelope = envelopeSchema.parse(JSON.parse(serialized));
        const decipher = createDecipheriv("aes-256-gcm", key(false), Buffer.from(envelope.iv, "base64"));
        decipher.setAAD(Buffer.from(provider));
        decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
        const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]);
        return credentialsSchema.parse(JSON.parse(plaintext.toString("utf8")));
      } catch { throw unavailable(); }
    },
    write(provider: CredentialProvider, credentials: Record<string, string> | null) {
      credentialProviderSchema.parse(provider);
      credentialsSchema.parse(credentials);
      let temporary: string | undefined;
      try {
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        chmodSync(directory, 0o700);
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", key(true), iv);
        cipher.setAAD(Buffer.from(provider));
        const data = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
        temporary = join(directory, `${provider}.${randomUUID()}.tmp`);
        writeFileSync(temporary, JSON.stringify({ version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") }), { flag: "wx", mode: 0o600 });
        renameSync(temporary, join(directory, `${provider}.json`));
      } catch { throw unavailable(); }
      finally { if (temporary) { try { unlinkSync(temporary); } catch { /* Renamed or never created. */ } } }
    },
  };
}

/** A broken vault must never silently reactivate environment credentials. */
export function readSavedCredentials(provider: CredentialProvider) {
  try { return createCredentialStore().read(provider); } catch { return null; }
}
