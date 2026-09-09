import { render, screen } from "@testing-library/react";

import { LoginForm } from "./login-form";

const idleAction = async () => ({ message: null });

it("offers sign-in without exposing account creation on an initialized instance", () => {
  render(
    <LoginForm
      allowSignUp={false}
      signInAction={idleAction}
      signUpAction={idleAction}
    />,
  );

  expect(screen.getByRole("button", { name: "Se connecter" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Créer le compte propriétaire" })).toBeNull();
});

it("offers first-account creation only while the instance has no owner", () => {
  render(
    <LoginForm allowSignUp signInAction={idleAction} signUpAction={idleAction} />,
  );

  expect(
    screen.getByRole("button", { name: "Créer le compte propriétaire" }),
  ).toBeInTheDocument();
});
