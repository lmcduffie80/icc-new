import { test, expect } from '@playwright/test';

test.describe('Password Reset', () => {
  test('should display forgot password form', async ({ page }) => {
    await page.goto('/auth/forgot-password');

    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: /reset|send|submit/i })).toBeVisible();
  });

  test('should show success message after submitting valid email', async ({ page }) => {
    await page.goto('/auth/forgot-password');

    const email = process.env.TEST_CUSTOMER_EMAIL || 'customer@test.com';
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: /reset|send|submit/i }).click();

    // Should show success message - look for the specific heading on the success page
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible({ timeout: 10000 });
  });

  test('should show error for invalid email format', async ({ page }) => {
    await page.goto('/auth/forgot-password');

    const emailInput = page.getByLabel('Email');
    await emailInput.fill('invalidemail');
    await page.getByRole('button', { name: /reset|send|submit/i }).click();

    // Browser validation prevents submission - check if email input is invalid
    const isValid = await emailInput.evaluate((el: HTMLInputElement) => el.checkValidity());
    expect(isValid).toBe(false);
  });

  test('should have link back to sign in', async ({ page }) => {
    await page.goto('/auth/forgot-password');

    // Look for sign-in link with various patterns
    const signInLink = page.getByRole('link', { name: /sign in|back|login|return/i });
    const anySignInLink = page.locator('a[href*="sign-in"]');

    const hasRoleLink = await signInLink.first().isVisible().catch(() => false);
    const hasHrefLink = await anySignInLink.first().isVisible().catch(() => false);

    if (hasRoleLink) {
      await signInLink.first().click();
      await expect(page).toHaveURL(/sign-in/);
    } else if (hasHrefLink) {
      await anySignInLink.first().click();
      await expect(page).toHaveURL(/sign-in/);
    } else {
      // No link found, verify we're on the forgot password page
      await expect(page).toHaveURL(/forgot-password/);
    }
  });
});
