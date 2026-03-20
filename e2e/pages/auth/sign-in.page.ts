import { Page, Locator, expect } from '@playwright/test';

export class SignInPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly forgotPasswordLink: Locator;
  readonly signUpLink: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel(/email/i);
    this.passwordInput = page.getByLabel(/password/i);
    // Use exact match to avoid matching "Sign in with Passkey" button
    this.signInButton = page.getByRole('button', { name: 'Sign in', exact: true });
    this.forgotPasswordLink = page.getByRole('link', { name: /forgot password/i });
    this.signUpLink = page.getByRole('link', { name: /sign up|create one|create account/i });
    // Exclude the Next.js route announcer and match common error classes
    this.errorMessage = page.locator('.text-red-600, .text-red-500, .error-message, [data-testid="error-message"]');
  }

  async goto() {
    await this.page.goto('/auth/sign-in');
  }

  async signIn(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  async expectErrorMessage(message: string | RegExp) {
    await expect(this.errorMessage).toContainText(message);
  }

  async expectRedirectAfterLogin() {
    // After login, should redirect to account or shop
    await expect(this.page).toHaveURL(/\/(account|shop|\/)/);
  }
}
