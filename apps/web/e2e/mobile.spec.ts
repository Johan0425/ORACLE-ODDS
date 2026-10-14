import { expect, test } from '@playwright/test';
import { asAdult } from './helpers';

test.beforeEach(async ({ context }) => asAdult(context));

test('navegación móvil accesible', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Menú' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#mobile-nav').getByRole('link', { name: 'Oportunidades' }).click();
  await expect(page).toHaveURL(/best-bets/);
  await expect(page.getByTestId('value-bet-card').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('comparador en móvil usa tarjetas', async ({ page }) => {
  await page.goto('/odds-comparison');
  await expect(page.getByText('prom.').first()).toBeVisible();
});
