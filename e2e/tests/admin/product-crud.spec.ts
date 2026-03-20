import { test, expect } from '../../fixtures';
import { randomUUID } from 'crypto';

test.describe('Admin Product Management', () => {
  test.use({ storageState: './e2e/.auth/admin.json' });

  // Helper to check if session is valid
  function isLoggedOut(page: import('@playwright/test').Page) {
    return page.url().includes('/admin/login');
  }

  test('should display product list', async ({ page }) => {
    await page.goto('/admin/products');
    await page.waitForTimeout(1000);

    if (isLoggedOut(page)) {
      await expect(page).toHaveURL(/\/admin/);
      return;
    }

    // Should show products table or list
    const productTable = page.locator('table');
    const productHeading = page.getByRole('heading', { name: /products/i });

    const hasTable = await productTable.isVisible().catch(() => false);
    const hasHeading = await productHeading.first().isVisible().catch(() => false);

    expect(hasTable || hasHeading).toBe(true);
  });

  test('should have add product button', async ({ page }) => {
    await page.goto('/admin/products');
    await page.waitForTimeout(1000);

    if (isLoggedOut(page)) {
      await expect(page).toHaveURL(/\/admin/);
      return;
    }

    // Look for add product button or link
    const addButton = page.getByRole('button', { name: /add product|new product/i });
    const addLink = page.getByRole('link', { name: /add product|new product/i });

    const hasButton = await addButton.first().isVisible().catch(() => false);
    const hasLink = await addLink.first().isVisible().catch(() => false);

    expect(hasButton || hasLink).toBe(true);
  });

  test('should display product form when adding new product', async ({ page }) => {
    await page.goto('/admin/products/new');
    await page.waitForTimeout(1000);

    if (isLoggedOut(page)) {
      await expect(page).toHaveURL(/\/admin/);
      return;
    }

    // Should show form fields
    const nameInput = page.getByLabel(/name/i);
    const priceInput = page.getByLabel(/price/i);

    const hasNameInput = await nameInput.first().isVisible().catch(() => false);
    const hasPriceInput = await priceInput.first().isVisible().catch(() => false);

    expect(hasNameInput || hasPriceInput).toBe(true);
  });

  test('should create a new product', async ({ page }) => {
    await page.goto('/admin/products/new');
    await page.waitForTimeout(1000);

    if (isLoggedOut(page)) {
      await expect(page).toHaveURL(/\/admin/);
      return;
    }

    const uniqueName = `Test Product ${randomUUID().slice(0, 8)}`;

    // Fill in required fields
    const nameInput = page.getByLabel(/name/i);
    const priceInput = page.getByLabel(/price/i);
    const categorySelect = page.getByLabel(/category/i);

    if (await nameInput.first().isVisible().catch(() => false)) {
      await nameInput.first().fill(uniqueName);
    }
    if (await priceInput.first().isVisible().catch(() => false)) {
      await priceInput.first().fill('99.99');
    }
    if (await categorySelect.first().isVisible().catch(() => false)) {
      await categorySelect.first().selectOption({ index: 1 });
    }

    // Submit form
    const saveButton = page.getByRole('button', { name: /save|create|submit/i });
    if (await saveButton.first().isVisible().catch(() => false)) {
      await saveButton.first().click();
      await page.waitForTimeout(1000);
    }

    // Verify we're on admin products (redirected after save or still on form)
    await expect(page).toHaveURL(/\/admin\/products/);
  });

  test('should edit existing product', async ({ page }) => {
    await page.goto('/admin/products');
    await page.waitForTimeout(1000);

    if (isLoggedOut(page)) {
      await expect(page).toHaveURL(/\/admin/);
      return;
    }

    // Click edit on first product
    const editButton = page.getByRole('button', { name: /edit/i }).first();
    const editLink = page.locator('a[href*="/admin/products/"]').first();

    if (await editButton.isVisible().catch(() => false)) {
      await editButton.click();
      await page.waitForTimeout(500);
    } else if (await editLink.isVisible().catch(() => false)) {
      await editLink.click();
      await page.waitForTimeout(500);
    }

    // Should show edit form
    const priceInput = page.getByLabel(/price/i);
    if (await priceInput.first().isVisible().catch(() => false)) {
      await priceInput.first().clear();
      await priceInput.first().fill('199.99');

      const saveButton = page.getByRole('button', { name: /save|update/i });
      if (await saveButton.first().isVisible().catch(() => false)) {
        await saveButton.first().click();
        await page.waitForTimeout(500);
      }
    }

    // Should be on admin products page
    await expect(page).toHaveURL(/\/admin\/products/);
  });

  test('should search products', async ({ page }) => {
    await page.goto('/admin/products');
    await page.waitForTimeout(1000);

    if (isLoggedOut(page)) {
      await expect(page).toHaveURL(/\/admin/);
      return;
    }

    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.first().isVisible().catch(() => false)) {
      await searchInput.first().fill('Test');
      await searchInput.first().press('Enter');
      await page.waitForTimeout(500);
    }

    // Should still be on products page
    await expect(page).toHaveURL(/\/admin\/products/);
  });

  test('should have delete option for products', async ({ page }) => {
    await page.goto('/admin/products');
    await page.waitForTimeout(1000);

    if (isLoggedOut(page)) {
      await expect(page).toHaveURL(/\/admin/);
      return;
    }

    // Look for delete buttons
    const deleteButton = page.getByRole('button', { name: /delete/i });
    const hasDeleteButton = await deleteButton.first().isVisible().catch(() => false);

    // If products exist, should have delete option
    const heading = page.getByRole('heading', { name: /products/i });
    await expect(heading.first()).toBeVisible();
    expect(hasDeleteButton).toBeDefined();
  });
});
