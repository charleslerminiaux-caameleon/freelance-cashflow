import { describe, expect, it } from "vitest";

import { parsePublicEnv } from "./public-schema";
import { parseServerEnv } from "./server-schema";

const publicValues = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
};

describe("environment contracts", () => {
  it("returns only browser-safe values from the public contract", () => {
    expect(
      parsePublicEnv({
        ...publicValues,
        SUPABASE_SERVICE_ROLE_KEY: "must-not-cross-the-client-boundary",
      }),
    ).toEqual(publicValues);
  });

  it("rejects an invalid public Supabase URL", () => {
    expect(() =>
      parsePublicEnv({
        ...publicValues,
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      }),
    ).toThrow();
  });

  it("requires the service-role key on the server", () => {
    expect(() => parseServerEnv(publicValues)).toThrow();
  });

  it("accepts all three server-side values", () => {
    expect(
      parseServerEnv({
        ...publicValues,
        SUPABASE_SERVICE_ROLE_KEY: "server-only-key",
      }),
    ).toEqual({
      ...publicValues,
      SUPABASE_SERVICE_ROLE_KEY: "server-only-key",
    });
  });
});
