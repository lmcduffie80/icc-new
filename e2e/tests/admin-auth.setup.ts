import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../.auth/admin.json');

/**
 * Admin authentication setup.
 * Logs in as a test admin and saves the session for reuse.
 */
setup('authenticate as admin', async ({ page }) => {
  const email = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
  const password = process.env.TEST_ADMIN_PASSWORD || 'AdminTestPassword123!';

  console.log(`Attempting admin login with email: ${email}`);

  // Navigate to admin login page
  await page.goto('/admin/login');

  // Fill in credentials - use flexible selectors
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);

  // Submit form
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for response
  await page.waitForTimeout(3000);

  // Check current URL
  const currentUrl = page.url();
  console.log(`Current URL after admin login attempt: ${currentUrl}`);

  // Check for any error messages
  const errorElement = page.locator('.text-red-600, .text-red-500, .text-destructive, [role="alert"]:not(#__next-route-announcer__)').first();
  if (await errorElement.isVisible().catch(() => false)) {
    const errorText = await errorElement.textContent();
    console.log(`Admin login error message: ${errorText}`);
  }

  // Wait for redirect away from login page to admin dashboard
  await expect(page).not.toHaveURL(/\/admin\/login/, { timeout: 15000 });
  await expect(page).toHaveURL(/\/admin/, { timeout: 5000 });

  // Save the authentication state
  await page.context().storageState({ path: authFile });
});
