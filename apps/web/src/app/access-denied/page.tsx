import { signOut } from "./actions";

export default function AccessDeniedPage() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="access-denied-title">
        <p className="eyebrow">Accès refusé</p>
        <h1 id="access-denied-title">Cette instance appartient à un autre compte.</h1>
        <p className="auth-intro">
          Aucune donnée financière n’a été chargée. Utilisez le compte propriétaire configuré lors
          de l’installation.
        </p>
        <form action={signOut} className="auth-form">
          <button type="submit">Se déconnecter</button>
        </form>
      </section>
    </main>
  );
}
