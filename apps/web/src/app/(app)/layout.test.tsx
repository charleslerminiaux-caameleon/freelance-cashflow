import {act, render, screen} from "@testing-library/react";
import {beforeEach, expect, it, vi} from "vitest";
const m=vi.hoisted(()=>({requireOwner:vi.fn(),createClient:vi.fn(),getQontoIntegration:vi.fn(),isQontoConfigured:vi.fn(),loadDirectConfig:vi.fn()}));
vi.mock("@/lib/auth/require-owner",()=>({requireOwner:m.requireOwner}));
vi.mock("@/lib/supabase/server",()=>({createClient:m.createClient}));
vi.mock("@/features/integrations/repository",()=>({getQontoIntegration:m.getQontoIntegration}));
vi.mock("@/features/integrations/qonto-config",()=>({isQontoConfigured:m.isQontoConfigured}));
vi.mock("next/navigation",()=>({usePathname:()=>"/dashboard",useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/features/integrations/auto-sync-action",()=>({autoSyncQontoAction:async()=>({status:"skipped"})}));
vi.mock("@/features/integrations/direct-config",()=>({loadDirectConfig:m.loadDirectConfig}));
import Layout from "./layout";
beforeEach(()=>{vi.clearAllMocks();m.loadDirectConfig.mockReturnValue(null);m.requireOwner.mockResolvedValue({userId:"owner"});m.createClient.mockResolvedValue({});m.isQontoConfigured.mockReturnValue(true);m.getQontoIntegration.mockResolvedValue({status:"connected",last_success_at:"2026-09-10T10:00:00Z"});});
it("loads owner integration state into the mobile shell",async()=>{const layout=await Layout({children:"Contenu"});await act(async()=>{render(layout);});expect(m.getQontoIntegration).toHaveBeenCalledWith({},"owner",expect.any(AbortSignal));expect(screen.getAllByText("Qonto : données synchronisées")).toHaveLength(1);});
it("guards reads before shell loading",async()=>{m.requireOwner.mockRejectedValue(new Error("redirect"));await expect(Layout({children:null})).rejects.toThrow("redirect");expect(m.createClient).not.toHaveBeenCalled();});
it("keeps diagnostic children accessible when integration metadata is unavailable", async () => {
  m.getQontoIntegration.mockRejectedValueOnce(new Error("DATABASE_ERROR private payload"));
  await act(async () => { render(await Layout({ children: <h1>Installation et diagnostic</h1> })); });
  expect(screen.getByRole("heading", { name: "Installation et diagnostic" })).toBeVisible();
  expect(screen.getAllByText("Qonto : état indisponible")).toHaveLength(1);
  expect(screen.queryByText(/private payload/)).not.toBeInTheDocument();
});
it("bounds a stalled integration read and aborts its request", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  m.getQontoIntegration.mockImplementationOnce((_client, _owner, requestSignal) => {
    signal = requestSignal; return new Promise(() => {});
  });
  try {
    const rendering = Layout({ children: "Diagnostic accessible" });
    await vi.advanceTimersByTimeAsync(5001);
    await act(async () => { render(await rendering); });
    expect(screen.getByText("Diagnostic accessible")).toBeVisible();
    expect(signal?.aborted).toBe(true);
  } finally { vi.useRealTimers(); }
});
