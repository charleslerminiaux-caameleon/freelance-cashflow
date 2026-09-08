import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ProtectedAppError from "./error";

describe("ProtectedAppError", () => {
  it("shows a safe accessible recovery action without exposing the error", () => {
    const reset = vi.fn();
    render(
      <ProtectedAppError
        error={new Error("private-diagnostic=do-not-render")}
        reset={reset}
      />,
    );

    expect(screen.getByRole("alert")).toHaveAccessibleName("Impossible d’afficher vos données");
    expect(screen.getByText(/incident temporaire/i)).toBeInTheDocument();
    expect(screen.queryByText(/private-diagnostic|do-not-render/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
