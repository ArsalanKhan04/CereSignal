import { expect, Page } from '@playwright/test';

/** Seeded by backend/scripts/seed_demo.py; every account's password is "password". */
export const ACCOUNTS = {
  admin: { username: 'admin', name: 'Sarah Mitchell' },
  technician: { username: 'tech', name: 'Jennifer Park' },
  doctor: { username: 'doc', name: 'David Chen' },
} as const;

export async function login(page: Page, username: string, password = 'password') {
  await page.goto('/#/');
  await page.getByLabel(/^username/i).fill(username);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole('button', { name: /^sign in/i }).click();
}

export async function loginAs(page: Page, role: keyof typeof ACCOUNTS) {
  await login(page, ACCOUNTS[role].username);
  await expect(page).toHaveURL(/#\/dashboard$/);
}
