import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { z } from "zod";

const ownerEmail = "owner@example.test";
const environmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().refine((value) => {
    return value === "http://127.0.0.1:56321";
  }, "Les tests E2E refusent toute instance Supabase non locale."),
  E2E_STACK_PROJECT: z.literal("jalon-2-qonto-tests"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export function parseE2EEnvironment(input: Readonly<Record<string, string | undefined>>) {
  return environmentSchema.parse(input);
}

export default async function globalSetup() {
  const environment = parseE2EEnvironment(process.env);
  const admin = createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  async function findTestOwner() {
    for (let page = 1; ; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
      if (error) throw new Error("Impossible de préparer le propriétaire E2E.");

      const owner = data.users.find((user) => user.email === ownerEmail);
      if (owner) return owner;
      if (data.users.length < 100) return null;
    }
  }

  async function deleteTestOwner(ownerUserId: string) {
    const { error: userError } = await admin.auth.admin.deleteUser(ownerUserId);
    if (userError) throw new Error("Impossible de nettoyer le propriétaire E2E.");
  }

  const previousOwner = await findTestOwner();
  if (previousOwner) await deleteTestOwner(previousOwner.id);

  const password = randomBytes(24).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email: ownerEmail,
    email_confirm: true,
    password,
  });
  if (error || !data.user) throw new Error("Impossible de créer le propriétaire E2E.");

  process.env.E2E_OWNER_PASSWORD = password;

  return async () => {
    const owner = await findTestOwner();
    if (owner) await deleteTestOwner(owner.id);
  };
}
