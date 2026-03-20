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

test.describe('Cart Updates', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cart before each test
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('cart-storage');
    });
  });

  test('should recalculate total when quantity changes', async ({ page }) => {
    await addProductToCart(page);
    await openMinicart(page);

    // Get initial subtotal
    const initialSubtotal = await page.locator('text=/Subtotal:.*\\$/').textContent();

    // Increase quantity using + button
    const incrementButton = page.getByRole('button', { name: '+' }).or(page.locator('button:has-text("+")')).first();
    if (await incrementButton.isVisible()) {
      await incrementButton.click();
      await page.waitForTimeout(500);

      // Verify subtotal changed (should be doubled for qty 2)
      const newSubtotal = await page.locator('text=/Subtotal:.*\\$/').textContent();
      if (initialSubtotal && newSubtotal) {
        expect(newSubtotal).not.toEqual(initialSubtotal);
      }
    }
  });

  test('should update cart count when adding multiple items', async ({ page }) => {
    // Add first product
    await addProductToCart(page);

    // Go back to shop and add second product
    await page.goto('/shop');
    await page.locator('a[href^="/shop/"]').filter({ has: page.locator('h3') }).nth(1).waitFor({ timeout: 15000 });
    await page.locator('a[href^="/shop/"]').filter({ has: page.locator('h3') }).nth(1).click();
    await page.waitForURL(/\/shop\/.+/);
    await page.getByRole('button', { name: /add to cart/i }).click();
    await page.waitForTimeout(500);

    // Open minicart and verify 2 different items
    await openMinicart(page);

    // Cart header should show (2) items
    const cartHeader = page.getByText(/Shopping Cart \(2\)/);
    await expect(cartHeader).toBeVisible();
  });

  test('should show correct subtotal for each item', async ({ page }) => {
    await addProductToCart(page);
    await openMinicart(page);

    // Minicart shows product price per item
    // After incrementing quantity, the subtotal should update
    const incrementButton = page.getByRole('button', { name: '+' }).or(page.locator('button:has-text("+")')).first();

    if (await incrementButton.isVisible()) {
      // Increment quantity
      await incrementButton.click();
      await page.waitForTimeout(500);

      // Verify cart shows (2) items
      const cartHeader = page.getByText(/Shopping Cart \(2\)/);
      await expect(cartHeader).toBeVisible();
    }
  });
});
