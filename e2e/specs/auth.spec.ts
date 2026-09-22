import { expect, test } from '@playwright/test';
import { ACCOUNTS, login, loginAs } from './helpers';

test.describe('login', () => {
  for (const role of ['admin', 'technician', 'doctor'] as const) {
    test(`the seeded ${role} lands on their dashboard`, async ({ page }) => {
      await loginAs(page, role);
      await expect(page.getByText(ACCOUNTS[role].name).first()).toBeVisible();
    });
  }

  test('a wrong password stays on the form and says so', async ({ page }) => {
    await login(page, 'doc', 'not-the-password');

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).not.toHaveURL(/dashboard/);
    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
  });
});

test.describe('session', () => {
  test('logout clears the token and the dashboard is closed again', async ({ page }) => {
    await loginAs(page, 'doctor');

    await page.getByRole('button', { name: 'Logout' }).click();

    await expect(page.getByLabel(/^username/i)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();

    await page.goto('/#/dashboard');
    await expect(page.getByLabel(/^username/i)).toBeVisible();
  });

  test('a signed-in doctor is kept out of dev-admin', async ({ page }) => {
    await loginAs(page, 'doctor');

    await page.goto('/#/dev-admin');

    await expect(page).toHaveURL(/#\/dashboard$/);
  });
});

test('an invalid patient portal link shows an error and signs nobody in', async ({ page }) => {
  await page.goto('/#/patient/portal/not-a-real-token');

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: /back to login/i })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
});
