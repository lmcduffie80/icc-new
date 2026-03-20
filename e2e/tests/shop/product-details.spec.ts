import { test, expect } from '../../fixtures';

test.describe('Product Details', () => {
  // Helper to navigate to first product
  async function navigateToFirstProduct(page: import('@playwright/test').Page) {
    await page.goto('/shop');
    // Wait for products to load
    await page.locator('a[href^="/shop/"]').filter({ has: page.locator('h3') }).first().waitFor({ timeout: 15000 });
    // Click the first product
    await page.locator('a[href^="/shop/"]').filter({ has: page.locator('h3') }).first().click();
    // Wait for product page to load
    await page.waitForURL(/\/shop\/.+/);
  }

  test('should display product information', async ({ productDetailPage, page }) => {
    await navigateToFirstProduct(page);

    // Should show product name
    await expect(productDetailPage.productName).toBeVisible();
    const name = await productDetailPage.getProductName();
    expect(name.length).toBeGreaterThan(0);
  });

  test('should display product price', async ({ productDetailPage, page }) => {
    await navigateToFirstProduct(page);

    // Should show price
    await expect(productDetailPage.productPrice).toBeVisible();
    const price = await productDetailPage.getProductPrice();
    expect(price).toMatch(/\$[\d,]+\.?\d*/);
  });

  test('should have add to cart button', async ({ productDetailPage, page }) => {
    await navigateToFirstProduct(page);

    await expect(productDetailPage.addToCartButton).toBeVisible();
  });

  test('should add product to cart', async ({ page }) => {
    await navigateToFirstProduct(page);

    // Add to cart
    await page.getByRole('button', { name: /add to cart/i }).click();

    // Should show cart icon with count or a toast/notification
    await page.waitForTimeout(500);

    // Check cart button in header shows updated count (badge visible)
    const cartBadge = page.locator('button[aria-label="Cart"] span');
    const hasBadge = await cartBadge.isVisible().catch(() => false);

    // Or check for a toast notification
    const toast = page.getByText(/added to cart/i);
    const hasToast = await toast.isVisible().catch(() => false);

    expect(hasBadge || hasToast).toBeTruthy();
  });

  test('should show stock status', async ({ page }) => {
    await navigateToFirstProduct(page);

    // Should show either in stock or out of stock
    const stockStatus = page.getByText(/in stock|out of stock/i);
    await expect(stockStatus).toBeVisible();
  });

  test('should have back to shop link', async ({ page }) => {
    await navigateToFirstProduct(page);

    // Back link could be breadcrumb or explicit back link
    const backLink = page.getByRole('link', { name: /back.*shop|all products|shop/i }).or(
      page.locator('a[href="/shop"]')
    );
    await expect(backLink.first()).toBeVisible();

    await backLink.first().click();
    await expect(page).toHaveURL(/\/shop$/);
  });
});
