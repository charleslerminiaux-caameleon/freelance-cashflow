import { getOwnerUserId } from "@/lib/supabase/owner-settings";
import { signIn, signUp } from "./actions";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const ownerUserId = await getOwnerUserId();

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-brand">
          <img src="/logo-green.png" alt="" width="48" height="48" />
          <div>
            <p className="eyebrow">Freelance Cashflow</p>
            <h1 id="login-title">Accéder à votre trésorerie</h1>
          </div>
        </div>
        <p className="auth-intro">
          Cette installation est conçue pour un propriétaire unique et ses données financières.
        </p>
        <LoginForm
          allowSignUp={ownerUserId === null}
          signInAction={signIn}
          signUpAction={signUp}
        />
      </section>
    </main>
  );
}
