import { expect, test } from "@playwright/test";

test("owner completes and revisits installation on desktop and mobile", async ({ page }, testInfo) => {
  await page.goto("/settings/installation");
  await expect(page).toHaveURL(/\/login/);
  const form = page.locator("form").filter({ has: page.getByText("Connexion", { exact: true }) });
  await form.getByLabel("Adresse e-mail").fill("owner@example.test");
  await form.getByLabel("Mot de passe").fill(process.env.E2E_OWNER_PASSWORD!);
  await form.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Préparer votre prévision de trésorerie" })).toBeVisible();
  await page.getByRole("button", { name: "Terminer la configuration" }).click();
  await expect(page.getByRole("heading", { name: "Installation et diagnostic" })).toBeVisible();
  await expect(page.getByText(/Le contrat du jalon 3 est disponible/)).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await expect(page.getByRole("link", { name: "Ouvrir le dashboard" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`libra-installation-${width}.png`), fullPage: true, animations: "disabled", style: "nextjs-portal { visibility: hidden; }" });
  }
  await page.getByRole("link", { name: "Ouvrir le dashboard" }).click();
  await page.goto("/settings");
  await page.getByRole("link", { name: "Installation et diagnostic" }).click();
  await expect(page.getByRole("heading", { name: "Votre parcours de démarrage" })).toBeVisible();
  const response = await page.request.get("/settings/installation");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});
