import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AutoSyncState } from "./auto-sync-policy";
const local = vi.hoisted(() => ({ state: { phase: "idle" } as AutoSyncState }));
vi.mock("./auto-sync-coordinator", () => ({ useAutoSyncStatus: () => local.state }));
import { QontoBadge } from "./qonto-badge";
const props = {lastSuccessAt: "2026-09-12T23:30:00Z", timezone: "Europe/Paris", lastAttemptFailed: false};
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T00:30:00Z")); local.state = {phase: "idle"}; });
afterEach(() => { vi.useRealTimers(); });

it("offers a local logo and keyboard/touch details in the owner's timezone", () => {
  const {container} = render(<QontoBadge {...props} />);
  const button = screen.getByRole("button", {name: /Synchronisé il y a moins de 24 h/});
  expect(screen.getByRole("img", {name: "Qonto"})).toHaveAttribute("src", "/qonto-logo.svg");
  expect(container).not.toHaveTextContent("2026-09-12T23:30:00Z");
  fireEvent.focus(button);
  expect(screen.getByRole("tooltip")).toHaveTextContent("13/09/2026 à 01:30");
  expect(button).toHaveAccessibleDescription(/Europe\/Paris/);
  fireEvent.keyDown(button, {key: "Escape"});
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.blur(button);
  fireEvent.click(button);
  expect(screen.getByRole("tooltip")).toBeVisible();
  fireEvent.click(button);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

it("does not call a recent publication from yesterday today", () => {
  vi.setSystemTime(new Date("2026-09-13T08:30:00Z"));
  render(<QontoBadge {...props} timezone="America/Los_Angeles" />);
  fireEvent.focus(screen.getByRole("button"));
  expect(screen.getByRole("tooltip")).toHaveTextContent("12/09/2026 à 16:30");
  expect(screen.getByRole("tooltip")).not.toHaveTextContent(/aujourd’hui|aujourd'hui/);
});

it("loses its fresh status at the 24-hour boundary while mounted and cleans up its clock", () => {
  vi.setSystemTime(new Date("2026-09-13T23:29:59Z"));
  const {unmount} = render(<QontoBadge {...props} />);
  expect(screen.getByRole("button", {name: /Synchronisé il y a moins de 24 h/})).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByRole("button", {name: /Actualisation nécessaire/})).toBeInTheDocument();
  unmount(); expect(vi.getTimerCount()).toBe(0);
});

it.each(["invalid", "2026-09-14T00:00:00Z"])("never displays green for %s", (lastSuccessAt) => {
  render(<QontoBadge {...props} lastSuccessAt={lastSuccessAt} />);
  expect(screen.queryByRole("button", {name: /Synchronisé il y a moins de 24 h/})).not.toBeInTheDocument();
  fireEvent.focus(screen.getByRole("button"));
  expect(screen.getByRole("tooltip")).toHaveTextContent("Date de dernière synchronisation indisponible");
});

it.each(["checking", "syncing"] as const)("shows distinct %s progress without claiming freshness", (phase) => {
  local.state = {phase};
  render(<QontoBadge {...props} />);
  expect(screen.getByRole("button", {name: phase === "checking" ? /Vérification en cours/ : /Synchronisation en cours/})).toBeInTheDocument();
  expect(screen.queryByRole("button", {name: /Synchronisé il y a moins de 24 h/})).not.toBeInTheDocument();
});

it("uses persisted server syncing when another tab owns the refresh", () => {
  render(<QontoBadge {...props} syncInProgress />);
  expect(screen.getByRole("button", {name: /Synchronisation en cours/})).toBeInTheDocument();
  expect(screen.queryByRole("link", {name: /Intégrations/})).not.toBeInTheDocument();
});

it.each([true, false])("exposes failed refresh and Integrations for persisted failure %s", (persisted) => {
  if (!persisted) local.state = {phase: "error", lastErrorCode: "PROVIDER_AUTH_EXPIRED"};
  render(<QontoBadge {...props} lastAttemptFailed={persisted} />);
  expect(screen.getByRole("button", {name: /Échec de synchronisation/})).toBeInTheDocument();
  expect(screen.getByRole("link", {name: /Intégrations/})).toHaveAttribute("href", "/integrations");
});

it("preserves a known failure while checking again", () => {
  local.state = {phase: "checking", lastErrorCode: "PROVIDER_AUTH_EXPIRED"};
  render(<QontoBadge {...props} />);
  expect(screen.getByRole("button", {name: /Vérification en cours/})).toBeInTheDocument();
  expect(screen.getByRole("link", {name: /Intégrations/})).toBeInTheDocument();
});

it("shows an unconfigured state without a publication", () => {
  render(<QontoBadge {...props} lastSuccessAt={null} />);
  expect(screen.getByRole("button", {name: /Aucune synchronisation publiée/})).toBeInTheDocument();
});
