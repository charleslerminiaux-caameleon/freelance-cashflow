import { expect, it } from "vitest";

import { onboardingErrorMessage } from "./onboarding-result";

it("returns the exact singleton-conflict message", () => {
  expect(onboardingErrorMessage({ code: "23505", message: "OWNER_ALREADY_EXISTS" })).toBe(
    "Cette instance possède déjà un propriétaire.",
  );
});

it("does not misreport or expose another database error", () => {
  expect(
    onboardingErrorMessage({
      code: "23505",
      message: "duplicate key value exposes internal table details",
    }),
  ).toBe("La configuration n’a pas pu être enregistrée.");
});
