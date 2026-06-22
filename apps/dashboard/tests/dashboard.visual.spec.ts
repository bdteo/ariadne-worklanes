import { expect, test } from '@playwright/test';

test('renders worklane cards without obvious layout breakage', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worklanes', exact: true })).toBeVisible();

  if (testInfo.project.name === 'mobile') {
    await expect(page.getByLabel('Group worklanes')).toHaveValue('cwd');
  } else {
    const groupDropdown = page.getByRole('button', { name: /Group worklanes: Group: CWD/ });
    await expect(groupDropdown).toBeVisible();
    await groupDropdown.click();
    await expect(page.getByRole('listbox', { name: 'Group worklanes' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'CWD' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
  }

  await expect(page.getByRole('heading', { name: '~/DevEnvs/Boris/Oss/ariadne-worklanes 2' })).toBeVisible();
  await expect(page.getByRole('article').filter({ hasText: 'Active rollout' })).toBeVisible();
  await expect(page.getByRole('article').filter({ hasText: 'Archived release' })).toHaveCount(0);
  await expect(page.getByRole('article').filter({ hasText: 'broken.json' }).getByText('Malformed', { exact: true })).toBeVisible();
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

test('syncs dashboard filters with the URL', async ({ page }, testInfo) => {
  await page.goto('/?status=archived&sort=title&q=release&compact=1');
  const filters = page.getByRole('group', { name: 'Filter worklanes' });

  await expect(filters.getByRole('button', { name: /Archived/ })).toHaveAttribute('aria-pressed', 'true');
  if (testInfo.project.name === 'mobile') {
    await expect(page.getByLabel('Sort worklanes')).toHaveValue('title');
  } else {
    await expect(page.getByRole('button', { name: /Sort worklanes: Title/ })).toBeVisible();
  }
  await expect(page.getByLabel('Search worklanes')).toHaveValue('release');
  await expect(page.getByLabel('Compact')).toBeChecked();
  await expect(page.getByRole('article').filter({ hasText: 'Archived release' })).toBeVisible();
  await expect(page.getByRole('article').filter({ hasText: 'Active rollout' })).toHaveCount(0);

  await filters.getByRole('button', { name: /All/ }).click();
  await expect(page).toHaveURL(/status=all/);

  if (testInfo.project.name === 'mobile') {
    await page.getByLabel('Sort worklanes').selectOption('progress');
  } else {
    await page.getByRole('button', { name: /Sort worklanes/ }).click();
    await page.getByRole('listbox', { name: 'Sort worklanes' }).getByRole('option', { name: 'Progress' }).click();
    await expect(page.getByRole('button', { name: /Sort worklanes: Progress/ })).toBeVisible();
  }
  await expect(page).toHaveURL(/sort=progress/);

  await page.getByLabel('Search worklanes').fill('Provider');
  await expect(page).toHaveURL(/q=Provider/);

  await page.getByLabel('Compact').uncheck();
  await expect(page).not.toHaveURL(/compact=1/);
});
