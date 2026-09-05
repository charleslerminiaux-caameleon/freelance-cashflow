import { render, screen } from "@testing-library/react";
import { AppShell } from "./app-shell";

it("renders the Freelance Cashflow navigation", () => {
  render(
    <AppShell>
      <main>Contenu</main>
    </AppShell>,
  );

  expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
  expect(screen.getByRole("link", { name: "Opportunités" })).toBeInTheDocument();
  expect(screen.getByText("Freelance Cashflow")).toBeInTheDocument();
});
