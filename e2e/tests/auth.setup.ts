import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../.auth/customer.json');

/**
 * Customer authentication setup.
 * Logs in as a test customer and saves the session for reuse.
 */
setup('authenticate as customer', async ({ page }) => {
  const email = process.env.TEST_CUSTOMER_EMAIL || 'customer@test.com';
  const password = process.env.TEST_CUSTOMER_PASSWORD || 'TestPassword123!';

  console.log(`Attempting customer login with email: ${email}`);

  // Navigate to sign-in page
  await page.goto('/auth/sign-in');

  // Fill in credentials - use flexible selectors
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);

  // Submit form - use exact match to avoid matching "Sign in with Passkey"
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // Wait for response
  await page.waitForTimeout(3000);

  // Check current URL
  const currentUrl = page.url();
  console.log(`Current URL after login attempt: ${currentUrl}`);

  // Check for any error messages
  const errorElement = page.locator('.text-red-600, .text-red-500, .text-destructive, [role="alert"]:not(#__next-route-announcer__)').first();
  if (await errorElement.isVisible().catch(() => false)) {
    const errorText = await errorElement.textContent();
    console.log(`Login error message: ${errorText}`);
  }

  // Wait for redirect away from sign-in page
  await expect(page).not.toHaveURL(/\/auth\/sign-in/, { timeout: 15000 });

  // Save the authentication state
  await page.context().storageState({ path: authFile });
});
