import { parseE2EEnvironment } from "../../../e2e/global-setup";

const serviceRoleKey = "local-test-service-role-key";

it.each(["http://127.0.0.1:55321", "http://localhost:55321"])(
  "allows the loopback Supabase endpoint %s",
  (url) => {
    expect(
      parseE2EEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      }).NEXT_PUBLIC_SUPABASE_URL,
    ).toBe(url);
  },
);

it("refuses a hosted Supabase endpoint before any test-user mutation", () => {
  expect(() =>
    parseE2EEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    }),
  ).toThrow("Les tests E2E refusent toute instance Supabase non locale.");
});
