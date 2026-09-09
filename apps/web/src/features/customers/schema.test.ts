import { describe, expect, it } from "vitest";

import { customerFormSchema } from "./schema";

describe("customerFormSchema", () => {
  it("normalizes a valid customer command", () => {
    expect(
      customerFormSchema.parse({
        name: "  Atelier Atlas  ",
        email: "contact@example.test",
        paymentTermsDays: "45",
        notes: "  Client prioritaire  ",
      }),
    ).toEqual({
      name: "Atelier Atlas",
      email: "contact@example.test",
      paymentTermsDays: 45,
      notes: "Client prioritaire",
    });
  });

  it("rejects invalid email and payment terms", () => {
    expect(
      customerFormSchema.safeParse({
        name: "Atelier Atlas",
        email: "pas-un-email",
        paymentTermsDays: "366",
        notes: "",
      }).success,
    ).toBe(false);
  });
});
