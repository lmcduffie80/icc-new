import { Page, Locator, expect } from '@playwright/test';

export class AdminDashboardPage {
  readonly page: Page;

  // Navigation
  readonly dashboardLink: Locator;
  readonly productsLink: Locator;
  readonly ordersLink: Locator;
  readonly usersLink: Locator;
  readonly settingsLink: Locator;
  readonly logoutButton: Locator;

  // Dashboard stats
  readonly totalOrdersStat: Locator;
  readonly totalRevenueStat: Locator;
  readonly totalProductsStat: Locator;
  readonly totalUsersStat: Locator;

  // Recent orders
  readonly recentOrdersTable: Locator;
  readonly recentOrderRow: Locator;

  constructor(page: Page) {
    this.page = page;

    // Navigation
    this.dashboardLink = page.getByRole('link', { name: /dashboard/i });
    this.productsLink = page.getByRole('link', { name: /products/i });
    this.ordersLink = page.getByRole('link', { name: 'Orders', exact: true });
    this.usersLink = page.getByRole('link', { name: /users|customers/i });
    this.settingsLink = page.getByRole('link', { name: /settings/i });
    this.logoutButton = page.getByRole('button', { name: /logout|sign out/i });

    // Dashboard stats
    this.totalOrdersStat = page.locator('[data-testid="stat-orders"]');
    this.totalRevenueStat = page.locator('[data-testid="stat-revenue"]');
    this.totalProductsStat = page.locator('[data-testid="stat-products"]');
    this.totalUsersStat = page.locator('[data-testid="stat-users"]');

    // Recent orders
    this.recentOrdersTable = page.locator('[data-testid="recent-orders-table"]');
    this.recentOrderRow = page.locator('[data-testid="order-row"]');
  }

  async goto() {
    await this.page.goto('/admin');
  }

  async navigateToProducts() {
    await this.productsLink.click();
    await expect(this.page).toHaveURL(/\/admin\/products/);
  }

  async navigateToOrders() {
    await this.ordersLink.click();
    await expect(this.page).toHaveURL(/\/admin\/orders/);
  }

  async navigateToUsers() {
    await this.usersLink.click();
    await expect(this.page).toHaveURL(/\/admin\/users/);
  }

  async navigateToSettings() {
    await this.settingsLink.click();
    await expect(this.page).toHaveURL(/\/admin\/settings/);
  }

  async logout() {
    await this.logoutButton.click();
    await expect(this.page).toHaveURL(/\/admin\/login/);
  }

  async expectDashboardVisible() {
    await expect(this.page).toHaveURL(/\/admin/);
  }
}
