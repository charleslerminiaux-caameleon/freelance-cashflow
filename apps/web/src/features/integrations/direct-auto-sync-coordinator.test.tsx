import { StrictMode } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }));
vi.mock("./auto-sync-action", () => ({ autoSyncDirectAction: m.action }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
import { DirectAutoSyncCoordinator } from "./direct-auto-sync-coordinator";
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); m.action.mockResolvedValue({ status: "skipped" }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const settle = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); };
it("checks each configured direct source on mount and every five visible minutes", async () => {
  render(<DirectAutoSyncCoordinator providers={["revolut", "bunq", "pennylane"]}>Content</DirectAutoSyncCoordinator>); await settle();
  expect(m.action.mock.calls).toEqual([["revolut"], ["bunq"], ["pennylane"]]);
  await act(async () => { await vi.advanceTimersByTimeAsync(300_000); }); expect(m.action).toHaveBeenCalledTimes(6);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  fireEvent.focus(window); await act(async () => { await vi.advanceTimersByTimeAsync(300_000); }); expect(m.action).toHaveBeenCalledTimes(6);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  fireEvent(document, new Event("visibilitychange")); await settle(); expect(m.action).toHaveBeenCalledTimes(9);
});
it("keeps provider requests independent and single-flight across StrictMode and rerenders", async () => {
  let done!: (result: { status: string }) => void;
  m.action.mockImplementation(provider => provider === "bunq" ? new Promise(resolve => { done = resolve; }) : Promise.resolve({ status: "synced" }));
  const view = render(<StrictMode><DirectAutoSyncCoordinator providers={["bunq", "pennylane"]}>Content</DirectAutoSyncCoordinator></StrictMode>);
  await settle(); expect(m.action).toHaveBeenCalledTimes(2); expect(m.refresh).toHaveBeenCalledTimes(1);
  fireEvent.focus(window); await settle(); expect(m.action.mock.calls.filter(([provider]) => provider === "bunq")).toHaveLength(1);
  view.unmount(); await act(async () => { done({ status: "synced" }); });
  expect(vi.getTimerCount()).toBe(0); expect(m.refresh).toHaveBeenCalledTimes(2);
});
it("does no work for absent providers and refreshes error metadata without stopping other sources", async () => {
  const view = render(<DirectAutoSyncCoordinator providers={[]}>Content</DirectAutoSyncCoordinator>); await settle(); expect(m.action).not.toHaveBeenCalled();
  m.action.mockResolvedValueOnce({ status: "error" }).mockResolvedValueOnce({ status: "synced" });
  view.rerender(<DirectAutoSyncCoordinator providers={["bunq", "revolut"]}>Content</DirectAutoSyncCoordinator>); await settle();
  expect(m.action).toHaveBeenCalledTimes(2); expect(m.refresh).toHaveBeenCalledTimes(2);
});
