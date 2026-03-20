import { Page, Locator, expect } from '@playwright/test';

export class AccountPage {
  readonly page: Page;

  // Navigation
  readonly profileTab: Locator;
  readonly addressesTab: Locator;
  readonly ordersTab: Locator;
  readonly paymentMethodsTab: Locator;
  readonly invoicesTab: Locator;

  // Profile
  readonly profileName: Locator;
  readonly profileEmail: Locator;
  readonly editProfileButton: Locator;
  readonly saveProfileButton: Locator;

  // Addresses
  readonly addressList: Locator;
  readonly addAddressButton: Locator;
  readonly editAddressButton: Locator;
  readonly deleteAddressButton: Locator;

  // Orders
  readonly orderList: Locator;
  readonly orderCard: Locator;
  readonly viewOrderDetailsButton: Locator;

  // Payment Methods
  readonly paymentMethodList: Locator;
  readonly addPaymentMethodButton: Locator;
  readonly deletePaymentMethodButton: Locator;

  // Invoices
  readonly invoiceList: Locator;
  readonly uploadInvoiceButton: Locator;
  readonly deleteInvoiceButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Navigation
    this.profileTab = page.getByRole('tab', { name: /profile/i });
    this.addressesTab = page.getByRole('tab', { name: /address/i });
    this.ordersTab = page.getByRole('tab', { name: /order/i });
    this.paymentMethodsTab = page.getByRole('tab', { name: /payment/i });
    this.invoicesTab = page.getByRole('tab', { name: /invoice/i });

    // Profile
    this.profileName = page.locator('[data-testid="profile-name"]');
    this.profileEmail = page.locator('[data-testid="profile-email"]');
    this.editProfileButton = page.getByRole('button', { name: /edit profile/i });
    this.saveProfileButton = page.getByRole('button', { name: /save/i });

    // Addresses
    this.addressList = page.locator('[data-testid="address-list"]');
    this.addAddressButton = page.getByRole('button', { name: /add address/i });
    this.editAddressButton = page.getByRole('button', { name: /edit/i });
    this.deleteAddressButton = page.getByRole('button', { name: /delete/i });

    // Orders
    this.orderList = page.locator('[data-testid="order-list"]');
    this.orderCard = page.locator('[data-testid="order-card"]');
    this.viewOrderDetailsButton = page.getByRole('button', { name: /view details/i });

    // Payment Methods
    this.paymentMethodList = page.locator('[data-testid="payment-method-list"]');
    this.addPaymentMethodButton = page.getByRole('button', { name: /add.*payment|add.*card/i });
    this.deletePaymentMethodButton = page.getByRole('button', { name: /remove|delete/i });

    // Invoices
    this.invoiceList = page.locator('[data-testid="invoice-list"]');
    this.uploadInvoiceButton = page.getByRole('button', { name: /upload.*invoice/i });
    this.deleteInvoiceButton = page.getByRole('button', { name: /delete|remove/i });
  }

  async goto() {
    await this.page.goto('/account');
  }

  async navigateToProfile() {
    await this.profileTab.click();
  }

  async navigateToAddresses() {
    await this.addressesTab.click();
  }

  async navigateToOrders() {
    await this.ordersTab.click();
  }

  async navigateToPaymentMethods() {
    await this.paymentMethodsTab.click();
  }

  async navigateToInvoices() {
    await this.invoicesTab.click();
  }

  async getOrderCount(): Promise<number> {
    return this.orderCard.count();
  }

  async expectProfileVisible() {
    await expect(this.profileName).toBeVisible();
    await expect(this.profileEmail).toBeVisible();
  }

  async expectAddressCount(count: number) {
    const addresses = this.page.locator('[data-testid="address-card"]');
    await expect(addresses).toHaveCount(count);
  }
}
