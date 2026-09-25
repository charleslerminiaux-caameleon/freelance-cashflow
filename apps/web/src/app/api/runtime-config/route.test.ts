import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";
afterEach(() => vi.unstubAllEnvs());
it("exposes only public runtime settings and prevents caching", async () => {
  vi.stubEnv("FC_SUPABASE_URL", "https://runtime.supabase.co");
  vi.stubEnv("FC_SUPABASE_ANON_KEY", "runtime-public");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "private-canary");
  const response = GET();
  expect(await response.json()).toEqual({url:"https://runtime.supabase.co", anonKey:"runtime-public"});
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("returns a fixed error without leaking invalid configuration", async () => {
  vi.stubEnv("FC_SUPABASE_URL", "private-invalid-url");
  expect(await GET().json()).toEqual({error:"CONFIGURATION_UNAVAILABLE"});
});
