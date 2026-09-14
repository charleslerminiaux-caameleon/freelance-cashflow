import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createRecurringCalendar, canaries } from './qonto-fixtures.mjs';

// This entire journey runs only on the freshly created synthetic fixture owner.
// Explicit screenshots below are permitted here; automatic captures/traces/videos stay off.
if (process.env.E2E_STACK_PROJECT !== 'jalon-2-qonto-tests' || process.env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:56321' || process.env.E2E_QONTO_SCENARIO !== 'dashboard') throw new Error('Dedicated dashboard fixtures required');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const calendar = createRecurringCalendar(new Date(process.env.E2E_RECURRING_ANCHOR!));
test.use({ actionTimeout: 15000 });
async function safeWrite(result: PromiseLike<{ error: unknown }>) {
  if ((await result).error) throw new Error('Dedicated fixture write failed');
}
async function remove(page: Page, label: string) {
  await page.goto('/expenses');
  await page.getByRole('button', { name: `Supprimer la sortie ${label}`, exact: true }).click();
  await page.getByRole('button', { name: `Confirmer la suppression de la sortie ${label}`, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Sorties récurrentes', exact: true }).getByRole('article')).toHaveCount(0);
}
async function history(page: Page) {
  await page.goto('/cashflow');
  await page.getByRole('link', { name: 'Créer une charge récurrente', exact: true }).click();
  await expect(page).toHaveURL(/\/cashflow\/recurring\/[a-f0-9-]+$/);
}
async function readyDashboard(page: Page) {
  // The clock effect proves the newly navigated dashboard has hydrated before
  // another native onChange/GET submission is attempted.
  await expect(page.getByRole('button', { name: 'Solde Qonto · Synchronisé il y a moins de 24 h', exact: true })).toBeVisible({ timeout: 30000 });
}
async function settleChart(page: Page) {
  // Recharts animates SVG paths in JavaScript, outside screenshot's CSS animation control.
  await page.locator('.cashflow-chart svg').evaluate(async svg => {
    await new Promise<void>((resolve, reject) => {
      let previous = '';
      let stableSince = performance.now();
      const started = stableSince;
      const sample = () => {
        const now = performance.now();
        const current = [...svg.querySelectorAll('path')].map(path => path.getAttribute('d')).join('|');
        if (current !== previous) { previous = current; stableSince = now; }
        if (now - stableSince >= 300) resolve();
        else if (now - started > 5000) reject(new Error('Chart did not settle'));
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  });
}
async function publication(owner: string) {
  const result = await admin.from('integrations').select('last_success_at').eq('owner_user_id', owner).single();
  if (result.error) throw new Error('Dedicated publication unavailable');
  return result.data.last_success_at as string;
}

test('synthetic owner completes dashboard/history/category workflows, automatic RSC refresh and responsive accessible controls', async ({ page, context, browser }) => {
  test.setTimeout(240000);
  await context.route('**/*', route => ['http://127.0.0.1:3200', 'http://127.0.0.1:56321'].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
  await page.goto('/login');
  const login = page.locator('form').filter({ has: page.getByText('Connexion', { exact: true }) });
  await login.getByLabel('Adresse e-mail').fill('owner@example.test');
  await login.getByLabel('Mot de passe').fill(process.env.E2E_OWNER_PASSWORD!);
  await login.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: 'Préparer votre prévision de trésorerie' })).toBeVisible({ timeout: 30000 });
  await page.getByLabel('Solde d’ouverture').fill('1000,00');
  await page.getByLabel('Seuil de sécurité').fill('100,00');
  await page.getByRole('button', { name: 'Terminer la configuration' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const settings = await admin.from('app_settings').select('owner_user_id').single();
  if (settings.error) throw new Error('Dedicated synthetic owner unavailable');
  const owner = settings.data.owner_user_id;
  await safeWrite(admin.from('app_settings').update({ timezone: calendar.timezone }).eq('owner_user_id', owner));
  await page.goto('/integrations');
  await page.getByRole('button', { name: 'Synchroniser Qonto' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Synchronisation Qonto terminée.' })).toBeVisible({ timeout: 30000 });

  await history(page);
  const historyUrl = page.url();
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Créer la charge récurrente', exact: true }) });
  await expect(form.getByLabel('Libellé', { exact: true })).toHaveValue('Synthetic cloud subscription');
  await expect(form.getByLabel('Montant', { exact: true })).toHaveValue('10,00');
  await expect(form.getByLabel('Niveau de certitude')).toHaveValue('committed');
  const nextDate = await form.getByLabel('Première échéance').inputValue();
  expect(nextDate > calendar.today).toBe(true);
  await form.getByLabel('Libellé', { exact: true }).fill('Synthetic reviewed history');
  await form.getByLabel('Montant', { exact: true }).fill('15,00');
  await form.getByRole('button', { name: 'Créer une catégorie', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle catégorie' });
  await dialog.getByLabel('Nom de la nouvelle catégorie').fill('Synthetic services');
  await dialog.getByRole('button', { name: 'Ajouter la catégorie' }).click();
  await expect(dialog).toHaveCount(0);
  const categoryId = await form.getByLabel('Catégorie', { exact: true }).inputValue();
  expect(categoryId).not.toBe('');
  await expect(form.getByLabel('Libellé', { exact: true })).toHaveValue('Synthetic reviewed history');
  await expect(form.getByLabel('Montant', { exact: true })).toHaveValue('15,00');

  // Real automatic server action + router.refresh while an unsaved form is mounted.
  const before = await form.locator('[name=sourcePublication]').inputValue();
  await safeWrite(admin.from('integrations').update({ last_success_at: new Date(Date.now() - 25 * 3600000).toISOString(), last_auto_attempt_at: null }).eq('owner_user_id', owner));
  const autoResponse = page.waitForResponse(response => response.request().method() === 'POST' && Boolean(response.request().headers()['next-action']));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const autoBody = await (await autoResponse).text();
  expect(autoBody).toContain('synced');
  for (const marker of [...canaries, process.env.SUPABASE_SERVICE_ROLE_KEY!]) expect(autoBody.includes(marker), 'automatic action must not expose internal/provider secrets').toBe(false);
  await expect.poll(() => publication(owner), { timeout: 30000 }).not.toBe(before);
  await expect(form.locator('[name=sourcePublication]')).not.toHaveValue(before, { timeout: 30000 });
  await expect(form.getByLabel('Libellé', { exact: true })).toHaveValue('Synthetic reviewed history');
  await expect(form.getByLabel('Montant', { exact: true })).toHaveValue('15,00');
  await expect(form.getByLabel('Catégorie', { exact: true })).toHaveValue(categoryId);
  await form.getByRole('button', { name: 'Créer la charge récurrente', exact: true }).click();
  await expect(page.getByRole('link', { name: /^Ouvrir la charge(?: existante)?$/ })).toBeVisible();
  await page.getByRole('link', { name: /^Ouvrir la charge(?: existante)?$/ }).click();
  await expect(page.getByRole('region', { name: 'Sorties récurrentes', exact: true })).toContainText('Créée depuis Qonto');
  await expect(page.getByRole('region', { name: 'Sorties récurrentes', exact: true })).toContainText('Synthetic services');
  await remove(page, 'Synthetic reviewed history');
  await page.goto(historyUrl);
  await expect(page.getByRole('region', { name: 'Nouvelle charge depuis l’historique' }).getByRole('alert')).toContainText('recréation volontaire');
  await page.getByLabel('Recréer cette charge malgré la décision précédente').check();
  await page.getByRole('button', { name: 'Créer la charge récurrente', exact: true }).click();
  await expect(page.getByRole('link', { name: /^Ouvrir la charge(?: existante)?$/ })).toBeVisible();
  await remove(page, 'Synthetic cloud subscription');
  const creation = page.locator('details').filter({ has: page.getByText('Nouvelle sortie récurrente', { exact: true }) });
  if (await creation.getAttribute('open') === null) await creation.locator('summary').click();
  const manual = page.locator('form').filter({ has: page.getByRole('button', { name: 'Créer la sortie récurrente', exact: true }) });
  await manual.getByLabel('Libellé', { exact: true }).fill('Synthetic existing charge');
  await manual.getByLabel('Montant', { exact: true }).fill('18,00');
  await manual.getByLabel('Jour du mois', { exact: true }).fill('1');
  await manual.getByLabel('Début', { exact: true }).fill(nextDate);
  await manual.getByRole('button', { name: 'Créer la sortie récurrente', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Sorties récurrentes', exact: true })).toContainText('Synthetic existing charge');
  await page.goto(historyUrl);
  await page.getByLabel('Charge mensuelle existante', { exact: true }).selectOption({ label: 'Synthetic existing charge · 18,00 EUR' });
  await page.getByLabel('Recréer cette charge malgré la décision précédente').check();
  await page.getByRole('button', { name: 'Associer à la charge existante' }).click();
  await expect(page.getByRole('link', { name: /^Ouvrir la charge(?: existante)?$/ })).toBeVisible();
  await page.getByRole('link', { name: /^Ouvrir la charge(?: existante)?$/ }).click();
  await expect(page.getByRole('region', { name: 'Sorties récurrentes', exact: true }).getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Sorties récurrentes', exact: true })).toContainText('18,00');
  await page.goto(historyUrl);
  await expect(page.getByRole('link', { name: 'Trésorerie', exact: true }).filter({ visible: true })).toHaveAttribute('aria-current', 'page');

  await page.goto('/dashboard?horizon=90&scenario=committed&filters=1&invoices=1&expenses=1&signedOrders=1');
  await readyDashboard(page);
  await page.getByRole('radio', { name: 'Pipeline pondéré', exact: true }).check();
  await expect(page).toHaveURL(/scenario=probable/);
  await readyDashboard(page);
  await page.getByRole('checkbox', { name: 'Charges', exact: true }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Charges', exact: true })).not.toBeChecked();
  await expect(page).toHaveURL(url => !url.searchParams.has('expenses'));
  await readyDashboard(page);
  await page.getByRole('checkbox', { name: 'Charges', exact: true }).check();
  await expect(page).toHaveURL(/expenses=1/);
  await readyDashboard(page);
  const stableUrl = page.url();
  const previousPublication = await publication(owner);
  await safeWrite(admin.from('integrations').update({ last_success_at: new Date(Date.now() - 25 * 3600000).toISOString(), last_auto_attempt_at: null }).eq('owner_user_id', owner));
  await page.reload();
  await expect.poll(() => publication(owner), { timeout: 30000 }).not.toBe(previousPublication);
  const badge = page.getByRole('button', { name: 'Solde Qonto · Synchronisé il y a moins de 24 h', exact: true });
  await expect(badge).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveURL(stableUrl);
  await expect(page.getByRole('radio', { name: 'Pipeline pondéré', exact: true })).toBeChecked();
  await safeWrite(admin.from('bank_accounts').update({ current_balance_cents: 2345678 }).eq('owner_user_id', owner));
  await page.reload();
  await readyDashboard(page);
  // Regressions: tall KPI auto-margins and a two-row desktop strip pushed the
  // chart below the fold; money could split the currency onto a second line.
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.locator('.dashboard-kpi').evaluateAll(cards => cards.map(card => {
      const amount = card.querySelector('strong')!;
      const footer = amount.nextElementSibling!;
      return { height: card.getBoundingClientRect().height, gap: footer.getBoundingClientRect().top - amount.getBoundingClientRect().bottom };
    }));
    console.log('compact geometry', viewport, geometry, await page.evaluate(() => ({ height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth })));
    for (const card of geometry) expect.soft(card.gap, 'amount and footer stay adjacent').toBeLessThanOrEqual(12);
    expect.soft(await page.evaluate(() => document.documentElement.scrollHeight), 'complete desktop dashboard fits viewport').toBeLessThanOrEqual(viewport.height);
    await settleChart(page);
    await page.screenshot({ path: `/private/tmp/libra-compact-${viewport.width}.png`, fullPage: true, animations: 'disabled', style: 'nextjs-portal { visibility: hidden; }' });
  }
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('link', { name: 'Dashboard', exact: true }).filter({ visible: true })).toHaveAttribute('aria-current', 'page');
    const choices = page.locator('.scenario-controls fieldset').nth(1);
    const columns = await choices.evaluate(element => {
      const labels = [...element.querySelectorAll('label')];
      return labels.filter(label => Math.abs(label.getBoundingClientRect().top - labels[0]!.getBoundingClientRect().top) < 1).length;
    });
    await settleChart(page);
    await page.screenshot({ path: width === 390 ? "/private/tmp/libra-compact-390.png" : `/private/tmp/libra-dashboard-layout-${width}.png`, fullPage: true, animations: 'disabled', style: 'nextjs-portal { visibility: hidden; }' });
    expect(columns).toBe(width === 1440 ? 4 : width === 1024 ? 2 : 1);
    for (const element of await page.locator('.scenario-controls label, .qonto-badge').all()) {
      const box = await element.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width).toBe(true);
    }
    await badge.focus();
    const tooltip = page.getByRole('tooltip').filter({ hasText: 'Dernière synchronisation' });
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(calendar.timezone);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `/private/tmp/libra-dashboard-${width}.png`, fullPage: true, animations: 'disabled', style: 'nextjs-portal { visibility: hidden; }' });
    await badge.press('Escape');
    await expect(tooltip).toBeHidden();
    await badge.blur();
    await page.mouse.move(0, 0);
    await badge.hover();
    await tooltip.hover();
    await expect(tooltip).toBeVisible();
    await page.mouse.move(0, 0);
    for (const radio of await page.getByRole('radio').all()) {
      await radio.focus();
      const description = page.locator(`#${await radio.getAttribute('aria-describedby')}`);
      await expect(description).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await radio.press('Escape');
      await expect(description).toBeHidden();
      await radio.blur();
    }
  }
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: await context.storageState() });
  await touch.route('**/*', route => ['http://127.0.0.1:3200', 'http://127.0.0.1:56321'].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
  const touchPage = await touch.newPage();
  await touchPage.goto('http://127.0.0.1:3200/dashboard');
  const touchBadge = touchPage.getByRole('button', { name: 'Solde Qonto · Synchronisé il y a moins de 24 h', exact: true });
  await touchBadge.tap();
  await expect(touchPage.getByRole('tooltip').filter({ hasText: 'Dernière synchronisation' })).toBeVisible();
  await touchBadge.tap();
  await expect(touchPage.getByRole('tooltip').filter({ hasText: 'Dernière synchronisation' })).toBeHidden();
  await touchPage.goto(historyUrl);
  await expect(touchPage.getByRole('link', { name: 'Trésorerie', exact: true }).filter({ visible: true })).toHaveAttribute('aria-current', 'page');
  expect(await touchPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await touch.close();
  await safeWrite(admin.from('integrations').update({ status: 'error', last_error_code: 'PROVIDER_AUTH_EXPIRED' }).eq('owner_user_id', owner));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Solde Qonto · Échec de synchronisation', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Échec · Intégrations' })).toHaveAttribute('href', '/integrations');
  await page.screenshot({ path: '/private/tmp/libra-dashboard-error-390.png', fullPage: true, animations: 'disabled', style: 'nextjs-portal { visibility: hidden; }' });
  // Large positive/negative synthetic balances must stay complete on one line.
  for (const balance of [999999999999, -999999999999]) {
    await safeWrite(admin.from('bank_accounts').update({ current_balance_cents: balance }).eq('owner_user_id', owner));
    await page.reload();
    await expect(page.getByLabel('Indicateurs de trésorerie')).toContainText(/9.?999.?999.?999,99/);
    let desktopFontSize = 0;
    for (const width of [1440, 1366, 1024, 390, 320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.locator('.dashboard-kpi strong').evaluateAll(amounts => amounts.every(amount => {
        const range = document.createRange();
        range.selectNodeContents(amount.querySelector("span") ?? amount);
        const rects = [...range.getClientRects()];
        const card = amount.closest('article')!;
        const bounds = card.getBoundingClientRect();
        const style = getComputedStyle(card);
        return rects.length > 0 && rects.every(rect => Math.abs(rect.top - rects[0]!.top) < 1
          && rect.left >= bounds.left + parseFloat(style.paddingLeft) - 1
          && rect.right <= bounds.right - parseFloat(style.paddingRight) + 1);
      })), { message: 'every complete KPI value, including sign and euro, fits one line after resize' }).toBe(true);
      const fontSize = await page.locator('.dashboard-kpi-balance strong span').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      expect(fontSize, 'large amounts remain readable').toBeGreaterThanOrEqual(14);
      if (width === 1440 && !desktopFontSize) desktopFontSize = fontSize;
      else if (width === 1440) expect(fontSize).toBeCloseTo(desktopFontSize, 0);
      if (width === 390) await expect.poll(() => page.locator('.dashboard-kpi-balance strong span').evaluate(element => parseFloat(getComputedStyle(element).fontSize)), { message: 'amount grows again in a wider card' }).toBeGreaterThan(desktopFontSize);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (width === 390) {
        expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight), 'small windows scroll to preserve all content').toBe(true);
        await settleChart(page);
        await page.screenshot({ path: `/private/tmp/libra-compact-large-${balance < 0 ? "negative" : "positive"}-390.png`, fullPage: true, animations: 'disabled', style: 'nextjs-portal { visibility: hidden; }' });
      }
    }
  }
});
