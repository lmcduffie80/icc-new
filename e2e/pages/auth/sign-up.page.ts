import { Page, Locator, expect } from '@playwright/test';

export class SignUpPage {
  readonly page: Page;
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly farmNameInput: Locator;
  readonly zipCodeInput: Locator;
  readonly cropTypesInput: Locator;
  readonly farmAcresSelect: Locator;
  readonly signUpButton: Locator;
  readonly signInLink: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    // Use "full name" to distinguish from "farm name"
    this.nameInput = page.getByLabel(/full name/i);
    this.emailInput = page.getByLabel(/email/i);
    this.passwordInput = page.getByLabel(/^password$/i);
    this.confirmPasswordInput = page.getByLabel(/confirm password/i);
    // Farm information fields
    this.farmNameInput = page.getByLabel(/farm name/i);
    this.zipCodeInput = page.getByLabel(/zip code/i);
    this.cropTypesInput = page.getByLabel(/type of crops/i);
    this.farmAcresSelect = page.getByLabel(/farm size/i);
    this.signUpButton = page.getByRole('button', { name: /sign up|create account/i });
    this.signInLink = page.getByRole('link', { name: /sign in|already have an account/i });
    // Exclude the Next.js route announcer and match common error classes
    this.errorMessage = page.locator('.text-red-600, .text-red-500, .error-message, [data-testid="error-message"]');
    this.successMessage = page.locator('.text-green-500, .success-message');
  }

  async goto() {
    await this.page.goto('/auth/sign-up');
  }

  async fillFarmInfo(farmName: string, zipCode: string, cropTypes: string, farmAcres: string) {
    await this.farmNameInput.fill(farmName);
    await this.zipCodeInput.fill(zipCode);
    await this.cropTypesInput.fill(cropTypes);
    await this.farmAcresSelect.selectOption(farmAcres);
  }

  async signUp(name: string, email: string, password: string, confirmPassword?: string) {
    await this.nameInput.fill(name);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.confirmPasswordInput.fill(confirmPassword || password);
    await this.signUpButton.click();
  }

  async signUpWithFarmInfo(
    name: string,
    email: string,
    password: string,
    farmName: string,
    zipCode: string,
    cropTypes: string,
    farmAcres: string
  ) {
    await this.nameInput.fill(name);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.confirmPasswordInput.fill(password);
    await this.fillFarmInfo(farmName, zipCode, cropTypes, farmAcres);
    await this.signUpButton.click();
  }

  async expectErrorMessage(message: string | RegExp) {
    await expect(this.errorMessage).toContainText(message);
  }

  async expectVerificationPrompt() {
    // After signup, should show verification email sent message
    await expect(this.page.getByText(/check your email/i)).toBeVisible();
  }
}
