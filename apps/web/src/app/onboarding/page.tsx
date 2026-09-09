import { redirect } from "next/navigation";

import { getOwnerUserId } from "@/lib/supabase/owner-settings";
import { createClient } from "@/lib/supabase/server";
import { onboardOwner } from "./actions";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if ((await getOwnerUserId()) !== null) {
    redirect("/dashboard");
  }

  return (
    <main className="auth-page">
      <section className="auth-card auth-card-wide" aria-labelledby="onboarding-title">
        <p className="eyebrow">Configuration initiale</p>
        <h1 id="onboarding-title">Préparer votre prévision de trésorerie</h1>
        <p className="auth-intro">
          Ces valeurs initialisent le propriétaire unique, le solde manuel et les catégories de
          départ dans une seule transaction.
        </p>
        <OnboardingForm action={onboardOwner} />
      </section>
    </main>
  );
}
