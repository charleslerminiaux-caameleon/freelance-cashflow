import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("./actions", () => ({ signOut: vi.fn() }));

import AccessDeniedPage from "./page";

it("lets a non-owner end the rejected session", () => {
  render(<AccessDeniedPage />);

  const button = screen.getByRole("button", { name: "Se déconnecter" });

  expect(button).toHaveAttribute("type", "submit");
  expect(button.closest("form")).not.toBeNull();
});
