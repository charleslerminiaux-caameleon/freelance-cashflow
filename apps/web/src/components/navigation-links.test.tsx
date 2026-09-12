import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const location = vi.hoisted(() => ({ pathname: "/invoices" }));
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname }));
import { NavigationLinks } from "./navigation-links";

it("keeps query filters out of the active section and follows a new pathname", () => {
  const {rerender} = render(<NavigationLinks />);
  window.history.replaceState(null, "", "/invoices?status=overdue");
  rerender(<NavigationLinks />);
  expect(screen.getByRole("link", {name: "Facturation"})).toHaveAttribute("aria-current", "page");
  location.pathname = "/expenses/edit";
  rerender(<NavigationLinks />);
  expect(screen.getByRole("link", {name: "Facturation"})).not.toHaveAttribute("aria-current");
  expect(screen.getByRole("link", {name: "Charges"})).toHaveAttribute("aria-current", "page");
  window.history.replaceState(null, "", "/");
});
