import { describe, expect, it } from "vitest";
import { buildInstallationReport, type InstallationSnapshot } from "./report";

const empty: InstallationSnapshot = {
  database: true, contract: { version: 1, syncIntervalSeconds: 300 },
  expenses: false, invoices: false, reserves: false, integration: null,
};

describe("installation report", () => {
  it("keeps an empty manual installation usable without presenting optional steps as failures", () => {
    const report = buildInstallationReport(empty, false);
    expect(report.checks.find(c => c.id === "database")?.state).toBe("ok");
    expect(report.checks.find(c => c.id === "schema")?.state).toBe("ok");
    expect(report.steps.find(s => s.id === "bank")?.state).toBe("optional");
    expect(report.steps.find(s => s.id === "invoices")?.state).toBe("optional");
    expect(report.steps.find(s => s.id === "expenses")?.href).toBe("/expenses");
  });
  it("marks only persisted business data and a successful publication as configured", () => {
    const report = buildInstallationReport({ ...empty, expenses: true, invoices: true, reserves: true,
      integration: { status: "connected", last_success_at: "2026-09-15T12:00:00Z" } }, true);
    expect(report.steps.every(s => s.state === "ready")).toBe(true);
    expect(report.lastSuccessAt).toBe("2026-09-15T12:00:00Z");
  });
  it("does not turn unavailable data or an absent migration into empty or healthy states", () => {
    const report = buildInstallationReport({ database: false, contract: null, expenses: null,
      invoices: null, reserves: null, integration: undefined }, true);
    expect(report.checks.find(c => c.id === "database")?.state).toBe("unknown");
    expect(report.checks.find(c => c.id === "schema")?.state).toBe("unknown");
    expect(report.steps.find(s => s.id === "invoices")?.state).toBe("unknown");
    expect(report.lastSuccessAt).toBeNull();
  });
  it.each([null, { version: 2, syncIntervalSeconds: 300 }, { version: 1, syncIntervalSeconds: 86400 }])(
    "reports incompatible contract %j even when a database read succeeds", contract => {
      const report = buildInstallationReport({ ...empty, contract }, true);
      expect(report.checks.find(c => c.id === "schema")?.state).toBe("attention");
    });
  it("does not confuse present credentials with a successful connection", () => {
    const report = buildInstallationReport({ ...empty, integration: { status: "error", last_success_at: null } }, true);
    expect(report.checks.find(c => c.id === "qonto")?.state).toBe("attention");
    expect(report.steps.find(s => s.id === "bank")?.state).toBe("optional");
  });
});
