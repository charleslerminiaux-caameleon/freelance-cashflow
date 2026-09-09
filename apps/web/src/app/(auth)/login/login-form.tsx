"use client";

import { useActionState } from "react";

export type AuthActionState = { message: string | null };
export type AuthFormAction = (
  state: AuthActionState,
  formData: FormData,
) => Promise<AuthActionState>;

const initialState: AuthActionState = { message: null };

function CredentialsFields({ prefix }: { prefix: string }) {
  return (
    <>
      <label htmlFor={`${prefix}-email`}>Adresse e-mail</label>
      <input
        id={`${prefix}-email`}
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <label htmlFor={`${prefix}-password`}>Mot de passe</label>
      <input
        id={`${prefix}-password`}
        name="password"
        type="password"
        autoComplete={prefix === "signup" ? "new-password" : "current-password"}
        minLength={8}
        required
      />
    </>
  );
}

export function LoginForm({
  allowSignUp,
  signInAction,
  signUpAction,
}: {
  allowSignUp: boolean;
  signInAction: AuthFormAction;
  signUpAction: AuthFormAction;
}) {
  const [signInState, submitSignIn, signInPending] = useActionState(
    signInAction,
    initialState,
  );
  const [signUpState, submitSignUp, signUpPending] = useActionState(
    signUpAction,
    initialState,
  );

  return (
    <div className="auth-forms">
      <form action={submitSignIn} className="auth-form">
        <h2>Connexion</h2>
        <CredentialsFields prefix="signin" />
        {signInState.message ? <p role="alert">{signInState.message}</p> : null}
        <button type="submit" disabled={signInPending}>
          Se connecter
        </button>
      </form>

      {allowSignUp ? (
        <form action={submitSignUp} className="auth-form auth-form-secondary">
          <h2>Première installation</h2>
          <p>Créez le compte unique qui administrera cette instance.</p>
          <CredentialsFields prefix="signup" />
          {signUpState.message ? <p role="alert">{signUpState.message}</p> : null}
          <button type="submit" disabled={signUpPending}>
            Créer le compte propriétaire
          </button>
        </form>
      ) : null}
    </div>
  );
}
