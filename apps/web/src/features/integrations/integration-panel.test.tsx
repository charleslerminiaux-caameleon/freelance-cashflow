import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { IntegrationPanel } from "./integration-panel";
const state = { id: "integration", status: "connected" as const, last_connection_succeeded: true, last_success_at: "2026-09-10T10:00:00Z", last_error_code: null };
it("distinguishes unconfigured, no attempt and Tiime awaiting access with direct API guide", () => {
 render(<IntegrationPanel configured={false} integration={null} action={vi.fn()} />);
 expect(screen.getByRole("button", { name: "Synchroniser Qonto" })).toBeDisabled(); expect(screen.getByText("Aucune tentative de connexion")).toBeInTheDocument();
 expect(screen.getByText("Demande API en attente")).toBeInTheDocument(); expect(screen.getByRole("link", { name: /guide Tiime/i })).toHaveAttribute("href", "https://support.tiime.fr/fr/articles/26240-proposez-vous-une-api"); expect(screen.getByRole("link", { name: /Comprendre l’accès API/ })).toHaveAttribute("href", "/integrations/setup#tiime"); expect(screen.getByRole("link", { name: /Gérer la connexion Qonto/ })).toHaveAttribute("href", "/integrations/setup#qonto"); expect(screen.getAllByRole("button")).toHaveLength(1);
});
it("shows independent last connection and sync failure without hiding published date", () => {
 render(<IntegrationPanel configured integration={{ ...state, status: "error", last_error_code: "DATABASE_ERROR" }} action={vi.fn()} />);
 expect(screen.getByText("Dernière connexion réussie")).toBeInTheDocument(); expect(screen.getByText(/2026-09-10/)).toBeInTheDocument(); expect(screen.getByText(/enregistrement.*Réessayez/i)).toBeInTheDocument();
});
it("prevents duplicate submits while pending", async () => {
 let done!: (value: {success: boolean; message: string}) => void;
 const action = vi.fn(() => new Promise<{success: boolean; message: string}>(resolve => { done = resolve; }));
 render(<IntegrationPanel configured integration={state} action={action} />);
 fireEvent.click(screen.getByRole("button", { name: "Synchroniser Qonto" }));
 expect(await screen.findByRole("button", { name: "Synchronisation en cours…" })).toBeDisabled();
 fireEvent.click(screen.getByRole("button", { name: "Synchronisation en cours…" })); expect(action).toHaveBeenCalledTimes(1);
 await act(async () => done({ success: true, message: "Synchronisation terminée." })); expect(screen.getByRole("status")).toHaveTextContent("Synchronisation terminée.");
});

it("allows retry of persisted syncing state so an expired database lease can recover", () => {render(<IntegrationPanel configured integration={{...state,status:"syncing"}} action={vi.fn()} />); expect(screen.getByRole("button",{name:"Synchroniser Qonto"})).toBeEnabled();});
it("distinguishes a failed last provider connection", () => {render(<IntegrationPanel configured integration={{...state,status:"error",last_connection_succeeded:false,last_error_code:"PROVIDER_UNAVAILABLE"}} action={vi.fn()} />); expect(screen.getByText("Dernière connexion échouée")).toBeInTheDocument();});

it("shows bank success separately from a failed recurring analysis", async () => {
 const action = vi.fn(async () => ({ success: true, message: "Synchronisation Qonto terminée.", analysisSuccess: false, analysisMessage: "Données Qonto actualisées, analyse des récurrences à relancer." }));
 render(<IntegrationPanel configured integration={state} action={action} />);

 fireEvent.click(screen.getByRole("button", { name: "Synchroniser Qonto" }));

 expect(await screen.findByRole("status")).toHaveTextContent("Synchronisation Qonto terminée.");
 expect(screen.getByRole("alert")).toHaveTextContent(/données Qonto actualisées.*analyse.*relancer/i);
});
