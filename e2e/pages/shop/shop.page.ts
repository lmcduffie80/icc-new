import { Page, Locator, expect } from '@playwright/test';

export class ShopPage {
  readonly page: Page;
  readonly productCards: Locator;
  readonly categoryFilter: Locator;
  readonly sortDropdown: Locator;
  readonly clearFiltersButton: Locator;
  readonly loadingText: Locator;

  constructor(page: Page) {
    this.page = page;
    // Product cards are Card components with links to individual product pages
    // They are wrapped in Links with href="/shop/{id}"
    this.productCards = page.locator('a[href^="/shop/"]').filter({ has: page.locator('h3') });
    this.categoryFilter = page.locator('#category');
    this.sortDropdown = page.locator('#sort');
    this.clearFiltersButton = page.getByText('Clear Filters');
    this.loadingText = page.getByText('Loading products...');
  }

  async goto() {
    await this.page.goto('/shop');
    await this.waitForProductsToLoad();
  }

  async waitForProductsToLoad() {
    // Wait for loading to disappear and products to appear
    await expect(this.loadingText).toBeHidden({ timeout: 15000 }).catch(() => {});
    await expect(this.productCards.first()).toBeVisible({ timeout: 15000 });
  }

  async getProductCount(): Promise<number> {
    return this.productCards.count();
  }

  async clickProduct(index: number = 0) {
    await this.productCards.nth(index).click();
  }

  async clickProductByName(productName: string) {
    await this.page.getByRole('heading', { name: productName }).click();
  }

  async filterByCategory(category: string) {
    // Wait for categories to be loaded (more than just "All Products")
    await this.page.waitForFunction(
      () => {
        const select = document.querySelector('#category');
        return select && select.querySelectorAll('option').length > 1;
      },
      { timeout: 10000 }
    );
    // Use value selector (values are lowercase) - "all" for all products, otherwise lowercase category
    const value = category === 'All Products' ? 'all' : category.toLowerCase();
    await this.categoryFilter.selectOption(value);
    await this.page.waitForTimeout(500); // Wait for filter to apply
  }

  async sortBy(option: string) {
    await this.sortDropdown.selectOption({ label: option });
    await this.page.waitForTimeout(500);
  }

  async clearFilters() {
    if (await this.clearFiltersButton.isVisible()) {
      await this.clearFiltersButton.click();
      await this.page.waitForTimeout(500);
    }
  }

  async expectProductVisible(productName: string) {
    await expect(this.page.getByRole('heading', { name: productName })).toBeVisible();
  }

  async getFirstProductName(): Promise<string> {
    const firstCard = this.productCards.first();
    const heading = firstCard.locator('h3');
    return await heading.textContent() || '';
  }
}
