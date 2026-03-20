import { test, expect } from '../../fixtures';

test.describe('Browse Products', () => {
  test.beforeEach(async ({ shopPage }) => {
    await shopPage.goto();
  });

  test('should display product cards', async ({ shopPage }) => {
    const count = await shopPage.getProductCount();
    expect(count).toBeGreaterThan(0);
  });

  test('should show product details on each card', async ({ shopPage }) => {
    // Each product card should have name and price
    const firstCard = shopPage.productCards.first();
    await expect(firstCard).toBeVisible();

    // Should have a product name (h3 element)
    const productName = firstCard.locator('h3');
    await expect(productName).toBeVisible();

    // Should have a price (text containing $)
    const productPrice = firstCard.getByText(/\$/);
    await expect(productPrice.first()).toBeVisible();
  });

  test('should navigate to product detail when clicking a product', async ({ shopPage, page }) => {
    await shopPage.clickProduct(0);

    // Should navigate to product detail page
    await expect(page).toHaveURL(/\/shop\/.+/);
  });

  test('should show cart icon in header', async ({ page }) => {
    // Cart icon is a button with aria-label="Cart" that opens a minicart overlay
    const cartButton = page.getByRole('button', { name: /cart/i });
    await expect(cartButton).toBeVisible();
  });
});
