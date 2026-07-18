import { expect, test } from '@playwright/test';

/**
 * Storefront browse flow (E11): guest opens the catalog, picks a product, and
 * sees the product detail with the E11 reviews block. No auth required — the
 * most robust smoke of the public shell.
 */
test('guest browses catalog → product → reviews block', async ({ page }) => {
  await page.goto('/catalog');

  // Product cards link to /product/:slug — open the first one.
  const firstProduct = page.locator('a[href^="/product/"]').first();
  await expect(firstProduct).toBeVisible();
  await firstProduct.click();

  await expect(page).toHaveURL(/\/product\//);
  // The E11 reviews section renders its heading (empty or populated).
  await expect(page.getByRole('heading', { name: 'Reviews' })).toBeVisible();
});

test('footer exposes the legal pages', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Terms of Service' }).first().click();
  await expect(page).toHaveURL(/\/legal\/terms/);
  await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
});
