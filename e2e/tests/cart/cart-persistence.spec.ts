import { test, expect } from '@playwright/test';

// Helper to navigate to a product and add it to cart
async function addProductToCart(page: import('@playwright/test').Page) {
  await page.goto('/shop');
  await page.locator('a[href^="/shop/"]').filter({ has: page.locator('h3') }).first().waitFor({ timeout: 15000 });
  await page.locator('a[href^="/shop/"]').filter({ has: page.locator('h3') }).first().click();
  await page.waitForURL(/\/shop\/.+/);
  await page.getByRole('button', { name: /add to cart/i }).click();
  await page.waitForTimeout(500);
}

// Helper to open the minicart
async function openMinicart(page: import('@playwright/test').Page) {
  // Use exact match for "Cart" button in header (not "Add to Cart")
  await page.getByRole('button', { name: 'Cart', exact: true }).click();
  await page.locator('text=Shopping Cart').waitFor({ timeout: 5000 });
}

test.describe('Cart Persistence', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cart before each test
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('cart-storage');
    });
  });

  test('should persist cart items across page refresh', async ({ page }) => {
    // Add product to cart
    await addProductToCart(page);

    // Refresh the page
    await page.reload();

    // Open minicart to verify the item is still there
    await openMinicart(page);

    // Should not show empty cart message
    const emptyMessage = page.getByText(/your cart is empty/i);
    const isEmpty = await emptyMessage.isVisible().catch(() => false);
    expect(isEmpty).toBe(false);
  });

  test('should persist cart items across navigation', async ({ page }) => {
    // Add product to cart
    await addProductToCart(page);

    // Navigate to different pages
    await page.goto('/');
    await page.goto('/shop');

    // Open minicart to verify cart still has items
    await openMinicart(page);

    // Should not show empty cart message
    const emptyMessage = page.getByText(/your cart is empty/i);
    const isEmpty = await emptyMessage.isVisible().catch(() => false);
    expect(isEmpty).toBe(false);
  });

  test('should use localStorage for cart storage', async ({ page }) => {
    // Add product to cart
    await addProductToCart(page);

    // Check localStorage
    const cartData = await page.evaluate(() => {
      return localStorage.getItem('cart-storage');
    });

    expect(cartData).not.toBeNull();
    expect(cartData).toContain('items');
  });
});
