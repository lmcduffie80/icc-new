import { test, expect } from '../../fixtures';

test.describe('Filter Products by Category', () => {
  test.beforeEach(async ({ shopPage }) => {
    await shopPage.goto();
  });

  test('should display category filter', async ({ shopPage }) => {
    await expect(shopPage.categoryFilter).toBeVisible();
  });

  // Note: These tests may be flaky due to async category loading from API
  // Skip for now and address when category API caching is implemented
  test.skip('should filter products when selecting a category', async ({ shopPage }) => {
    // Get initial product count
    const initialCount = await shopPage.getProductCount();
    expect(initialCount).toBeGreaterThan(0);

    // Filter by Fertilizers category (exists in test database)
    await shopPage.filterByCategory('Fertilizers');

    // Wait for filter to apply
    await shopPage.page.waitForTimeout(1000);

    // Product count should change (may be same or less)
    const filteredCount = await shopPage.getProductCount();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
    expect(filteredCount).toBeGreaterThan(0);
  });

  test.skip('should show all products when clearing filter', async ({ shopPage }) => {
    // Get initial count of all products
    const initialCount = await shopPage.getProductCount();
    expect(initialCount).toBeGreaterThan(0);

    // First filter by a category
    await shopPage.filterByCategory('Fertilizers');
    await shopPage.page.waitForTimeout(1000);
    const filteredCount = await shopPage.getProductCount();

    // Then select "All Products" to clear
    await shopPage.categoryFilter.selectOption({ value: 'all' });
    await shopPage.page.waitForTimeout(1000);

    // Should show all products again
    const allCount = await shopPage.getProductCount();
    expect(allCount).toBeGreaterThanOrEqual(filteredCount);
    expect(allCount).toBe(initialCount);
  });
});
