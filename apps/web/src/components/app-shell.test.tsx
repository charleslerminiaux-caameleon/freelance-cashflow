import { render, screen, within } from "@testing-library/react";
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
