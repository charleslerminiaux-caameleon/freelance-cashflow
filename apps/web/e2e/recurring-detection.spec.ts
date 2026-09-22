import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createRecurringCalendar } from './qonto-fixtures.mjs';

test.use({ actionTimeout: 15000 });

const label = 'Synthetic cloud subscription';
async function sync(page: Page) {
  await page.goto('/integrations');
  await page.getByRole('button', { name: 'Synchroniser Qonto' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Synchronisation Qonto terminée.' })).toBeVisible({ timeout: 30000 });
}
async function analyze(page: Page) {
  await page.getByRole('button', { name: 'Analyser les transactions importées' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Analyse terminée :' })).toBeVisible({ timeout: 30000 });
}
async function reexamine(page: Page) {
  await page.getByText('Afficher les suggestions ignorées', { exact: true }).click();
  await page.getByRole('button', { name: `Réexaminer ${label}`, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Suggestions à réanalyser' })).toContainText(label);
  await expect(page.getByRole('button', { name: `Confirmer ${label}`, exact: true })).toHaveCount(0);
  await analyze(page);
}
async function remove(page: Page, expenseLabel: string) {
  await page.getByRole('button', { name: `Supprimer la sortie ${expenseLabel}`, exact: true }).click();
  await page.getByRole('button', { name: `Confirmer la suppression de la sortie ${expenseLabel}`, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Sorties récurrentes', exact: true }).getByRole('heading', { name: expenseLabel, exact: true })).toHaveCount(0);
}
async function createManual(page: Page, expenseLabel: string, date: string) {
  const creation = page.locator('details').filter({ has: page.getByText('Nouvelle sortie récurrente', { exact: true }) });
  if (await creation.getAttribute('open') === null) await creation.locator('summary').click();
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Créer la sortie récurrente', exact: true }) });
  await form.getByLabel('Libellé', { exact: true }).fill(expenseLabel);
  await form.getByLabel('Montant', { exact: true }).fill('10,00');
  await form.getByLabel('Jour du mois', { exact: true }).fill('1');
  await form.getByLabel('Début', { exact: true }).fill(date);
  await form.getByRole('button', { name: 'Créer la sortie récurrente', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Sorties récurrentes', exact: true })).toContainText(expenseLabel);
}

test('owner reviews, confirms, edits, deletes, reexamines, associates and handles stale/failed analysis', async ({ page, context }) => {
  test.setTimeout(180000);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['http://127.0.0.1:3200', 'http://127.0.0.1:56321'].includes(url.origin) ? route.continue() : route.abort();
  });
  await page.goto('/login');
  const login = page.locator('form').filter({ has: page.getByText('Connexion', { exact: true }) });
  await login.getByLabel('Adresse e-mail').fill('owner@example.test');
  await login.getByLabel('Mot de passe').fill(process.env.E2E_OWNER_PASSWORD!);
  await login.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: 'Préparer votre prévision de trésorerie' })).toBeVisible({ timeout: 30000 });
  await page.getByLabel('Solde d’ouverture').fill('1000,00');
  await page.getByLabel('Seuil de sécurité').fill('100,00');
  await page.getByRole('button', { name: 'Terminer la configuration' }).click();
  await expect(page).toHaveURL(/\/settings\/installation/);
  await page.getByRole('link', { name: 'Ouvrir le dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  // The preload shares this run anchor. Align SQL's owner business calendar
  // before any recurring import or projection, keeping the live DB clock intact.
  if (process.env.E2E_STACK_PROJECT !== 'jalon-2-qonto-tests' || process.env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:56321') throw new Error('Dedicated test database required');
  const calendar = createRecurringCalendar(new Date(process.env.E2E_RECURRING_ANCHOR!));
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const settings = await admin.from('app_settings').select('owner_user_id').single();
  if (settings.error) throw new Error('Dedicated owner unavailable');
  if ((await admin.from('app_settings').update({ timezone: calendar.timezone }).eq('owner_user_id', settings.data.owner_user_id)).error) throw new Error('Dedicated calendar unavailable');
  await sync(page);
  await page.goto('/expenses');
  const panel = page.getByRole('region', { name: 'Récurrences à confirmer', exact: true });
  await expect(panel).toContainText('Ces estimations n’ont aucun effet sur la trésorerie avant confirmation ou association.');
  await expect(panel.getByRole('heading', { name: label })).toBeVisible();
  await panel.getByText('3 paiements observés', { exact: true }).click();
  await expect(panel.locator('details ul li')).toHaveCount(3);
  await expect(panel.getByLabel(`Niveau de certitude pour ${label}`, { exact: true })).toHaveValue('committed');
  await expect(panel.getByLabel(`Catégorie pour ${label}`, { exact: true })).toHaveValue('');
  const nextDate = await panel.getByLabel(`Première échéance pour ${label}`, { exact: true }).inputValue();
  await page.goto('/cashflow?scenario=committed');
  const events = page.getByRole('table', { name: 'Événements de trésorerie' });
  await expect(events).not.toContainText(label);
  await expect(page.getByRole('region', { name: 'Point de départ de la projection' })).toContainText(/5.?000,00/);
  await page.goto('/expenses');
  // An actual second browser request publishes a newer source while this form stays open.
  const other = await context.newPage();
  await sync(other);
  await panel.getByRole('button', { name: `Confirmer ${label}`, exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Relancez l’analyse');
  await other.close();
  await analyze(page);
  await panel.getByLabel(`Libellé pour ${label}`, { exact: true }).fill('Synthetic reviewed expense');
  await panel.getByLabel(`Montant pour ${label}`, { exact: true }).fill('15,00');
  await panel.getByRole('button', { name: `Confirmer ${label}`, exact: true }).click();
  const expense = page.getByRole('region', { name: 'Sorties récurrentes', exact: true }).getByRole('article').filter({ has: page.getByRole('heading', { name: 'Synthetic reviewed expense', exact: true }) });
  await expect(expense).toContainText('Détectée depuis Qonto');
  await page.goto('/cashflow?scenario=committed');
  await expect(events).toContainText('Synthetic reviewed expense');
  await expect(events).toContainText('15,00');
  await page.goto('/expenses');
  await expense.getByText('Modifier', { exact: true }).click();
  await expense.getByLabel('Montant', { exact: true }).fill('17,00');
  await expense.getByLabel('Fréquence', { exact: true }).selectOption('quarterly');
  await expect(expense.getByRole('alert')).toContainText('uniquement aux charges mensuelles');
  await expense.getByLabel('Fréquence', { exact: true }).selectOption('monthly');
  await expense.getByRole('button', { name: 'Enregistrer la sortie' }).click();
  await expect(expense.locator('strong.money-value')).toContainText('17,00');
  await sync(page);
  await page.goto('/expenses');
  await expect(expense.locator('strong.money-value')).toContainText('17,00');
  await remove(page, 'Synthetic reviewed expense');
  await sync(page);
  await page.goto('/expenses');
  await expect(panel.getByRole('button', { name: `Confirmer ${label}`, exact: true })).toHaveCount(0);
  await page.goto('/cashflow?scenario=committed');
  await expect(events).not.toContainText('Synthetic reviewed expense');
  await page.goto('/expenses');
  await reexamine(page);
  await panel.getByRole('button', { name: `Ignorer ${label}`, exact: true }).click();
  await reexamine(page);
  await createManual(page, 'Synthetic existing charge', nextDate);
  await panel.getByLabel(`Charge mensuelle existante pour ${label}`, { exact: true }).selectOption({ label: 'Synthetic existing charge · 10,00 €' });
  await panel.getByRole('button', { name: `Associer ${label}`, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Sorties récurrentes', exact: true }).getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Sorties récurrentes', exact: true })).toContainText('Détectée depuis Qonto');
  await remove(page, 'Synthetic existing charge');
  await reexamine(page);
  await createManual(page, label, nextDate);
  await expect(panel).toContainText('Une charge mensuelle similaire existe');
  await panel.getByRole('button', { name: `Confirmer ${label}`, exact: true }).click();
  await expect(panel).toContainText('Associez-la ou confirmez explicitement');
  await panel.getByLabel('Créer quand même une nouvelle charge', { exact: true }).check();
  await panel.getByRole('button', { name: `Confirmer ${label}`, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Sorties récurrentes', exact: true }).getByRole('article')).toHaveCount(2);

  // Hold the real dedicated database lease to exercise bank-success/analysis-failure UI.
  if (process.env.E2E_STACK_PROJECT !== 'jalon-2-qonto-tests' || process.env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:56321') throw new Error('Dedicated test database required');
  const args = { p_owner_user_id: settings.data.owner_user_id, p_run_id: randomUUID() };
  if ((await admin.rpc('acquire_recurring_analysis', args)).error) throw new Error('Dedicated lease unavailable');
  let cleanupError: unknown;
  try {
    await sync(page);
    await expect(page.getByRole('region', { name: 'Qonto', exact: true }).getByRole('alert')).toContainText('analyse');
  } finally {
    cleanupError = (await admin.rpc('fail_recurring_analysis', { ...args, p_error_code: 'DATABASE_ERROR' })).error;
  }
  expect(cleanupError).toBeNull();
  await page.goto('/expenses');
  await expect(panel.getByRole('alert')).toContainText('Les suggestions précédentes restent disponibles');
  await analyze(page);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  const rendered = await page.locator('body').innerText();
  for (const marker of ['FAKE_QONTO_LOGIN_ACCEPTANCE_ONLY', 'FAKE_QONTO_SECRET_ACCEPTANCE_ONLY', 'SYNTHETIC_PRIVATE_LABEL_CANARY']) expect(rendered).not.toContain(marker);
});
