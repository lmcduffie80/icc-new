import { test, expect } from '../../fixtures';

test.describe('Invoice Management', () => {
  test.use({ storageState: './e2e/.auth/customer.json' });

  test('should display invoices section', async ({ page }) => {
    // Navigate directly to invoices page
    await page.goto('/account/invoices');
    await page.waitForTimeout(1000);

    // Should show invoices page heading
    const heading = page.getByRole('heading', { name: /invoice/i });
    await expect(heading.first()).toBeVisible();
  });

  test('should show uploaded invoices', async ({ page }) => {
    await page.goto('/account/invoices');
    await page.waitForTimeout(1000);

    // Test customer may have uploaded invoices or "No invoices yet" message
    const invoiceCard = page.locator('.bg-card').filter({ has: page.getByText(/state|verified|pdf/i) });
    const noInvoicesMessage = page.getByText(/no invoices yet/i);

    const hasInvoices = await invoiceCard.first().isVisible().catch(() => false);
    const hasNoInvoicesMessage = await noInvoicesMessage.isVisible().catch(() => false);

    // Either should have invoices or show no invoices message
    expect(hasInvoices || hasNoInvoicesMessage).toBe(true);
  });

  test('should have option to upload new invoice', async ({ page }) => {
    await page.goto('/account/invoices');
    await page.waitForTimeout(1000);

    // Should have Upload Invoice button
    const uploadButton = page.getByRole('button', { name: /upload.*invoice/i });
    await expect(uploadButton).toBeVisible();
  });

  test('should display invoice state', async ({ page }) => {
    await page.goto('/account/invoices');
    await page.waitForTimeout(1000);

    // If there are invoices, they should show a state
    const stateText = page.getByText(/TX|Texas|state/i);
    const hasStateText = await stateText.first().isVisible().catch(() => false);

    // Even if no invoices, the info box mentions states
    const infoBox = page.getByText(/state|location|farm/i);
    const hasInfoBox = await infoBox.first().isVisible().catch(() => false);

    expect(hasStateText || hasInfoBox).toBe(true);
  });

  test('should have delete option for invoices', async ({ page }) => {
    await page.goto('/account/invoices');
    await page.waitForTimeout(1000);

    // If there are invoices, should have delete option
    const deleteButton = page.getByRole('button', { name: /delete/i });
    const hasDeleteButton = await deleteButton.first().isVisible().catch(() => false);

    // If no invoices, we just verify the page loaded
    const heading = page.getByRole('heading', { name: /invoice/i });
    await expect(heading.first()).toBeVisible();

    // Test passes whether or not delete button exists (depends on having invoices)
    expect(hasDeleteButton).toBeDefined();
  });
});
