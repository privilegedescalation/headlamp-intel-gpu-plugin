import { test as setup, expect, Page } from '@playwright/test';

const AUTH_STATE_PATH = 'e2e/.auth/state.json';

async function authenticateWithOIDC(page: Page, username: string, password: string): Promise<void> {
  // Navigate to login — Headlamp redirects / to /c/main/login
  await page.goto('/');
  await page.waitForURL('**/login');

  // Click "Sign In" and capture the Authentik popup
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: /sign in/i }).click();
  const popup = await popupPromise;

  // Wait for the Authentik popup to fully load before interacting
  await popup.waitForLoadState('domcontentloaded');
  await popup.waitForLoadState('networkidle');

  // Authentik step 1: fill username — wait for the form to render
  const usernameField = popup.getByRole('textbox', { name: /email or username/i });
  await usernameField.waitFor({ state: 'visible', timeout: 15_000 });
  await usernameField.fill(username);
  await popup.getByRole('button', { name: /log in/i }).click();

  // Authentik step 2: fill password — wait for the next step to load
  await popup.waitForLoadState('networkidle');
  const passwordField = popup.getByRole('textbox', { name: /password/i });
  await passwordField.waitFor({ state: 'visible', timeout: 15_000 });
  await passwordField.fill(password);
  await popup.getByRole('button', { name: /continue|log in/i }).click();

  // Wait for the popup to close (Authentik redirects back, Headlamp processes callback)
  await popup.waitForEvent('close', { timeout: 15_000 });

  // Original page should now be authenticated — wait for sidebar
  await expect(page.getByRole('navigation', { name: 'Navigation' })).toBeVisible({
    timeout: 15_000,
  });
}

async function authenticateWithToken(page: Page, token: string): Promise<void> {
  await page.goto('/');
  // Headlamp goes to /token directly when no OIDC is configured,
  // or through /login when OIDC is configured
  await page.waitForURL(/\/(login|token)$/);

  if (page.url().includes('/login')) {
    // OIDC login page — click "use a token" to reach token auth.
    // Wait explicitly before clicking so failures surface at 15 s
    // with a clear message rather than silently timing out at 60 s.
    const useTokenBtn = page.getByRole('button', { name: /use a token/i });
    await useTokenBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await useTokenBtn.click();
    await page.waitForURL('**/token');
  }

  // Fill the "ID token" field and submit
  await page.getByRole('textbox', { name: /id token/i }).fill(token);
  await page.getByRole('button', { name: /authenticate/i }).click();

  // Wait for the main UI to load
  await expect(page.getByRole('navigation', { name: 'Navigation' })).toBeVisible({
    timeout: 15_000,
  });
}

setup('authenticate with Headlamp', async ({ page }) => {
  const username = process.env.AUTHENTIK_USERNAME;
  const password = process.env.AUTHENTIK_PASSWORD;
  const token = process.env.HEADLAMP_TOKEN;

  if (username && password) {
    await authenticateWithOIDC(page, username, password);
  } else if (token) {
    await authenticateWithToken(page, token);
  } else {
    throw new Error(
      'Set AUTHENTIK_USERNAME + AUTHENTIK_PASSWORD for OIDC auth, or HEADLAMP_TOKEN for token auth'
    );
  }

  await page.context().storageState({ path: AUTH_STATE_PATH });
});
