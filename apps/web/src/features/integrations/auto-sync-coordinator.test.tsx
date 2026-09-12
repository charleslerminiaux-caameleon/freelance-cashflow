import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }));
vi.mock("./auto-sync-action", () => ({ autoSyncQontoAction: mocks.action }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import { AutoSyncCoordinator, useAutoSyncStatus } from "./auto-sync-coordinator";
function Status() { const state = useAutoSyncStatus(); return <output>{state.phase}:{state.lastErrorCode}</output>; }
function mount() { return render(<AutoSyncCoordinator><Status /><input aria-label="draft" defaultValue="draft" /></AutoSyncCoordinator>); }
async function settle() { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); }
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); vi.setSystemTime(new Date("2026-09-12T00:00:00Z")); Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); mocks.action.mockResolvedValue({ status: "skipped" }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("defaults idle outside provider", () => { render(<Status />); expect(screen.getByText("idle:")).toBeTruthy(); });
it("checks only visible tabs on mount, focus, visibility and five minute interval", async () => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  mount(); await settle();
  fireEvent.focus(window); await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
  expect(mocks.action).not.toHaveBeenCalled();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  fireEvent(document, new Event("visibilitychange")); fireEvent.focus(window); await settle();
  expect(mocks.action).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(299_999); });
  expect(mocks.action).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(mocks.action).toHaveBeenCalledTimes(2);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("keeps single flight through rerenders and refreshes once only after publication", async () => {
  let resolve!: (result: {status: string}) => void;
  mocks.action.mockImplementation(() => new Promise(r => { resolve = r; }));
  const view = mount(); await settle();
  expect(screen.getByText("checking:")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("draft"), { target: { value: "unsaved" } });
  fireEvent.focus(window); await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
  view.rerender(<AutoSyncCoordinator><Status /><input aria-label="draft" defaultValue="draft" /></AutoSyncCoordinator>);
  expect(mocks.action).toHaveBeenCalledTimes(1);
  await act(async () => { resolve({ status: "synced" }); });
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("draft")).toHaveValue("unsaved");
  expect(screen.getByText("idle:")).toBeTruthy();
});
it("keeps errors stable and waits fifteen minutes before retry, including focus", async () => {
  mocks.action.mockResolvedValueOnce({ status: "error", code: "PROVIDER_AUTH_EXPIRED" });
  mount(); await settle();
  expect(screen.getByText("error:PROVIDER_AUTH_EXPIRED")).toBeTruthy();
  fireEvent.focus(window); await act(async () => { await vi.advanceTimersByTimeAsync(899_999); });
  expect(mocks.action).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(mocks.action).toHaveBeenCalledTimes(2);
  expect(screen.getByText("error:PROVIDER_AUTH_EXPIRED")).toBeTruthy();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("cleans up timers/listeners and ignores completion after unmount", async () => {
  let resolve!: (result: {status: string}) => void;
  mocks.action.mockImplementation(() => new Promise(r => { resolve = r; }));
  const view = mount(); await settle(); view.unmount();
  await act(async () => { resolve({ status: "synced" }); await vi.advanceTimersByTimeAsync(900_000); });
  fireEvent.focus(window); fireEvent(document, new Event("visibilitychange"));
  expect(mocks.action).toHaveBeenCalledTimes(1);
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("settles a single mount check under StrictMode effect replay", async () => {
  let resolve!: (result: {status: string}) => void;
  mocks.action.mockImplementation(() => new Promise(r => { resolve = r; }));
  render(<StrictMode><AutoSyncCoordinator><Status /></AutoSyncCoordinator></StrictMode>);
  await settle(); expect(mocks.action).toHaveBeenCalledTimes(1);
  await act(async () => { resolve({ status: "synced" }); });
  expect(screen.getByText("idle:")).toBeTruthy();
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});

it("clears an automatic error only when a skip proves a newer manual publication", async () => {
  const oldPublication = "2026-09-10T00:00:00Z";
  mocks.action.mockResolvedValueOnce({ status: "error", code: "PROVIDER_AUTH_EXPIRED" })
    .mockResolvedValueOnce({ status: "skipped", lastSuccessAt: oldPublication })
    .mockResolvedValueOnce({ status: "skipped", lastSuccessAt: "invalid" })
    .mockResolvedValueOnce({ status: "skipped", lastSuccessAt: "2026-09-12T00:00:00Z" });
  render(<AutoSyncCoordinator lastSuccessAt={oldPublication}><Status /></AutoSyncCoordinator>);
  await settle();
  await act(async () => { await vi.advanceTimersByTimeAsync(900_000); });
  expect(screen.getByText("error:PROVIDER_AUTH_EXPIRED")).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
  expect(screen.getByText("error:PROVIDER_AUTH_EXPIRED")).toBeTruthy();
  expect(mocks.refresh).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
  expect(screen.getByText("idle:")).toBeTruthy();
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});
it("accepts a strictly newer layout publication after a manual success without starting another check", async () => {
  mocks.action.mockResolvedValue({ status: "error", code: "PROVIDER_AUTH_EXPIRED" });
  const view = render(<AutoSyncCoordinator lastSuccessAt="2026-09-10T00:00:00Z"><Status /></AutoSyncCoordinator>);
  await settle();
  view.rerender(<AutoSyncCoordinator lastSuccessAt="2026-09-12T00:00:00Z"><Status /></AutoSyncCoordinator>);
  expect(screen.getByText("idle:")).toBeTruthy();
  expect(mocks.action).toHaveBeenCalledTimes(1);
});
