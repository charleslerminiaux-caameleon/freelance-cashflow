import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
const location = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname }));
import { AppShell } from "./app-shell";

it("renders the Freelance Cashflow navigation", () => {
  render(
    <AppShell>
      <main>Contenu</main>
    </AppShell>,
  );

  const desktopNavigation = screen.getByRole("navigation", {
    name: "Sections de Freelance Cashflow",
  });

  expect(within(desktopNavigation).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
    "href",
    "/dashboard",
  );
  expect(within(desktopNavigation).getByRole("link", { name: "Opportunités" })).toBeInTheDocument();
  expect(screen.getByText("Freelance Cashflow")).toBeInTheDocument();
});

it("renders the validated destinations in the compact mobile navigation", () => {
  render(
    <AppShell>
      <main>Contenu</main>
    </AppShell>,
  );

  const mobileNavigation = screen.getByRole("navigation", { name: "Navigation mobile" });

  expect(within(mobileNavigation).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
    "href",
    "/dashboard",
  );
  expect(within(mobileNavigation).getByRole("link", { name: "Paramètres" })).toHaveAttribute(
    "href",
    "/settings",
  );
  expect(within(mobileNavigation).getAllByRole("link")).toHaveLength(8);
});

it("shows the same live integration status on mobile and desktop", () => {render(<AppShell syncStatus="Qonto : données synchronisées">Contenu</AppShell>); expect(screen.getAllByLabelText("État de synchronisation")).toHaveLength(2); for (const status of screen.getAllByLabelText("État de synchronisation")) expect(status).toHaveTextContent("Qonto : données synchronisées");});


it.each(["/invoices", "/invoices/invoice-id"])("marks %s active in desktop and mobile navigation", (pathname) => {
  location.pathname = pathname;
  render(<AppShell>Contenu</AppShell>);
  for (const label of ["Navigation mobile", "Sections de Freelance Cashflow"]) {
    const nav = within(screen.getByRole("navigation", {name: label}));
    expect(nav.getByRole("link", {name: "Facturation"})).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", {name: "Dashboard"})).not.toHaveAttribute("aria-current");
  }
});

it("does not confuse a similar route name with an invoice child", () => {
  location.pathname = "/invoices-extra";
  render(<AppShell>Contenu</AppShell>);
  for (const link of screen.getAllByRole("link", {name: "Facturation"})) expect(link).not.toHaveAttribute("aria-current");
});
