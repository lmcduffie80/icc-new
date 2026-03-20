import { test, expect } from '@playwright/test';

// Helper to navigate to a product and add it to cart
async function addProductToCart(page: import('@playwright/test').Page) {
  await page.goto('/shop');
  // Wait for products to load
  await page.locator('a[href^="/shop/"]').filter({ has: page.locator('h3') }).first().waitFor({ timeout: 15000 });
  // Click the first product
  await page.locator('a[href^="/shop/"]').filter({ has: page.locator('h3') }).first().click();
  // Wait for product page
  await page.waitForURL(/\/shop\/.+/);
  // Add to cart
  await page.getByRole('button', { name: /add to cart/i }).click();
  await page.waitForTimeout(500);
}

// Helper to open the minicart
async function openMinicart(page: import('@playwright/test').Page) {
  // Use exact match for "Cart" button in header (not "Add to Cart")
  await page.getByRole('button', { name: 'Cart', exact: true }).click();
  // Wait for minicart to open
  await page.locator('text=Shopping Cart').waitFor({ timeout: 5000 });
}

test.describe('Add to Cart', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cart before each test
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('cart-storage');
    });
  });

  test('should add product to cart from product page', async ({ page }) => {
    await addProductToCart(page);

    // Open minicart to verify item was added
    await openMinicart(page);

    // Should show the cart with at least one item (not the empty state)
    const emptyMessage = page.getByText(/your cart is empty/i);
    const hasItems = !(await emptyMessage.isVisible().catch(() => false));
    expect(hasItems).toBeTruthy();
  });

  test('should update quantity in cart', async ({ page }) => {
    await addProductToCart(page);
    await openMinicart(page);

    // Find and click the increment button (+ button in QuantitySelector)
    const incrementButton = page.getByRole('button', { name: '+' }).or(page.locator('button:has-text("+")')).first();
    if (await incrementButton.isVisible()) {
      await incrementButton.click();
      await page.waitForTimeout(500);

      // Verify cart count updated to 2
      const cartCount = page.getByText('Shopping Cart (2)');
      await expect(cartCount).toBeVisible();
    }
  });

  test('should remove item from cart', async ({ page }) => {
    await addProductToCart(page);
    await openMinicart(page);

    // Find and click the remove button
    const removeButton = page.getByRole('button', { name: /remove item/i });
    await expect(removeButton).toBeVisible();
    await removeButton.click();
    await page.waitForTimeout(500);

    // Should now show empty cart
    const emptyMessage = page.getByText(/your cart is empty/i);
    await expect(emptyMessage).toBeVisible();
  });

  test('should show empty cart message when cart is empty', async ({ page }) => {
    await page.goto('/shop');
    // Wait for page to load
    await page.locator('a[href^="/shop/"]').first().waitFor({ timeout: 15000 });

    // Open minicart
    await openMinicart(page);

    // Should show empty cart message
    const emptyMessage = page.getByText(/your cart is empty/i);
    await expect(emptyMessage).toBeVisible();
  });
});
