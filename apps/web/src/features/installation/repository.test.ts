import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { loadInstallationReport } from "./repository";
const owner = "10000000-0000-4000-8000-000000000001";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
afterEach(() => vi.useRealTimers());
it("keeps a missing RPC and failed invoice read distinct from a successfully configured expense", async () => {
  const client = createClient("http://127.0.0.1:56321", "fake-unit-anon", {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "installation-partial-test" },
    global: { fetch: async input => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/rpc/installation_diagnostic")) return json({ code: "PGRST202", message: "private-rpc-error" }, 404);
      // Refuse incorrectly scoped reads; the real PostgREST builder constructs this URL.
      if (url.searchParams.get("owner_user_id") !== `eq.${owner}`) return json({}, 403);
      if (url.pathname.endsWith("/invoices")) return json({ message: "private-invoice-error" }, 403);
      if (url.pathname.endsWith("/integrations")) return json(null);
      if (url.pathname.endsWith("/app_settings")) return json([{ owner_user_id: owner }]);
      if (url.pathname.endsWith("/planned_cashflows") && url.searchParams.get("cashflow_kind") === "in.(expense)" && url.searchParams.get("status") === "eq.planned") return json([{ owner_user_id: owner }]);
      return json([]);
    } },
  });
  const report = await loadInstallationReport(client, owner, true);
  expect(report.checks.find(c => c.id === "schema")?.state).toBe("attention");
  expect(report.steps.find(s => s.id === "expenses")?.state).toBe("ready");
  expect(report.steps.find(s => s.id === "invoices")?.state).toBe("unknown");
  expect(JSON.stringify(report)).not.toContain("private-");
});
it("returns unknown states within five seconds and aborts stalled HTTP reads", async () => {
  vi.useFakeTimers();
  const signals: AbortSignal[] = [];
  const client = createClient("http://127.0.0.1:56321", "fake-unit-anon", {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "installation-timeout-test" },
    global: { fetch: async (_input, init) => {
      const signal = init?.signal;
      if (!signal) throw new Error("Abort signal required");
      signals.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("private-timeout-error")), { once: true });
      });
    } },
  });
  const result = loadInstallationReport(client, owner, true);
  await vi.advanceTimersByTimeAsync(5001);
  const report = await result;
  expect(report.checks.every(c => c.state === "unknown")).toBe(true);
  expect(report.steps.every(s => s.state === "unknown")).toBe(true);
  expect(signals.length).toBeGreaterThan(0);
  expect(signals.every(signal => signal.aborted)).toBe(true);
  expect(JSON.stringify(report)).not.toContain("private-");
});
