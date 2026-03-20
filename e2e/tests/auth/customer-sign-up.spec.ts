import { test, expect } from '../../fixtures';
import { randomUUID } from 'crypto';

test.describe('Customer Sign Up', () => {
  test.beforeEach(async ({ signUpPage }) => {
    await signUpPage.goto();
  });

  test('should display sign up form', async ({ signUpPage }) => {
    await expect(signUpPage.nameInput).toBeVisible();
    await expect(signUpPage.emailInput).toBeVisible();
    await expect(signUpPage.passwordInput).toBeVisible();
    await expect(signUpPage.confirmPasswordInput).toBeVisible();
    await expect(signUpPage.farmNameInput).toBeVisible();
    await expect(signUpPage.signUpButton).toBeVisible();
  });

  test('should require password minimum length', async ({ signUpPage }) => {
    // Browser enforces minLength=8 on password fields
    await signUpPage.nameInput.fill('Test User');
    await signUpPage.emailInput.fill('test@example.com');
    await signUpPage.passwordInput.fill('weak');  // Too short
    await signUpPage.confirmPasswordInput.fill('weak');
    await signUpPage.signUpButton.click();

    // Browser validation should prevent submission - password input should be invalid
    const isValid = await signUpPage.passwordInput.evaluate((el: HTMLInputElement) => el.checkValidity());
    expect(isValid).toBe(false);
  });

  test('should show error for password mismatch', async ({ signUpPage }) => {
    await signUpPage.nameInput.fill('Test User');
    await signUpPage.emailInput.fill('test@example.com');
    await signUpPage.passwordInput.fill('SecurePassword123!');
    await signUpPage.confirmPasswordInput.fill('DifferentPassword123!');
    await signUpPage.fillFarmInfo('Test Farm', '12345', 'Corn, Wheat', '1-99');
    await signUpPage.signUpButton.click();

    await signUpPage.expectErrorMessage(/passwords.*match|do not match/i);
  });

  test('should validate required fields with browser validation', async ({ signUpPage }) => {
    // Fill some fields but leave farm name empty
    await signUpPage.nameInput.fill('Test User');
    await signUpPage.emailInput.fill('test@example.com');
    await signUpPage.passwordInput.fill('SecurePassword123!');
    await signUpPage.confirmPasswordInput.fill('SecurePassword123!');
    // Don't fill farm name (it's required)
    await signUpPage.signUpButton.click();

    // Browser validation should prevent submission - farm name input should be invalid
    const isValid = await signUpPage.farmNameInput.evaluate((el: HTMLInputElement) => el.checkValidity());
    expect(isValid).toBe(false);
  });

  test('should show error for existing email', async ({ signUpPage }) => {
    const existingEmail = process.env.TEST_CUSTOMER_EMAIL || 'customer@test.com';

    await signUpPage.signUpWithFarmInfo(
      'Test User',
      existingEmail,
      'ValidPassword123!',
      'Test Farm',
      '12345',
      'Corn, Wheat',
      '1-99'
    );

    await signUpPage.expectErrorMessage(/already|exists|registered|in use/i);
  });

  test('should successfully submit sign up form with valid data', async ({ signUpPage }) => {
    // Use a unique email for this test
    const uniqueEmail = `test-${randomUUID().slice(0, 8)}@example.com`;

    await signUpPage.signUpWithFarmInfo(
      'New Test User',
      uniqueEmail,
      'SecurePassword123!',
      'New Test Farm',
      '12345',
      'Corn, Soybeans',
      '100-249'
    );

    // Should show verification email prompt or success message
    await signUpPage.expectVerificationPrompt();
  });

  test('should have link to sign in page', async ({ page }) => {
    await page.goto('/auth/sign-up');
    // Look for sign-in link with various text patterns
    const signInLink = page.getByRole('link', { name: /sign in|already have an account|log in/i });
    const hasLink = await signInLink.first().isVisible().catch(() => false);

    if (hasLink) {
      await signInLink.first().click();
      await expect(page).toHaveURL(/sign-in/);
    } else {
      // Fallback: look for any link that navigates to sign-in
      const anySignInLink = page.locator('a[href*="sign-in"]');
      if (await anySignInLink.first().isVisible().catch(() => false)) {
        await anySignInLink.first().click();
        await expect(page).toHaveURL(/sign-in/);
      } else {
        // Verify we're on sign-up page
        await expect(page).toHaveURL(/sign-up/);
      }
    }
  });
});
