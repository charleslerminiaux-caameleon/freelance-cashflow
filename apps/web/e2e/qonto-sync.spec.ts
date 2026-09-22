import { expect, test } from '@playwright/test';

test('owner synchronizes simulated Qonto and keeps published balances after a failure', async ({ page }) => {
  await page.goto('/login');
  const form = page.locator('form').filter({ has: page.getByText('Connexion', { exact: true }) });
  await form.getByLabel('Adresse e-mail').fill('owner@example.test');
  await form.getByLabel('Mot de passe').fill(process.env.E2E_OWNER_PASSWORD!);
  await form.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: 'Préparer votre prévision de trésorerie' })).toBeVisible({ timeout: 30000 });
  await page.getByLabel('Solde d’ouverture').fill('1000,00');
  await page.getByLabel('Seuil de sécurité').fill('100,00');
  await page.getByRole('button', { name: 'Terminer la configuration' }).click();
  await expect(page).toHaveURL(/\/settings\/installation/);
  await page.getByRole('link', { name: 'Ouvrir le dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/integrations');
  await expect(page.getByRole('region', { name: 'Tiime', exact: true })).toContainText('Accès API à obtenir');
  await expect(page.getByRole('region', { name: 'Tiime', exact: true }).getByRole('button')).toHaveCount(0);
  for (const name of ['Pennylane', 'Revolut Business', 'bunq']) {
    const card = page.getByRole('region', { name, exact: true });
    await expect(card.getByRole('button', { name: `Synchroniser ${name}` })).toBeDisabled();
    await expect(card.getByRole('link', { name: `Configurer ${name}` })).toHaveAttribute('href', /\/integrations\/setup#/);
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByRole('button', { name: 'Synchroniser Qonto' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Synchronisation Qonto terminée.' })).toBeVisible({ timeout: 30000 });
    await page.goto('/cashflow');
    await expect(page.getByRole('region', { name: 'Comptes bancaires' })).toContainText('Compte fictif 1');
    await expect(page.getByRole('region', { name: 'Point de départ de la projection' })).toContainText(/5.?000,00/);
    await expect(page.getByRole('table', { name: 'Historique bancaire' }).locator('tbody tr')).toHaveCount(4);
    await page.goto('/dashboard');
    await expect(page.getByLabel('Indicateurs de trésorerie')).toContainText(/5.?000,00/);
    await expect(page.getByLabel('Indicateurs de trésorerie').getByRole('button', { name: 'Solde Qonto · Synchronisé il y a moins de 5 min', exact: true })).toBeVisible();
    await page.goto('/integrations');
  }
  await page.getByRole('button', { name: 'Synchroniser Qonto' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 30000 });
  const rendered = await page.locator('body').innerText();
  for (const marker of ['FAKE_QONTO_LOGIN_ACCEPTANCE_ONLY', 'FAKE_QONTO_SECRET_ACCEPTANCE_ONLY', 'SYNTHETIC_PRIVATE_LABEL_CANARY']) expect(rendered.includes(marker)).toBe(false);
  await page.goto('/cashflow');
  await expect(page.getByRole('region', { name: 'Point de départ de la projection' })).toContainText(/5.?000,00/);
  await expect(page.getByRole('table', { name: 'Historique bancaire' }).locator('tbody tr')).toHaveCount(4);
});
