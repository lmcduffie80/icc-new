import { test, expect } from '@playwright/test';

test.describe('Admin Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/login');
  });

  test('should display admin login form', async ({ page }) => {
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|login/i })).toBeVisible();
  });

  test('should login with valid admin credentials', async ({ page }) => {
    const email = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
    const password = process.env.TEST_ADMIN_PASSWORD || 'AdminTestPassword123!';

    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Should redirect to admin dashboard
    await expect(page).toHaveURL(/\/admin/, { timeout: 10000 });
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.getByLabel(/email/i).fill('invalid@admin.com');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in|login/i }).click();

    await expect(page.getByText(/invalid|incorrect|wrong|failed/i)).toBeVisible();
  });

  test('should show validation error for empty fields', async ({ page }) => {
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Look for validation error indicators - browser native validation or custom error messages
    // Use .first() since there may be multiple validation messages
    const hasValidation = await page.locator('[aria-invalid="true"], .text-red-500, [role="alert"]').first().isVisible().catch(() => false);
    expect(hasValidation || await page.getByLabel(/email/i).evaluate((el: HTMLInputElement) => !el.checkValidity())).toBeTruthy();
  });

  test('should not allow customer credentials on admin login', async ({ page }) => {
    // Customer credentials should not work on admin login
    const customerEmail = process.env.TEST_CUSTOMER_EMAIL || 'customer@test.com';
    const customerPassword = process.env.TEST_CUSTOMER_PASSWORD || 'TestPassword123!';

    await page.getByLabel(/email/i).fill(customerEmail);
    await page.getByLabel(/password/i).fill(customerPassword);
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Should show error, not redirect to admin
    await expect(page.getByText(/invalid|not found|unauthorized/i)).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
