import { Page, Locator, FrameLocator, expect } from '@playwright/test';

export class CheckoutPage {
  readonly page: Page;

  // Steps
  readonly invoiceStep: Locator;
  readonly addressStep: Locator;
  readonly paymentStep: Locator;
  readonly reviewStep: Locator;

  // Invoice step
  readonly uploadInvoiceButton: Locator;
  readonly invoiceFileInput: Locator;
  readonly invoiceStateSelect: Locator;
  readonly invoiceConfirmButton: Locator;

  // Address step
  readonly savedAddresses: Locator;
  readonly newAddressButton: Locator;
  readonly fullNameInput: Locator;
  readonly streetInput: Locator;
  readonly cityInput: Locator;
  readonly stateSelect: Locator;
  readonly zipCodeInput: Locator;
  readonly useAddressButton: Locator;

  // Payment step
  readonly savedPaymentMethods: Locator;
  readonly newPaymentButton: Locator;
  readonly cardNumberFrame: FrameLocator;
  readonly cardExpiryFrame: FrameLocator;
  readonly cardCvcFrame: FrameLocator;
  readonly continueToReviewButton: Locator;

  // Review step
  readonly orderSummary: Locator;
  readonly placeOrderButton: Locator;
  readonly orderTotal: Locator;

  // Success
  readonly orderConfirmation: Locator;
  readonly orderNumber: Locator;

  constructor(page: Page) {
    this.page = page;

    // Steps
    this.invoiceStep = page.locator('[data-step="invoice"]');
    this.addressStep = page.locator('[data-step="address"]');
    this.paymentStep = page.locator('[data-step="payment"]');
    this.reviewStep = page.locator('[data-step="review"]');

    // Invoice
    this.uploadInvoiceButton = page.getByRole('button', { name: /upload.*invoice/i });
    this.invoiceFileInput = page.locator('input[type="file"]');
    this.invoiceStateSelect = page.getByLabel(/state/i);
    this.invoiceConfirmButton = page.getByRole('button', { name: /confirm|continue/i });

    // Address
    this.savedAddresses = page.locator('[data-testid="saved-address"]');
    this.newAddressButton = page.getByRole('button', { name: /new address|add address/i });
    this.fullNameInput = page.getByLabel(/full name/i);
    this.streetInput = page.getByLabel(/street|address line/i);
    this.cityInput = page.getByLabel(/city/i);
    this.stateSelect = page.getByLabel(/state/i);
    this.zipCodeInput = page.getByLabel(/zip|postal/i);
    this.useAddressButton = page.getByRole('button', { name: /use.*address|continue/i });

    // Payment
    this.savedPaymentMethods = page.locator('[data-testid="saved-payment-method"]');
    this.newPaymentButton = page.getByRole('button', { name: /new.*card|add.*payment/i });
    this.cardNumberFrame = page.frameLocator('iframe[name*="card-number"]').first();
    this.cardExpiryFrame = page.frameLocator('iframe[name*="card-expiry"]').first();
    this.cardCvcFrame = page.frameLocator('iframe[name*="card-cvc"]').first();
    this.continueToReviewButton = page.getByRole('button', { name: /continue|review/i });

    // Review
    this.orderSummary = page.locator('[data-testid="order-summary"]');
    this.placeOrderButton = page.getByRole('button', { name: /place order|confirm order/i });
    this.orderTotal = page.locator('[data-testid="order-total"]');

    // Success
    this.orderConfirmation = page.getByText(/order confirmed|thank you/i);
    this.orderNumber = page.locator('[data-testid="order-number"]');
  }

  async goto() {
    await this.page.goto('/checkout');
  }

  async selectSavedAddress(label: string) {
    await this.page.getByText(label).click();
    await this.useAddressButton.click();
  }

  async fillNewAddress(address: {
    fullName: string;
    street: string;
    city: string;
    state: string;
    zipCode: string;
  }) {
    await this.newAddressButton.click();
    await this.fullNameInput.fill(address.fullName);
    await this.streetInput.fill(address.street);
    await this.cityInput.fill(address.city);
    await this.stateSelect.selectOption(address.state);
    await this.zipCodeInput.fill(address.zipCode);
  }

  async fillStripeCard(cardNumber: string, expiry: string, cvc: string) {
    // Fill Stripe card details in iframes
    const cardNumberInput = this.cardNumberFrame.locator('input[name="cardnumber"]');
    await cardNumberInput.fill(cardNumber);

    const expiryInput = this.cardExpiryFrame.locator('input[name="exp-date"]');
    await expiryInput.fill(expiry);

    const cvcInput = this.cardCvcFrame.locator('input[name="cvc"]');
    await cvcInput.fill(cvc);
  }

  async placeOrder() {
    await this.placeOrderButton.click();
  }

  async expectOrderConfirmation() {
    await expect(this.orderConfirmation).toBeVisible({ timeout: 30000 });
  }

  async getOrderNumber(): Promise<string> {
    return (await this.orderNumber.textContent()) || '';
  }
}
