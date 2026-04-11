import { test, expect } from '@playwright/test';

test.describe('Intel GPU plugin smoke tests', () => {
  test('sidebar contains intel-gpu entry', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.getByRole('navigation', { name: 'Navigation' });
    await expect(sidebar).toBeVisible({ timeout: 15_000 });
    await expect(sidebar.getByRole('button', { name: 'intel-gpu' })).toBeVisible();
  });

  test('sidebar intel-gpu entry is clickable and navigates to overview', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.getByRole('navigation', { name: 'Navigation' });
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    const gpuEntry = sidebar.getByRole('button', { name: 'intel-gpu' });
    await expect(gpuEntry).toBeVisible();
    await gpuEntry.click();

    // Should navigate to the overview route
    await expect(page).toHaveURL(/\/intel-gpu$/);
    await expect(page.getByRole('heading', { name: /intel.gpu/i })).toBeVisible();
  });

  test('overview page renders GPU device list or empty state', async ({ page }) => {
    await page.goto('/c/main/intel-gpu');

    // Overview heading should be present
    await expect(page.getByRole('heading', { name: /intel.gpu/i })).toBeVisible({
      timeout: 15_000,
    });

    // Either a populated table/list or an empty-state indicator must be visible
    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    const hasEmptyState = await page
      .locator('text=/no.*gpu|no.*device|0 node|empty/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasTable || hasEmptyState).toBe(true);
  });

  test('device plugins page renders or shows empty state', async ({ page }) => {
    await page.goto('/c/main/intel-gpu/device-plugins');

    await expect(page.getByRole('heading', { name: /Intel GPU — Device Plugins/i })).toBeVisible({
      timeout: 15_000,
    });

    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    const hasEmptyState = await page
      .locator('text=/no.*plugin|no.*device|empty/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasTable || hasEmptyState).toBe(true);
  });

  test('navigation between plugin views works', async ({ page }) => {
    // Headlamp sidebar child links only appear when already on a child route,
    // not after clicking the parent entry from the overview. Test route
    // accessibility via direct navigation — each route must render its heading.
    await page.goto('/c/main/intel-gpu');
    await expect(page.getByRole('heading', { name: /intel.gpu/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.goto('/c/main/intel-gpu/nodes');
    await expect(page.getByRole('heading', { name: /Intel GPU — Nodes/i })).toBeVisible({ timeout: 15_000 });

    await page.goto('/c/main/intel-gpu/pods');
    await expect(page.getByRole('heading', { name: /Intel GPU — Pods/i })).toBeVisible({ timeout: 15_000 });

    await page.goto('/c/main/intel-gpu/metrics');
    await expect(page.getByRole('heading', { name: /Intel GPU — Metrics/i })).toBeVisible({ timeout: 15_000 });
  });

  test('plugin settings page shows intel-gpu plugin entry', async ({ page }) => {
    await page.goto('/settings/plugins');

    // Wait for plugin list to load — plugin scripts load asynchronously
    const pluginEntry = page.locator('text=intel-gpu').first();
    await expect(pluginEntry).toBeVisible({ timeout: 30_000 });
  });
});
