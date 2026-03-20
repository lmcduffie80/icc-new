import { test, expect } from '../../fixtures';

test.describe('Admin Dashboard', () => {
  test.use({ storageState: './e2e/.auth/admin.json' });

  test('should display admin dashboard', async ({ adminDashboardPage }) => {
    await adminDashboardPage.goto();
    await adminDashboardPage.expectDashboardVisible();
  });

  test('should show navigation menu', async ({ adminDashboardPage }) => {
    await adminDashboardPage.goto();

    await expect(adminDashboardPage.productsLink).toBeVisible();
    await expect(adminDashboardPage.ordersLink).toBeVisible();
    await expect(adminDashboardPage.usersLink).toBeVisible();
  });

  test('should display statistics', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForTimeout(1000);

    // Should show stat cards (Total Revenue, Total Orders, Total Products, Total Users)
    const statCards = page.locator('.rounded-xl').filter({ has: page.getByText(/total|revenue|orders|products|users/i) });
    const statsCount = await statCards.count();

    // Dashboard should have multiple stat cards
    expect(statsCount).toBeGreaterThanOrEqual(1);
  });

  test('should show recent orders', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForTimeout(1000);

    // Should show "Recent Orders" section
    const recentOrdersHeading = page.getByRole('heading', { name: /recent orders/i });
    const recentOrdersSection = page.getByText(/recent orders/i);

    const hasHeading = await recentOrdersHeading.isVisible().catch(() => false);
    const hasSection = await recentOrdersSection.first().isVisible().catch(() => false);

    expect(hasHeading || hasSection).toBe(true);
  });

  test('should have logout option', async ({ adminDashboardPage }) => {
    await adminDashboardPage.goto();

    await expect(adminDashboardPage.logoutButton).toBeVisible();
  });

  test('should logout successfully', async ({ adminDashboardPage, page }) => {
    await adminDashboardPage.goto();
    await adminDashboardPage.logout();

    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
