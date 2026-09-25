import { describe, expect, it } from "vitest";
import { readRuntimeConfig } from "./runtime";

describe("runtime configuration", () => {
  it("reads each installation at runtime without exposing privileged values", () => {
    const env = { FC_SUPABASE_URL: "https://a.supabase.co", FC_SUPABASE_ANON_KEY: "public-a", SUPABASE_SERVICE_ROLE_KEY: "secret" };
    expect(readRuntimeConfig(env)).toEqual({ url: "https://a.supabase.co", anonKey: "public-a" });
    env.FC_SUPABASE_URL = "https://b.supabase.co";
    expect(readRuntimeConfig(env).url).toBe("https://b.supabase.co");
  });
  it("preserves development environment support and rejects missing configuration", () => {
    expect(readRuntimeConfig({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test" })).toEqual({ url: "http://127.0.0.1:56321", anonKey: "test" });
    expect(() => readRuntimeConfig({})).toThrow();
  });
});
