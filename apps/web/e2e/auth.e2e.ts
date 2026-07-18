import { expect, test } from '@playwright/test';

/**
 * Auth flows (E11): a fresh registration lands on the "check your email" screen,
 * and a seeded, already-verified demo user can log in. Both run against the real
 * API, exercising register + login end-to-end.
 */
test('registration lands on the verify-email screen', async ({ page }) => {
  const email = `e2e-${Date.now()}@advault.test`;
  await page.goto('/auth/register');

  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('e2e-password-123');
  await page.getByLabel('Confirm password', { exact: true }).fill('e2e-password-123');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByText('We sent a verification link to')).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
});

test('a verified demo user can log in', async ({ page }) => {
  await page.goto('/auth/login');

  await page.getByLabel('Email', { exact: true }).fill('user@advault.dev');
  await page.getByLabel('Password', { exact: true }).fill('advault-dev-password');
  await page.getByRole('button', { name: 'Log in' }).click();

  // Redirected out of the auth area into the authenticated shell.
  await expect(page).not.toHaveURL(/\/auth\/login/);
  // The account entry point is only present when signed in.
  await expect(page.getByRole('link', { name: 'Account' }).first()).toBeVisible();
});
