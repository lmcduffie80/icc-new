import { Page, Locator, expect } from '@playwright/test';

export class AdminProductsPage {
  readonly page: Page;

  // Product list
  readonly productTable: Locator;
  readonly productRow: Locator;
  readonly addProductButton: Locator;
  readonly searchInput: Locator;

  // Product form
  readonly productNameInput: Locator;
  readonly productCategorySelect: Locator;
  readonly productPriceInput: Locator;
  readonly productDescriptionInput: Locator;
  readonly productStockToggle: Locator;
  readonly productInventoryInput: Locator;
  readonly saveProductButton: Locator;
  readonly cancelButton: Locator;
  readonly deleteProductButton: Locator;

  // Confirmation dialog
  readonly confirmDeleteButton: Locator;
  readonly cancelDeleteButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Product list
    this.productTable = page.locator('[data-testid="product-table"], table');
    this.productRow = page.locator('[data-testid="product-row"], tbody tr');
    this.addProductButton = page.getByRole('button', { name: /add product|new product/i });
    this.searchInput = page.getByPlaceholder(/search/i);

    // Product form
    this.productNameInput = page.getByLabel(/name/i);
    this.productCategorySelect = page.getByLabel(/category/i);
    this.productPriceInput = page.getByLabel(/price/i);
    this.productDescriptionInput = page.getByLabel(/description/i);
    this.productStockToggle = page.getByLabel(/in stock/i);
    this.productInventoryInput = page.getByLabel(/inventory|quantity/i);
    this.saveProductButton = page.getByRole('button', { name: /save|create|update/i });
    this.cancelButton = page.getByRole('button', { name: /cancel/i });
    this.deleteProductButton = page.getByRole('button', { name: /delete/i });

    // Confirmation dialog
    this.confirmDeleteButton = page.getByRole('button', { name: /confirm|yes|delete/i });
    this.cancelDeleteButton = page.getByRole('button', { name: /cancel|no/i });
  }

  async goto() {
    await this.page.goto('/admin/products');
  }

  async getProductCount(): Promise<number> {
    return this.productRow.count();
  }

  async clickAddProduct() {
    await this.addProductButton.click();
  }

  async fillProductForm(product: {
    name: string;
    category: string;
    price: number;
    description?: string;
    inStock?: boolean;
    inventory?: number;
  }) {
    await this.productNameInput.fill(product.name);
    await this.productCategorySelect.selectOption(product.category);
    await this.productPriceInput.fill(String(product.price));
    if (product.description) {
      await this.productDescriptionInput.fill(product.description);
    }
    if (product.inStock !== undefined) {
      const isChecked = await this.productStockToggle.isChecked();
      if (isChecked !== product.inStock) {
        await this.productStockToggle.click();
      }
    }
    if (product.inventory !== undefined) {
      await this.productInventoryInput.fill(String(product.inventory));
    }
  }

  async saveProduct() {
    await this.saveProductButton.click();
  }

  async deleteProduct(productName: string) {
    await this.productRow.filter({ hasText: productName }).getByRole('button', { name: /delete/i }).click();
    await this.confirmDeleteButton.click();
  }

  async editProduct(productName: string) {
    await this.productRow.filter({ hasText: productName }).getByRole('button', { name: /edit/i }).click();
  }

  async searchProducts(query: string) {
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
  }

  async expectProductVisible(productName: string) {
    await expect(this.productRow.filter({ hasText: productName })).toBeVisible();
  }

  async expectProductNotVisible(productName: string) {
    await expect(this.productRow.filter({ hasText: productName })).toBeHidden();
  }
}
