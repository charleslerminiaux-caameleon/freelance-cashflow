"use client";

type ProtectedAppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ProtectedAppError({ reset }: ProtectedAppErrorProps) {
  return (
    <section
      className="dashboard-panel route-error"
      role="alert"
      aria-labelledby="protected-app-error-title"
    >
      <p className="eyebrow">Incident temporaire</p>
      <h1 id="protected-app-error-title">Impossible d’afficher vos données</h1>
      <p>Vos données n’ont pas été modifiées. Vous pouvez relancer le chargement.</p>
      <button type="button" onClick={reset}>Réessayer</button>
    </section>
  );
}
