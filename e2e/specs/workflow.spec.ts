import path from 'path';
import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

/**
 * The core clinical loop, in no-AI mode: a technician registers a patient with a
 * recording, the worker converts it for the viewer, and the assigned doctor labels
 * it and writes the report by hand.
 *
 * One serial test rather than several: every step depends on the one before, and
 * splitting it would only re-create the same state three times.
 */

const EDF = path.join(__dirname, '..', 'fixtures', 'tiny.edf');
const PATIENT = `E2E Patient ${Date.now()}`;

test('technician uploads, doctor labels and reports', async ({ page }) => {
  test.setTimeout(180_000);

  // --- technician -------------------------------------------------------------
  await loginAs(page, 'technician');

  await page.getByRole('button', { name: 'Add Patient' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^name/i).fill(PATIENT);
  await dialog.getByLabel(/^phone/i).fill('+15550100');
  await dialog.getByLabel(/^age/i).fill('42');
  await dialog.getByRole('combobox', { name: /gender/i }).click();
  await page.getByRole('option', { name: 'Female' }).click();
  await dialog.getByRole('combobox', { name: /assign doctor/i }).click();
  await page.getByRole('option', { name: /David Chen/ }).click();
  await dialog.locator('input[type="file"]').setInputFiles(EDF);
  await expect(dialog.getByText('Selected: tiny.edf')).toBeVisible();
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText(PATIENT)).toBeVisible();

  await page.getByRole('button', { name: 'Logout' }).click();

  // --- doctor -----------------------------------------------------------------
  await loginAs(page, 'doctor');

  const row = page.locator('div', { has: page.getByText(PATIENT, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: /(create|edit) report/i }) })
    .last();
  await expect(row).toBeVisible();

  // preprocess_edf runs on the worker; with AI off the file then waits for a label.
  await expect(async () => {
    await page.reload();
    await expect(row.getByText('Needs Review')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 90_000, intervals: [2_000] });

  await row.getByRole('button', { name: 'Normal', exact: true }).click();
  await expect(row.getByText('Normal', { exact: true }).first()).toBeVisible();

  await row.getByRole('button', { name: /create report/i }).click();
  const form = page.getByRole('dialog');
  const factual = form.getByRole('textbox', { name: /factual report/i });
  await factual.fill('Posterior dominant rhythm 9 Hz. No epileptiform discharges.');
  await form.getByRole('button', { name: /save report/i }).click();

  await expect(page.getByText(/saved successfully/i).first()).toBeVisible({ timeout: 30_000 });

  // --- persisted --------------------------------------------------------------
  // A labelled patient with a report leaves the default "Pending Review" list.
  await page.reload();
  await page.getByRole('button', { name: 'Examined', exact: true }).click();
  await row.getByRole('button', { name: /edit report/i }).click();
  await expect(page.getByRole('dialog').getByRole('textbox', { name: /factual report/i }))
    .toHaveValue('Posterior dominant rhythm 9 Hz. No epileptiform discharges.');
});
