import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PUT } from '@/app/api/admin/orders/[id]/route';
import * as adminAuth from '@/lib/admin-auth';
import * as db from '@/lib/db';
import * as orderValidation from '@/lib/order-validation';
import * as config from '@/lib/config';

// Mock modules
vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  getPoolInstance: vi.fn(() => ({
    connect: vi.fn(() => ({
      query: vi.fn(),
      release: vi.fn(),
    })),
    query: vi.fn(),
  })),
}));

vi.mock('@/lib/order-validation', () => ({
  reserveInventory: vi.fn(),
  reserveInventoryFIFO: vi.fn(),
}));

vi.mock('@/lib/config', () => ({
  INVENTORY_CONFIG: {
    USE_FIFO_ALLOCATION: false,
    ALLOW_PRODUCT_SUBSTITUTION: true,
    LOG_FIFO_DECISIONS: true,
  },
}));

vi.mock('@/lib/audit', () => ({
  logAction: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/security-logger', () => ({
  securityLogger: {
    logError: vi.fn(),
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('FIFO Order Processing Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default admin auth mock
    vi.mocked(adminAuth.requireAdmin).mockResolvedValue({
      session: {
        user: {
          id: 'admin-1',
          email: 'admin@test.com',
          name: 'Admin User',
          image: null,
        },
        adminUser: {
          id: 'admin-1',
          user_id: null,
          role_id: 'role-1',
          custom_permissions: { grant: [], revoke: [] },
          email: 'admin@test.com',
          name: 'Admin User',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        role: {
          id: 'role-1',
          name: 'Admin',
          description: 'Administrator',
          permissions: ['orders:write', 'orders:read'],
          is_system: true,
          created_at: new Date().toISOString(),
        },
        permissions: ['orders:write', 'orders:read'],
        isStandalone: true,
      },
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Order Status Update with FIFO Disabled', () => {
    it('should use standard inventory reservation when FIFO is disabled', async () => {
      const mockOrder = {
        id: 'order-1',
        status: 'draft',
        metadata: {},
      };

      const mockOrderItems = [
        {
          product_id: 'product-1',
          quantity: 10,
          name: 'Test Product',
        },
      ];

      vi.mocked(db.queryOne).mockResolvedValueOnce(mockOrder as never);
      vi.mocked(db.query).mockResolvedValueOnce(mockOrderItems as never);
      vi.mocked(db.queryOne).mockResolvedValueOnce({ ...mockOrder, status: 'pending' } as never);
      vi.mocked(db.getPoolInstance).mockReturnValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
      } as never);

      vi.mocked(orderValidation.reserveInventory).mockResolvedValue({
        success: true,
        errors: [],
        partiallyFulfilled: false,
        warnings: [],
      });

      const request = new NextRequest('http://localhost:3000/api/admin/orders/order-1', {
        method: 'PUT',
        body: JSON.stringify({ status: 'pending' }),
      });

      await PUT(request, { params: Promise.resolve({ id: 'order-1' }) });

      expect(orderValidation.reserveInventory).toHaveBeenCalled();
      expect(orderValidation.reserveInventoryFIFO).not.toHaveBeenCalled();
    });
  });

  describe('Order Status Update with FIFO Enabled', () => {
    beforeEach(() => {
      // Enable FIFO for these tests
      vi.mocked(config.INVENTORY_CONFIG).USE_FIFO_ALLOCATION = true;
    });

    it('should use FIFO inventory reservation when FIFO is enabled', async () => {
      const mockOrder = {
        id: 'order-1',
        status: 'draft',
        metadata: {},
      };

      const mockOrderItems = [
        {
          product_id: 'product-1',
          quantity: 10,
          name: 'Test Product',
        },
      ];

      const mockFIFOAllocations = [
        {
          warehouse_id: 'wh-1',
          warehouse_name: 'Warehouse 1',
          warehouse_location: 'A-01',
          supplier_id: 'supplier-a',
          supplier_company: 'Supplier A',
          items: [
            {
              product_id: 'product-1',
              quantity: 10,
              name: 'Test Product',
              warehouse_id: 'wh-1',
              warehouse_name: 'Warehouse 1',
              warehouse_location: 'A-01',
              supplier_id: 'supplier-a',
              supplier_company: 'Supplier A',
              original_product_id: 'product-1',
              allocated_product_id: 'product-1',
              warehouse_entry_date: new Date('2024-01-01'),
            },
          ],
        },
      ];

      vi.mocked(db.queryOne).mockResolvedValueOnce(mockOrder as never);
      vi.mocked(db.query).mockResolvedValueOnce(mockOrderItems as never);
      vi.mocked(db.query).mockResolvedValue([] as never); // For update queries
      vi.mocked(db.queryOne).mockResolvedValue({ ...mockOrder, status: 'pending' } as never);
      vi.mocked(db.getPoolInstance).mockReturnValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
      } as never);

      vi.mocked(orderValidation.reserveInventoryFIFO).mockResolvedValue({
        success: true,
        errors: [],
        partiallyFulfilled: false,
        warnings: [],
        allocations: mockFIFOAllocations as never,
        substitutions: [],
      });

      const request = new NextRequest('http://localhost:3000/api/admin/orders/order-1', {
        method: 'PUT',
        body: JSON.stringify({ status: 'pending' }),
      });

      await PUT(request, { params: Promise.resolve({ id: 'order-1' }) });

      expect(orderValidation.reserveInventoryFIFO).toHaveBeenCalled();
      expect(orderValidation.reserveInventory).not.toHaveBeenCalled();
    });

    it('should track product substitutions in order_items', async () => {
      const mockOrder = {
        id: 'order-1',
        status: 'draft',
        metadata: {},
      };

      const mockOrderItems = [
        {
          product_id: 'product-1',
          quantity: 10,
          name: 'Test Product',
        },
      ];

      const mockFIFOAllocations = [
        {
          warehouse_id: 'wh-1',
          warehouse_name: 'Warehouse 1',
          warehouse_location: 'A-01',
          supplier_id: 'supplier-b',
          supplier_company: 'Supplier B',
          items: [
            {
              product_id: 'product-2', // Different product
              quantity: 10,
              name: 'Test Product',
              warehouse_id: 'wh-1',
              warehouse_name: 'Warehouse 1',
              warehouse_location: 'A-01',
              supplier_id: 'supplier-b',
              supplier_company: 'Supplier B',
              original_product_id: 'product-1',
              allocated_product_id: 'product-2', // Substitution
              warehouse_entry_date: new Date('2024-01-01'),
            },
          ],
        },
      ];

      const mockSubstitutions = [
        {
          original_product_id: 'product-1',
          allocated_product_id: 'product-2',
          supplier_company: 'Supplier B',
        },
      ];

      vi.mocked(db.queryOne).mockResolvedValueOnce(mockOrder as never);
      vi.mocked(db.query).mockResolvedValueOnce(mockOrderItems as never);
      vi.mocked(db.query).mockResolvedValue([] as never);
      vi.mocked(db.queryOne).mockResolvedValue({ ...mockOrder, status: 'pending' } as never);
      vi.mocked(db.getPoolInstance).mockReturnValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
      } as never);

      vi.mocked(orderValidation.reserveInventoryFIFO).mockResolvedValue({
        success: true,
        errors: [],
        partiallyFulfilled: false,
        warnings: ['Product substitution: Using Test Product from Supplier B (product product-2)'],
        allocations: mockFIFOAllocations as never,
        substitutions: mockSubstitutions,
      });

      const request = new NextRequest('http://localhost:3000/api/admin/orders/order-1', {
        method: 'PUT',
        body: JSON.stringify({ status: 'pending' }),
      });

      await PUT(request, { params: Promise.resolve({ id: 'order-1' }) });

      expect(orderValidation.reserveInventoryFIFO).toHaveBeenCalled();
      
      // Verify order_items was updated with substitution info
      const updateCalls = vi.mocked(db.query).mock.calls.filter(
        call => call[0].includes('UPDATE order_items')
      );
      expect(updateCalls.length).toBeGreaterThan(0);
    });

    it('should handle partial fulfillment with FIFO', async () => {
      const mockOrder = {
        id: 'order-1',
        status: 'draft',
        metadata: {},
      };

      const mockOrderItems = [
        {
          product_id: 'product-1',
          quantity: 10,
          name: 'Test Product',
        },
      ];

      const mockFIFOAllocations = [
        {
          warehouse_id: 'wh-1',
          warehouse_name: 'Warehouse 1',
          warehouse_location: 'A-01',
          supplier_id: 'supplier-a',
          supplier_company: 'Supplier A',
          items: [
            {
              product_id: 'product-1',
              quantity: 5, // Only 5 available
              name: 'Test Product',
              warehouse_id: 'wh-1',
              warehouse_name: 'Warehouse 1',
              warehouse_location: 'A-01',
              supplier_id: 'supplier-a',
              supplier_company: 'Supplier A',
              original_product_id: 'product-1',
              allocated_product_id: 'product-1',
              warehouse_entry_date: new Date('2024-01-01'),
            },
          ],
        },
      ];

      vi.mocked(db.queryOne).mockResolvedValueOnce(mockOrder as never);
      vi.mocked(db.query).mockResolvedValueOnce(mockOrderItems as never);
      vi.mocked(db.query).mockResolvedValue([] as never);
      vi.mocked(db.queryOne).mockResolvedValue({ ...mockOrder, status: 'pending' } as never);
      vi.mocked(db.getPoolInstance).mockReturnValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
      } as never);

      vi.mocked(orderValidation.reserveInventoryFIFO).mockResolvedValue({
        success: true,
        errors: [],
        partiallyFulfilled: true,
        warnings: ['Partial fulfillment for Test Product: 5 units still needed (allocated 5)'],
        allocations: mockFIFOAllocations as never,
        substitutions: [],
      });

      const request = new NextRequest('http://localhost:3000/api/admin/orders/order-1', {
        method: 'PUT',
        body: JSON.stringify({ status: 'pending' }),
      });

      await PUT(request, { params: Promise.resolve({ id: 'order-1' }) });

      expect(orderValidation.reserveInventoryFIFO).toHaveBeenCalled();
      
      // Should store partial fulfillment info in order metadata
      const updateMetadataCalls = vi.mocked(db.queryOne).mock.calls.filter(
        call => call[0].includes('UPDATE orders') && call[0].includes('metadata')
      );
      expect(updateMetadataCalls.length).toBeGreaterThan(0);
    });
  });

  describe('FIFO Allocation Error Handling', () => {
    beforeEach(() => {
      vi.mocked(config.INVENTORY_CONFIG).USE_FIFO_ALLOCATION = true;
    });

    it('should handle FIFO allocation failure gracefully', async () => {
      const mockOrder = {
        id: 'order-1',
        status: 'draft',
        metadata: {},
      };

      const mockOrderItems = [
        {
          product_id: 'product-1',
          quantity: 10,
          name: 'Test Product',
        },
      ];

      vi.mocked(db.queryOne).mockResolvedValueOnce(mockOrder as never);
      vi.mocked(db.query).mockResolvedValueOnce(mockOrderItems as never);
      vi.mocked(db.queryOne).mockResolvedValue({ ...mockOrder, status: 'pending' } as never);
      vi.mocked(db.getPoolInstance).mockReturnValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
      } as never);

      vi.mocked(orderValidation.reserveInventoryFIFO).mockResolvedValue({
        success: false,
        errors: ['Database connection error'],
        partiallyFulfilled: false,
        warnings: [],
      });

      const request = new NextRequest('http://localhost:3000/api/admin/orders/order-1', {
        method: 'PUT',
        body: JSON.stringify({ status: 'pending' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'order-1' }) });

      // Should still update order status despite reservation failure
      expect(response.status).toBe(200);
    });
  });
});
