import { expect, test } from '@playwright/test';

test('renders worklane cards without obvious layout breakage', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Agent work, kept visible.' })).toBeVisible();
  await expect(page.getByRole('article').filter({ hasText: 'Active rollout' })).toBeVisible();
  await expect(page.getByText('Malformed')).toBeVisible();
  await expect(page.getByRole('article').filter({ hasText: 'Stale investigation' }).getByText('Stale').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`dashboard-${testInfo.project.name}.png`), fullPage: true });

  const firstCard = page.getByRole('article').filter({ hasText: 'Active rollout' }).first();
  const box = await firstCard.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(280);
  expect(box?.height ?? 0).toBeGreaterThan(180);
});

test('opens a lane detail page with timeline and raw JSON', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('article').filter({ hasText: 'Active rollout' }).getByRole('link', { name: 'Details' }).click();
  await expect(page.getByRole('heading', { name: 'Active rollout' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Raw JSON' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`detail-${testInfo.project.name}.png`), fullPage: true });
});
