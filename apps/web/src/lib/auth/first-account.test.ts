import { describe, expect, it } from "vitest";

import { registerFirstAccount } from "./first-account";

const credentials = { email: "owner@example.test", password: "mot-de-passe-solide" };

describe("registerFirstAccount", () => {
  it("refuses account creation before invoking auth when an owner exists", async () => {
    const result = await registerFirstAccount(credentials, {
      getOwnerUserId: async () => "11111111-1111-4111-8111-111111111111",
      createAccount: async () => {
        throw new Error("account creation must remain unreachable");
      },
      getVerifiedUserId: async () => {
        throw new Error("user verification must remain unreachable");
      },
    });

    expect(result).toEqual({
      kind: "error",
      message: "Cette instance possède déjà un propriétaire.",
    });
  });

  it("opens onboarding after creating an immediately verified first account", async () => {
    const result = await registerFirstAccount(credentials, {
      getOwnerUserId: async () => null,
      createAccount: async () => ({ succeeded: true }),
      getVerifiedUserId: async () => "44444444-4444-4444-8444-444444444444",
    });

    expect(result).toEqual({ kind: "ready" });
  });

  it("asks for confirmation when signup creates no verified session", async () => {
    const result = await registerFirstAccount(credentials, {
      getOwnerUserId: async () => null,
      createAccount: async () => ({ succeeded: true }),
      getVerifiedUserId: async () => null,
    });

    expect(result).toEqual({
      kind: "error",
      message: "Compte créé. Confirmez votre adresse e-mail avant de continuer.",
    });
  });

  it("does not expose an authentication provider error", async () => {
    const result = await registerFirstAccount(credentials, {
      getOwnerUserId: async () => null,
      createAccount: async () => ({ succeeded: false }),
      getVerifiedUserId: async () => {
        throw new Error("verification must remain unreachable");
      },
    });

    expect(result).toEqual({
      kind: "error",
      message: "La création du compte propriétaire a échoué.",
    });
  });
});
