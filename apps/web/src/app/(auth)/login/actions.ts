"use server";

import { redirect } from "next/navigation";

import { parseCredentials } from "@/lib/auth/credentials";
import { registerFirstAccount } from "@/lib/auth/first-account";
import { decideAppRoute } from "@/lib/auth/route-decision";
import { getOwnerUserId } from "@/lib/supabase/owner-settings";
import { createClient } from "@/lib/supabase/server";

type AuthActionState = { message: string | null };

function credentialsFrom(formData: FormData) {
  return parseCredentials({
    email: formData.get("email"),
    password: formData.get("password"),
  });
}

export async function signIn(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  let credentials;

  try {
    credentials = credentialsFrom(formData);
  } catch {
    return { message: "Vérifiez l’adresse e-mail et le mot de passe." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials);

  if (error) {
    return { message: "Connexion impossible avec ces identifiants." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { message: "La session n’a pas pu être vérifiée." };
  }

  const ownerUserId = await getOwnerUserId();
  redirect(
    decideAppRoute({
      hasSession: true,
      hasOwner: ownerUserId !== null,
      isOwner: user.id === ownerUserId,
    }),
  );
}

export async function signUp(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  let credentials;

  try {
    credentials = credentialsFrom(formData);
  } catch {
    return { message: "Utilisez une adresse valide et un mot de passe de 8 caractères minimum." };
  }

  const supabase = await createClient();
  const result = await registerFirstAccount(credentials, {
    getOwnerUserId,
    createAccount: async (validatedCredentials) => {
      const { error } = await supabase.auth.signUp(validatedCredentials);
      return { succeeded: error === null };
    },
    getVerifiedUserId: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user?.id ?? null;
    },
  });

  if (result.kind === "ready") {
    redirect("/onboarding");
  }

  return { message: result.message };
}
