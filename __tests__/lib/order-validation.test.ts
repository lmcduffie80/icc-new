import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateOrder,
  validateShippingAddress,
  detectSuspiciousPatterns,
  calculateOrderTotals,
  reserveInventory,
} from '@/lib/order-validation';

// Mock the database
const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockRelease = vi.fn();

const mockPool = {
  query: mockQuery,
  connect: mockConnect,
};

// Mock client for transactions
const mockClient = {
  query: vi.fn(),
  release: mockRelease,
};

// Mock dependencies
vi.mock('@/lib/state-eligibility', () => ({
  isProductEligibleForState: vi.fn((approvedStates: string[] | null, state: string) => {
    if (!approvedStates || approvedStates.length === 0) return true;
    return approvedStates.includes(state);
  }),
}));

describe('Order Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });
  });

  describe('validateShippingAddress', () => {
    it('should validate a complete valid address', () => {
      const address = {
        firstName: 'John',
        lastName: 'Doe',
        line1: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
        country: 'US',
      };

      const result = validateShippingAddress(address);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject address with missing required fields', () => {
      const address = {
        firstName: 'John',
        // missing lastName, line1, city, state, zipCode
      };

      const result = validateShippingAddress(address);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject empty address', () => {
      const result = validateShippingAddress({});

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject null address', () => {
      const result = validateShippingAddress(null);

      expect(result.valid).toBe(false);
    });

    it('should accept address with optional line2', () => {
      const address = {
        firstName: 'John',
        lastName: 'Doe',
        line1: '123 Main St',
        line2: 'Apt 4B',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
        country: 'US',
      };

      const result = validateShippingAddress(address);

      expect(result.valid).toBe(true);
    });
  });

  describe('detectSuspiciousPatterns', () => {
    it('should detect unusually large order quantity', () => {
      const items = [
        { productId: 'prod-1', quantity: 150, price: 10, name: 'Product 1' },
      ];
      const address = { line1: '123 Main St', city: 'Test', state: 'CA' };

      const result = detectSuspiciousPatterns(items, address, 'user-123');

      expect(result.suspicious).toBe(true);
      expect(result.reasons).toContain('Unusually large order quantity: 150');
    });

    it('should detect unusually high order value', () => {
      const items = [
        { productId: 'prod-1', quantity: 10, price: 6000, name: 'Expensive Product' },
      ];
      const address = { line1: '123 Main St', city: 'Test', state: 'CA' };

      const result = detectSuspiciousPatterns(items, address, 'user-123');

      expect(result.suspicious).toBe(true);
      expect(result.reasons.some(r => r.includes('Unusually high order value'))).toBe(true);
    });

    it('should detect duplicate items', () => {
      const items = [
        { productId: 'prod-1', quantity: 1, price: 10, name: 'Product 1' },
        { productId: 'prod-1', quantity: 2, price: 10, name: 'Product 1' }, // duplicate
      ];
      const address = { line1: '123 Main St', city: 'Test', state: 'CA' };

      const result = detectSuspiciousPatterns(items, address, 'user-123');

      expect(result.suspicious).toBe(true);
      expect(result.reasons).toContain('Duplicate items in order');
    });

    it('should detect incomplete shipping address', () => {
      const items = [
        { productId: 'prod-1', quantity: 1, price: 10, name: 'Product 1' },
      ];
      const address = { line1: '123 Main St' }; // missing city and state

      const result = detectSuspiciousPatterns(items, address, 'user-123');

      expect(result.suspicious).toBe(true);
      expect(result.reasons).toContain('Incomplete shipping address');
    });

    it('should detect high-value guest checkout', () => {
      const items = [
        { productId: 'prod-1', quantity: 50, price: 30, name: 'Product 1' },
      ];
      const address = { line1: '123 Main St', city: 'Test', state: 'CA' };

      const result = detectSuspiciousPatterns(items, address); // no userId = guest

      expect(result.suspicious).toBe(true);
      expect(result.reasons).toContain('High-value guest checkout');
    });

    it('should not flag normal orders', () => {
      const items = [
        { productId: 'prod-1', quantity: 2, price: 25, name: 'Product 1' },
        { productId: 'prod-2', quantity: 1, price: 50, name: 'Product 2' },
      ];
      const address = { line1: '123 Main St', city: 'Test City', state: 'CA' };

      const result = detectSuspiciousPatterns(items, address, 'user-123');

      expect(result.suspicious).toBe(false);
      expect(result.reasons).toHaveLength(0);
    });

    it('should handle null address', () => {
      const items = [
        { productId: 'prod-1', quantity: 1, price: 10, name: 'Product 1' },
      ];

      const result = detectSuspiciousPatterns(items, null, 'user-123');

      expect(result.suspicious).toBe(true);
      expect(result.reasons).toContain('Incomplete shipping address');
    });
  });

  describe('calculateOrderTotals', () => {
    it('should calculate correct totals with tax and shipping', () => {
      const items = [
        { productId: 'prod-1', quantity: 2, price: 50, name: 'Product 1', actualPrice: 50, priceMatch: true, inventory: 10, inventoryAvailable: true },
        { productId: 'prod-2', quantity: 1, price: 100, name: 'Product 2', actualPrice: 100, priceMatch: true, inventory: 5, inventoryAvailable: true },
      ];

      const result = calculateOrderTotals(items, 15, 0.08);

      expect(result.subtotal).toBe(200);
      expect(result.tax).toBe(16); // 200 * 0.08
      expect(result.shipping).toBe(15);
      expect(result.total).toBe(231); // 200 + 16 + 15
    });

    it('should handle zero tax and shipping', () => {
      const items = [
        { productId: 'prod-1', quantity: 1, price: 100, name: 'Product 1', actualPrice: 100, priceMatch: true, inventory: 10, inventoryAvailable: true },
      ];

      const result = calculateOrderTotals(items);

      expect(result.subtotal).toBe(100);
      expect(result.tax).toBe(0);
      expect(result.shipping).toBe(0);
      expect(result.total).toBe(100);
    });

    it('should round to 2 decimal places', () => {
      const items = [
        { productId: 'prod-1', quantity: 3, price: 33.33, name: 'Product 1', actualPrice: 33.33, priceMatch: true, inventory: 10, inventoryAvailable: true },
      ];

      const result = calculateOrderTotals(items, 5.99, 0.0825);

      expect(result.subtotal).toBe(99.99);
      // Tax: 99.99 * 0.0825 = 8.249175 -> rounded to 8.25
      expect(result.tax).toBe(8.25);
      expect(result.shipping).toBe(5.99);
      // Total should be rounded properly
      expect(result.total).toBe(114.23);
    });

    it('should handle empty items array', () => {
      const result = calculateOrderTotals([], 10, 0.05);

      expect(result.subtotal).toBe(0);
      expect(result.tax).toBe(0);
      expect(result.shipping).toBe(10);
      expect(result.total).toBe(10);
    });
  });

  describe('validateOrder', () => {
    it('should validate order with matching prices and available inventory', async () => {
      const items = [
        { productId: 'prod-1', quantity: 2, price: 50, name: 'Product 1' },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'prod-1',
          name: 'Product 1',
          price: '50.00',
          inventory: 10,
          is_active: true,
          unit_of_measure: 'each',
          approved_states: null,
          restricted_use: false,
          next_available_quantity: null,
          next_available_date: null,
          minimum_order_qty: null,
        }],
      });

      const result = await validateOrder(mockPool as never, items, 100);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.priceMismatch).toBe(false);
      expect(result.serverTotal).toBe(100);
    });

    it('should detect price manipulation', async () => {
      const items = [
        { productId: 'prod-1', quantity: 2, price: 25, name: 'Product 1' }, // Client says $25
      ];

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'prod-1',
          name: 'Product 1',
          price: '50.00', // Server says $50
          inventory: 10,
          is_active: true,
          unit_of_measure: 'each',
          approved_states: null,
          restricted_use: false,
          next_available_quantity: null,
          next_available_date: null,
          minimum_order_qty: null,
        }],
      });

      const result = await validateOrder(mockPool as never, items, 50); // Client total $50

      expect(result.valid).toBe(false);
      expect(result.priceMismatch).toBe(true);
      expect(result.serverTotal).toBe(100); // Server calculates $100
      expect(result.errors.some(e => e.includes('Total price mismatch'))).toBe(true);
    });

    it('should handle product not found', async () => {
      const items = [
        { productId: 'nonexistent', quantity: 1, price: 10, name: 'Missing Product' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await validateOrder(mockPool as never, items, 10);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('not found'))).toBe(true);
    });

    it('should handle inactive products', async () => {
      const items = [
        { productId: 'prod-1', quantity: 1, price: 50, name: 'Inactive Product' },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'prod-1',
          name: 'Inactive Product',
          price: '50.00',
          inventory: 10,
          is_active: false, // Product not active
          unit_of_measure: 'each',
          approved_states: null,
          restricted_use: false,
          next_available_quantity: null,
          next_available_date: null,
          minimum_order_qty: null,
        }],
      });

      const result = await validateOrder(mockPool as never, items, 50);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('not available for purchase'))).toBe(true);
    });

    it('should warn about insufficient inventory', async () => {
      const items = [
        { productId: 'prod-1', quantity: 10, price: 50, name: 'Limited Product' },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'prod-1',
          name: 'Limited Product',
          price: '50.00',
          inventory: 5, // Only 5 available but ordered 10
          is_active: true,
          unit_of_measure: 'each',
          approved_states: null,
          restricted_use: false,
          next_available_quantity: null,
          next_available_date: null,
          minimum_order_qty: null,
        }],
      });

      const result = await validateOrder(mockPool as never, items, 500);

      expect(result.inventoryIssues).toBe(true);
      expect(result.warnings.some(w => w.includes('Partial inventory'))).toBe(true);
    });

    it('should check state eligibility', async () => {
      const items = [
        { productId: 'prod-1', quantity: 1, price: 50, name: 'State Restricted Product' },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'prod-1',
          name: 'State Restricted Product',
          price: '50.00',
          inventory: 10,
          is_active: true,
          unit_of_measure: 'each',
          approved_states: ['CA', 'NY', 'TX'], // Only approved in these states
          restricted_use: false,
          next_available_quantity: null,
          next_available_date: null,
          minimum_order_qty: null,
        }],
      });

      const result = await validateOrder(mockPool as never, items, 50, 'FL'); // Shipping to FL

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('not approved for sale in FL'))).toBe(true);
    });

    it('should detect restricted use products', async () => {
      const items = [
        { productId: 'prod-1', quantity: 1, price: 50, name: 'Restricted Product' },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'prod-1',
          name: 'Restricted Product',
          price: '50.00',
          inventory: 10,
          is_active: true,
          unit_of_measure: 'each',
          approved_states: null,
          restricted_use: true, // Restricted use product
          next_available_quantity: null,
          next_available_date: null,
          minimum_order_qty: null,
        }],
      });

      const result = await validateOrder(mockPool as never, items, 50);

      expect(result.hasRestrictedProducts).toBe(true);
    });

    it('should enforce minimum order quantity', async () => {
      const items = [
        { productId: 'prod-1', quantity: 5, price: 50, name: 'Bulk Product' },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'prod-1',
          name: 'Bulk Product',
          price: '50.00',
          inventory: 100,
          is_active: true,
          unit_of_measure: 'each',
          approved_states: null,
          restricted_use: false,
          next_available_quantity: null,
          next_available_date: null,
          minimum_order_qty: 10, // Minimum 10 required
        }],
      });

      const result = await validateOrder(mockPool as never, items, 250);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('minimum order quantity'))).toBe(true);
    });

    it('should allow mixed tote orders of 14', async () => {
      // Mixed tote order exception: total 14 totes across multiple items
      const items = [
        { productId: 'prod-1', quantity: 7, price: 50, name: 'Tote Product 1' },
        { productId: 'prod-2', quantity: 7, price: 60, name: 'Tote Product 2' },
      ];

      // First product query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'prod-1',
          name: 'Tote Product 1',
          price: '50.00',
          inventory: 100,
          is_active: true,
          unit_of_measure: 'tote',
          approved_states: null,
          restricted_use: false,
          next_available_quantity: null,
          next_available_date: null,
          minimum_order_qty: 14, // Normally requires 14, but mixed order exception
        }],
      });

      // Second product query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'prod-2',
          name: 'Tote Product 2',
          price: '60.00',
          inventory: 100,
          is_active: true,
          unit_of_measure: 'tote',
          approved_states: null,
          restricted_use: false,
          next_available_quantity: null,
          next_available_date: null,
          minimum_order_qty: 14, // Normally requires 14, but mixed order exception
        }],
      });

      // Total: 7 * 50 + 7 * 60 = 350 + 420 = 770
      const result = await validateOrder(mockPool as never, items, 770);

      // Mixed tote order of 14 should be allowed
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle database errors gracefully', async () => {
      const items = [
        { productId: 'prod-1', quantity: 1, price: 50, name: 'Product 1' },
      ];

      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      const result = await validateOrder(mockPool as never, items, 50);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Error validating product'))).toBe(true);
    });
  });

  describe('reserveInventory', () => {
    beforeEach(() => {
      mockClient.query.mockReset();
      mockConnect.mockResolvedValue(mockClient);
    });

    it('should reserve inventory successfully', async () => {
      const items = [
        { productId: 'prod-1', quantity: 2, price: 50, name: 'Product 1' },
      ];

      // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // SELECT for product check
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ inventory_count: 10, icc_available_quantity: 10, in_stock: true }],
      });
      // Check for warehouses
      mockClient.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // UPDATE inventory
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ inventory: 8, icc_available_quantity: 8 }],
      });
      // COMMIT
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await reserveInventory(mockPool as never, items);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should handle partial fulfillment', async () => {
      const items = [
        { productId: 'prod-1', quantity: 10, price: 50, name: 'Product 1' },
      ];

      // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // SELECT - only 3 available
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ inventory_count: 3, icc_available_quantity: 3, in_stock: true }],
      });
      // Check for warehouses
      mockClient.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // UPDATE
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ inventory: 0, icc_available_quantity: 0 }],
      });
      // COMMIT
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await reserveInventory(mockPool as never, items);

      expect(result.success).toBe(true);
      expect(result.partiallyFulfilled).toBe(true);
      expect(result.warnings.some(w => w.includes('Partial inventory reserved'))).toBe(true);
    });

    it('should rollback on error', async () => {
      const items = [
        { productId: 'prod-1', quantity: 2, price: 50, name: 'Product 1' },
      ];

      // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // SELECT throws error
      mockClient.query.mockRejectedValueOnce(new Error('Database error'));
      // ROLLBACK
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await reserveInventory(mockPool as never, items);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Inventory reservation failed'))).toBe(true);
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should skip ICC quantity deduction when flag is set', async () => {
      const items = [
        { productId: 'prod-1', quantity: 2, price: 50, name: 'Product 1' },
      ];

      // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // SELECT
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ inventory_count: 10, icc_available_quantity: 10, in_stock: true }],
      });
      // Check for warehouses
      mockClient.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // UPDATE (should not update icc_available_quantity)
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ inventory: 8 }],
      });
      // COMMIT
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await reserveInventory(mockPool as never, items, true); // skipICCQuantityDeduction = true

      expect(result.success).toBe(true);
    });

    it('should handle product not in stock', async () => {
      const items = [
        { productId: 'prod-1', quantity: 2, price: 50, name: 'Product 1' },
      ];

      // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // SELECT - not in stock
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ inventory_count: 0, icc_available_quantity: 0, in_stock: false }],
      });
      // COMMIT
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await reserveInventory(mockPool as never, items);

      expect(result.success).toBe(true);
      expect(result.partiallyFulfilled).toBe(true);
      expect(result.warnings.some(w => w.includes('not in stock'))).toBe(true);
    });

    it('should handle products with warehouses differently', async () => {
      const items = [
        { productId: 'prod-1', quantity: 2, price: 50, name: 'Warehouse Product' },
      ];

      // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // SELECT
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ inventory_count: 10, icc_available_quantity: 10, in_stock: true }],
      });
      // Check for warehouses - has warehouses
      mockClient.query.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      // UPDATE ICC quantity only (not inventory_count)
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ icc_available_quantity: 8 }],
      });
      // COMMIT
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await reserveInventory(mockPool as never, items);

      expect(result.success).toBe(true);
    });
  });
});
