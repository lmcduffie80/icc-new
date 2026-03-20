import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { allocateItemsToWarehousesFIFO } from '@/lib/warehouse-allocation';
import * as db from '@/lib/db';

// Mock the database module
vi.mock('@/lib/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

describe('FIFO Warehouse Allocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('allocateItemsToWarehousesFIFO', () => {
    it('should allocate from oldest supplier first', async () => {
      const mockLikeProducts = [
        {
          id: 'product-1',
          name: 'Test Product',
          supplier_id: 'supplier-a',
          company_name: 'Supplier A',
        },
        {
          id: 'product-2',
          name: 'Test Product',
          supplier_id: 'supplier-b',
          company_name: 'Supplier B',
        },
      ];

      const mockWarehouseInventories = [
        {
          product_id: 'product-1',
          warehouse_id: 'wh-1',
          warehouse_name: 'Warehouse 1',
          inventory_count: 10,
          warehouse_location: 'A-01',
          warehouse_entry_date: new Date('2024-01-01'),
          supplier_id: 'supplier-a',
          supplier_company: 'Supplier A',
          supplier_created_at: new Date('2023-01-01'), // Older supplier
        },
        {
          product_id: 'product-2',
          warehouse_id: 'wh-2',
          warehouse_name: 'Warehouse 2',
          inventory_count: 10,
          warehouse_location: 'B-01',
          warehouse_entry_date: new Date('2024-02-01'),
          supplier_id: 'supplier-b',
          supplier_company: 'Supplier B',
          supplier_created_at: new Date('2023-06-01'), // Newer supplier
        },
      ];

      vi.mocked(db.query).mockResolvedValueOnce(mockLikeProducts as never);
      vi.mocked(db.query).mockResolvedValueOnce(mockWarehouseInventories as never);

      const items = [
        { product_id: 'product-1', quantity: 5, name: 'Test Product' },
      ];

      const result = await allocateItemsToWarehousesFIFO(items);

      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].supplier_id).toBe('supplier-a');
      expect(result.allocations[0].items[0].quantity).toBe(5);
      expect(result.unfulfilledItems).toHaveLength(0);
    });

    it('should exhaust oldest warehouse before moving to next', async () => {
      const mockLikeProducts = [
        {
          id: 'product-1',
          name: 'Test Product',
          supplier_id: 'supplier-a',
          company_name: 'Supplier A',
        },
      ];

      const mockWarehouseInventories = [
        {
          product_id: 'product-1',
          warehouse_id: 'wh-1',
          warehouse_name: 'Warehouse 1',
          inventory_count: 5,
          warehouse_location: 'A-01',
          warehouse_entry_date: new Date('2024-01-01'), // Older
          supplier_id: 'supplier-a',
          supplier_company: 'Supplier A',
          supplier_created_at: new Date('2023-01-01'),
        },
        {
          product_id: 'product-1',
          warehouse_id: 'wh-2',
          warehouse_name: 'Warehouse 2',
          inventory_count: 10,
          warehouse_location: 'A-02',
          warehouse_entry_date: new Date('2024-02-01'), // Newer
          supplier_id: 'supplier-a',
          supplier_company: 'Supplier A',
          supplier_created_at: new Date('2023-01-01'),
        },
      ];

      vi.mocked(db.query).mockResolvedValueOnce(mockLikeProducts as never);
      vi.mocked(db.query).mockResolvedValueOnce(mockWarehouseInventories as never);

      const items = [
        { product_id: 'product-1', quantity: 10, name: 'Test Product' },
      ];

      const result = await allocateItemsToWarehousesFIFO(items);

      expect(result.allocations).toHaveLength(2);
      // First allocation should be from older warehouse (wh-1) for 5 units
      expect(result.allocations[0].warehouse_id).toBe('wh-1');
      expect(result.allocations[0].items[0].quantity).toBe(5);
      // Second allocation should be from newer warehouse (wh-2) for 5 units
      expect(result.allocations[1].warehouse_id).toBe('wh-2');
      expect(result.allocations[1].items[0].quantity).toBe(5);
      expect(result.unfulfilledItems).toHaveLength(0);
    });

    it('should track product substitutions', async () => {
      const mockLikeProducts = [
        {
          id: 'product-1',
          name: 'Test Product',
          supplier_id: 'supplier-a',
          company_name: 'Supplier A',
        },
        {
          id: 'product-2',
          name: 'Test Product',
          supplier_id: 'supplier-b',
          company_name: 'Supplier B',
        },
      ];

      const mockWarehouseInventories = [
        {
          product_id: 'product-2', // Different product than ordered
          warehouse_id: 'wh-1',
          warehouse_name: 'Warehouse 1',
          inventory_count: 10,
          warehouse_location: 'A-01',
          warehouse_entry_date: new Date('2024-01-01'),
          supplier_id: 'supplier-b',
          supplier_company: 'Supplier B',
          supplier_created_at: new Date('2023-01-01'),
        },
      ];

      vi.mocked(db.query).mockResolvedValueOnce(mockLikeProducts as never);
      vi.mocked(db.query).mockResolvedValueOnce(mockWarehouseInventories as never);

      const items = [
        { product_id: 'product-1', quantity: 5, name: 'Test Product' },
      ];

      const result = await allocateItemsToWarehousesFIFO(items);

      expect(result.substitutions).toHaveLength(1);
      expect(result.substitutions[0].original_product_id).toBe('product-1');
      expect(result.substitutions[0].allocated_product_id).toBe('product-2');
      expect(result.substitutions[0].supplier_company).toBe('Supplier B');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should handle partial fulfillment', async () => {
      const mockLikeProducts = [
        {
          id: 'product-1',
          name: 'Test Product',
          supplier_id: 'supplier-a',
          company_name: 'Supplier A',
        },
      ];

      const mockWarehouseInventories = [
        {
          product_id: 'product-1',
          warehouse_id: 'wh-1',
          warehouse_name: 'Warehouse 1',
          inventory_count: 5, // Less than requested
          warehouse_location: 'A-01',
          warehouse_entry_date: new Date('2024-01-01'),
          supplier_id: 'supplier-a',
          supplier_company: 'Supplier A',
          supplier_created_at: new Date('2023-01-01'),
        },
      ];

      vi.mocked(db.query).mockResolvedValueOnce(mockLikeProducts as never);
      vi.mocked(db.query).mockResolvedValueOnce(mockWarehouseInventories as never);

      const items = [
        { product_id: 'product-1', quantity: 10, name: 'Test Product' },
      ];

      const result = await allocateItemsToWarehousesFIFO(items);

      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].items[0].quantity).toBe(5);
      expect(result.unfulfilledItems).toHaveLength(1);
      expect(result.unfulfilledItems[0].quantity).toBe(5);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should handle no inventory available', async () => {
      const mockLikeProducts = [
        {
          id: 'product-1',
          name: 'Test Product',
          supplier_id: 'supplier-a',
          company_name: 'Supplier A',
        },
      ];

      const mockWarehouseInventories: never[] = []; // No inventory

      vi.mocked(db.query).mockResolvedValueOnce(mockLikeProducts as never);
      vi.mocked(db.query).mockResolvedValueOnce(mockWarehouseInventories as never);

      const items = [
        { product_id: 'product-1', quantity: 10, name: 'Test Product' },
      ];

      const result = await allocateItemsToWarehousesFIFO(items);

      expect(result.allocations).toHaveLength(0);
      expect(result.unfulfilledItems).toHaveLength(1);
      expect(result.unfulfilledItems[0].quantity).toBe(10);
      expect(result.warnings).toContain('No warehouse inventory available for Test Product');
    });

    it('should handle no like products found', async () => {
      const mockLikeProducts: never[] = []; // No like products

      vi.mocked(db.query).mockResolvedValueOnce(mockLikeProducts as never);

      const items = [
        { product_id: 'product-1', quantity: 10, name: 'Test Product' },
      ];

      const result = await allocateItemsToWarehousesFIFO(items);

      expect(result.allocations).toHaveLength(0);
      expect(result.unfulfilledItems).toHaveLength(1);
      expect(result.warnings).toContain('No inventory available for Test Product');
    });

    it('should allocate across multiple suppliers when needed', async () => {
      const mockLikeProducts = [
        {
          id: 'product-1',
          name: 'Test Product',
          supplier_id: 'supplier-a',
          company_name: 'Supplier A',
        },
        {
          id: 'product-2',
          name: 'Test Product',
          supplier_id: 'supplier-b',
          company_name: 'Supplier B',
        },
      ];

      const mockWarehouseInventories = [
        {
          product_id: 'product-1',
          warehouse_id: 'wh-1',
          warehouse_name: 'Warehouse 1',
          inventory_count: 5,
          warehouse_location: 'A-01',
          warehouse_entry_date: new Date('2024-01-01'),
          supplier_id: 'supplier-a',
          supplier_company: 'Supplier A',
          supplier_created_at: new Date('2023-01-01'), // Older
        },
        {
          product_id: 'product-2',
          warehouse_id: 'wh-2',
          warehouse_name: 'Warehouse 2',
          inventory_count: 10,
          warehouse_location: 'B-01',
          warehouse_entry_date: new Date('2024-02-01'),
          supplier_id: 'supplier-b',
          supplier_company: 'Supplier B',
          supplier_created_at: new Date('2023-06-01'), // Newer
        },
      ];

      vi.mocked(db.query).mockResolvedValueOnce(mockLikeProducts as never);
      vi.mocked(db.query).mockResolvedValueOnce(mockWarehouseInventories as never);

      const items = [
        { product_id: 'product-1', quantity: 10, name: 'Test Product' },
      ];

      const result = await allocateItemsToWarehousesFIFO(items);

      expect(result.allocations).toHaveLength(2);
      // First 5 units from older supplier
      expect(result.allocations[0].supplier_id).toBe('supplier-a');
      expect(result.allocations[0].items[0].quantity).toBe(5);
      // Remaining 5 units from newer supplier
      expect(result.allocations[1].supplier_id).toBe('supplier-b');
      expect(result.allocations[1].items[0].quantity).toBe(5);
      expect(result.unfulfilledItems).toHaveLength(0);
    });
  });
});
