import { Page, Locator, expect } from '@playwright/test';

export class ProductDetailPage {
  readonly page: Page;
  readonly productName: Locator;
  readonly productPrice: Locator;
  readonly productDescription: Locator;
  readonly quantityInput: Locator;
  readonly addToCartButton: Locator;
  readonly inStockBadge: Locator;
  readonly outOfStockBadge: Locator;
  readonly backToShopLink: Locator;
  readonly browseProductsLink: Locator;
  readonly breadcrumbAllProducts: Locator;

  constructor(page: Page) {
    this.page = page;
    // Product name is an h1 element
    this.productName = page.locator('h1');
    // Price is displayed in the main section with $ prefix
    this.productPrice = page.getByText(/^\$[\d,]+\.?\d*/).first();
    // Description is in a paragraph below the product name
    this.productDescription = page.locator('section').first().locator('p').first();
    // Quantity selector
    this.quantityInput = page.getByLabel(/quantity/i);
    // Add to Cart button
    this.addToCartButton = page.getByRole('button', { name: /add to cart/i });
    // Stock badges
    this.inStockBadge = page.getByText('In Stock', { exact: true });
    this.outOfStockBadge = page.getByText('Out of Stock', { exact: true });
    // Back links - breadcrumb "All Products" or "Browse Products" button
    this.breadcrumbAllProducts = page.getByRole('link', { name: 'All Products' });
    this.browseProductsLink = page.getByRole('link', { name: 'Browse Products' });
    this.backToShopLink = this.breadcrumbAllProducts.or(this.browseProductsLink);
  }

  async goto(productId: string) {
    await this.page.goto(`/shop/${productId}`);
    await this.waitForPageLoad();
  }

  async waitForPageLoad() {
    // Wait for product name to be visible
    await expect(this.productName).toBeVisible({ timeout: 15000 });
  }

  async getProductName(): Promise<string> {
    return (await this.productName.textContent()) || '';
  }

  async getProductPrice(): Promise<string> {
    return (await this.productPrice.textContent()) || '';
  }

  async setQuantity(quantity: number) {
    await this.quantityInput.fill(String(quantity));
  }

  async addToCart() {
    await this.addToCartButton.click();
  }

  async expectAddedToCart() {
    // Button changes to "Added!" temporarily
    await expect(this.page.getByRole('button', { name: /added/i })).toBeVisible({ timeout: 5000 });
  }

  async expectInStock() {
    await expect(this.inStockBadge).toBeVisible();
  }

  async expectOutOfStock() {
    await expect(this.outOfStockBadge).toBeVisible();
    await expect(this.addToCartButton).toBeDisabled();
  }

  async goBackToShop() {
    await this.breadcrumbAllProducts.click();
  }
}
