import { expect, it } from "vitest";

import { repositoryError } from "./repository-error";

it("keeps only a stable commercial code from a database error", () => {
  const error = repositoryError({
    code: "P0001",
    message: "FC_OPPORTUNITY_ALREADY_CONVERTED: private database detail",
  });

  expect(error.code).toBe("FC_OPPORTUNITY_ALREADY_CONVERTED");
  expect(error.message).toBe("Commercial database operation failed");
  expect(error.message).not.toContain("private database detail");
});
