import type { Credentials } from "./credentials";

type FirstAccountDependencies = {
  getOwnerUserId: () => Promise<string | null>;
  createAccount: (credentials: Credentials) => Promise<{ succeeded: boolean }>;
  getVerifiedUserId: () => Promise<string | null>;
};

export type FirstAccountResult =
  | { kind: "ready" }
  | { kind: "error"; message: string };

export async function registerFirstAccount(
  credentials: Credentials,
  dependencies: FirstAccountDependencies,
): Promise<FirstAccountResult> {
  if ((await dependencies.getOwnerUserId()) !== null) {
    return { kind: "error", message: "Cette instance possède déjà un propriétaire." };
  }

  const account = await dependencies.createAccount(credentials);

  if (!account.succeeded) {
    return { kind: "error", message: "La création du compte propriétaire a échoué." };
  }

  if ((await dependencies.getVerifiedUserId()) === null) {
    return {
      kind: "error",
      message: "Compte créé. Confirmez votre adresse e-mail avant de continuer.",
    };
  }

  return { kind: "ready" };
}
