import { expect, type Locator, type Page, test } from "@playwright/test";

const ownerEmail = "owner@example.test";

function isoDateFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formContaining(page: Page, text: string): Locator {
  return page.locator("form").filter({ has: page.getByText(text, { exact: true }) });
}

async function loginAsOwner(page: Page) {
  const password = process.env.E2E_OWNER_PASSWORD;
  if (!password) throw new Error("Le mot de passe E2E temporaire est absent.");

  await page.goto("/login");
  const form = formContaining(page, "Connexion");
  await form.getByLabel("Adresse e-mail").fill(ownerEmail);
  await form.getByLabel("Mot de passe").fill(password);
  await form.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Préparer votre prévision de trésorerie" })).toBeVisible();
}

async function completeOnboarding(
  page: Page,
  values: { openingBalance: string; safetyThreshold: string },
) {
  await page.getByLabel("Solde d’ouverture").fill(values.openingBalance);
  await page.getByLabel("Seuil de sécurité").fill(values.safetyThreshold);
  await page.getByRole("button", { name: "Terminer la configuration" }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/u);
}

async function createCustomer(page: Page, name: string) {
  await page.getByRole("link", { name: "Opportunités" }).click();
  const form = formContaining(page, "Créer le client");
  await form.getByLabel("Nom du client").fill(name);
  await form.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByRole("region", { name: "Clients" })).toContainText(name);
}

async function createOpportunity(
  page: Page,
  values: { name: string; amountHt: string; probability: string },
) {
  const form = formContaining(page, "Créer l’opportunité");
  await form.getByLabel("Client").selectOption({ label: "Atelier Bleu" });
  await form.getByLabel("Nom", { exact: true }).fill(values.name);
  await form.getByLabel("Montant HT").fill(values.amountHt);
  await form.getByLabel("Probabilité (%)").fill(values.probability);
  await form.getByLabel("Date de clôture prévue").fill(isoDateFromToday(7));
  await form.getByRole("button", { name: "Créer l’opportunité" }).click();
  await expect(page.getByRole("article").filter({ has: page.getByRole("heading", { name: values.name }) })).toBeVisible();
}

async function convertOpportunity(page: Page, name: string) {
  const opportunity = page.getByRole("article").filter({
    has: page.getByRole("heading", { name }),
  });
  await opportunity.getByRole("button", { name: "Convertir en commande" }).click();

  await page.getByRole("link", { name: "Commandes" }).click();
  const engagement = page.getByRole("link", { name: new RegExp(name, "u") });
  await expect(engagement).toBeVisible();
  await engagement.click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function addBillingSchedule(
  page: Page,
  values: { label: string; amountHt: string },
) {
  const form = formContaining(page, "Ajouter l’échéance");
  await form.getByLabel("Libellé").fill(values.label);
  await form.getByLabel("Date de facturation prévue").fill(isoDateFromToday(1));
  await form.getByLabel("Montant HT").fill(values.amountHt);
  await form.getByRole("button", { name: "Ajouter l’échéance" }).click();
  await expect(form.getByRole("status")).toHaveText("Échéance ajoutée.");
  await page.reload();
  await expect(page.getByRole("article").filter({ hasText: values.label })).toBeVisible();
}

async function createInvoice(
  page: Page,
  values: { number: string; amountHt: string; vat: string },
) {
  await page.getByRole("link", { name: "Facturation" }).click();
  const form = formContaining(page, "Créer la facture");
  await form
    .getByLabel("Échéance de commande (facultative)")
    .selectOption({ label: "Mission conseil · Acompte · Atelier Bleu" });
  await form.getByLabel("Numéro de facture").fill(values.number);
  await form.getByLabel("Montant HT").fill(values.amountHt);
  await form.getByLabel("TVA", { exact: true }).fill(values.vat);
  await form.getByRole("button", { name: "Créer la facture" }).click();
  await expect(page.getByRole("link", { name: new RegExp(values.number, "u") })).toBeVisible();
}

async function recordPayment(
  page: Page,
  values: { invoice: string; amount: string },
) {
  await page.getByRole("link", { name: new RegExp(values.invoice, "u") }).click();
  const form = formContaining(page, "Enregistrer le paiement");
  await form.getByLabel("Montant du paiement").fill(values.amount);
  await form.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText(/Facture soldée/u)).toBeVisible();
}

async function createRecurringExpense(
  page: Page,
  values: { label: string; amount: string; frequency: "monthly" },
) {
  await page.getByRole("link", { name: "Charges" }).click();
  const form = formContaining(page, "Créer la sortie récurrente");
  await form.getByLabel("Libellé").fill(values.label);
  await form.getByLabel("Type de sortie").selectOption("remuneration");
  await form.getByLabel("Montant").fill(values.amount);
  await form.getByLabel("Fréquence").selectOption(values.frequency);
  await form.getByRole("button", { name: "Créer la sortie récurrente" }).click();
  await expect(page.getByRole("article").filter({ has: page.getByRole("heading", { name: values.label }) })).toBeVisible();
}

test("owner completes the manual cashflow journey", async ({ page }) => {
  await loginAsOwner(page);
  await completeOnboarding(page, {
    openingBalance: "42380,00",
    safetyThreshold: "20000,00",
  });
  await createCustomer(page, "Atelier Bleu");
  await createOpportunity(page, {
    name: "Mission conseil",
    amountHt: "10000,00",
    probability: "80",
  });
  await convertOpportunity(page, "Mission conseil");
  await addBillingSchedule(page, { label: "Acompte", amountHt: "5000,00" });
  await createInvoice(page, {
    number: "F-2026-001",
    amountHt: "5000,00",
    vat: "1000,00",
  });
  await recordPayment(page, { invoice: "F-2026-001", amount: "6000,00" });
  await createRecurringExpense(page, {
    label: "Rémunération",
    amount: "3500,00",
    frequency: "monthly",
  });

  await page.getByRole("link", { name: "Dashboard" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: /Bonjour/u })).toBeVisible();
  await expect(page.getByText("Solde projeté")).toBeVisible();
  await expect(page.getByText("Runway")).toBeVisible();
  await expect(page.getByLabel("Indicateurs de trésorerie")).toContainText(/42.?380,00/u);
  await expect(page.getByLabel("Prochaines sorties")).toContainText("Rémunération");
});
