import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/admin/reports/transactions/route';

// Mock dependencies
vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: vi.fn().mockImplementation(async () => ({
    session: {
      adminUser: {
        id: 'admin-123',
        email: 'admin@example.com',
        username: 'admin',
      },
      permissions: ['reports.view_transactions'],
    },
  })),
}));

vi.mock('@/lib/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

import { query, queryOne } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';

describe('/api/admin/reports/transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/admin/reports/transactions', () => {
    it('should return paginated transactions for authorized admin', async () => {
      const mockTransactions = [
        {
          id: 'txn-1',
          transaction_number: 'MAT-2024-00001',
          transaction_type: 'goods_issue',
          transaction_date: new Date().toISOString(),
          posting_date: new Date().toISOString(),
          product_id: 'prod-1',
          product_sku: 'SKU-001',
          product_name: 'Test Product',
          quantity: -10,
          unit_of_measure: 'EA',
          warehouse_id: 'wh-1',
          warehouse_name: 'Main Warehouse',
          reference_doc_type: 'order',
          reference_doc_id: 'ord-1',
          reference_doc_number: 'ORD-001',
          created_by_username: 'admin',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const mockCount = { total_count: '1' };

      (queryOne as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockCount);
      (query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockTransactions);

      const request = new NextRequest('http://localhost:3000/api/admin/reports/transactions?page=1&limit=50');
      const response = await GET(request) as Response;
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.transactions).toEqual(mockTransactions);
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.limit).toBe(50);
      expect(data.pagination.totalCount).toBe(1);
      expect(queryOne).toHaveBeenCalled();
      expect(query).toHaveBeenCalled();
    });

    it('should reject unauthorized admin', async () => {
      (requireAdmin as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
        session: null,
      });

      const request = new NextRequest('http://localhost:3000/api/admin/reports/transactions');
      const response = await GET(request) as Response;

      expect(response.status).toBe(401);
    });

    it('should reject admin without proper permission', async () => {
      (requireAdmin as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        session: {
          adminUser: {
            id: 'admin-123',
            email: 'admin@example.com',
            username: 'admin',
          },
          permissions: ['products.view'], // Wrong permission
        },
      });

      const request = new NextRequest('http://localhost:3000/api/admin/reports/transactions');
      const response = await GET(request) as Response;

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toContain('reports.view_transactions');
    });

    it('should filter transactions by date range', async () => {
      const mockTransactions: Record<string, unknown>[] = [];
      const mockCount = { total_count: '0' };

      (queryOne as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockCount);
      (query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockTransactions);

      const request = new NextRequest(
        'http://localhost:3000/api/admin/reports/transactions?startDate=2024-01-01&endDate=2024-12-31'
      );
      const response = await GET(request) as Response;
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.filters.startDate).toBe('2024-01-01');
      expect(data.filters.endDate).toBe('2024-12-31');
    });

    it('should filter transactions by transaction type', async () => {
      const mockTransactions: Record<string, unknown>[] = [];
      const mockCount = { total_count: '0' };

      (queryOne as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockCount);
      (query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockTransactions);

      const request = new NextRequest(
        'http://localhost:3000/api/admin/reports/transactions?transaction_type=goods_issue'
      );
      const response = await GET(request) as Response;
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.filters.transaction_type).toBe('goods_issue');
    });

    it('should filter transactions by search term', async () => {
      const mockTransactions: Record<string, unknown>[] = [];
      const mockCount = { total_count: '0' };

      (queryOne as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockCount);
      (query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockTransactions);

      const request = new NextRequest(
        'http://localhost:3000/api/admin/reports/transactions?search=Test+Product'
      );
      const response = await GET(request) as Response;
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.filters.search).toBe('Test Product');
    });

    it('should respect pagination limits', async () => {
      const mockTransactions: Record<string, unknown>[] = [];
      const mockCount = { total_count: '0' };

      (queryOne as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockCount);
      (query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockTransactions);

      const request = new NextRequest(
        'http://localhost:3000/api/admin/reports/transactions?page=2&limit=25'
      );
      const response = await GET(request) as Response;
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination.page).toBe(2);
      expect(data.pagination.limit).toBe(25);
    });

    it('should enforce maximum limit of 100', async () => {
      const mockTransactions: Record<string, unknown>[] = [];
      const mockCount = { total_count: '0' };

      (queryOne as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockCount);
      (query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockTransactions);

      const request = new NextRequest(
        'http://localhost:3000/api/admin/reports/transactions?limit=200'
      );
      const response = await GET(request) as Response;
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination.limit).toBe(100); // Should be capped at 100
    });

    it('should handle database errors gracefully', async () => {
      (queryOne as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = new NextRequest('http://localhost:3000/api/admin/reports/transactions');
      const response = await GET(request) as Response;

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to fetch inventory transactions');
    });
  });

  describe('POST /api/admin/reports/transactions (Summary)', () => {
    it('should return transaction summary for authorized admin', async () => {
      const mockSummary = [
        {
          transaction_type: 'goods_receipt',
          transaction_count: '10',
          total_quantity: '100',
          total_value: '1000.00',
        },
        {
          transaction_type: 'goods_issue',
          transaction_count: '5',
          total_quantity: '50',
          total_value: '500.00',
        },
      ];

      const mockTopProducts = [
        {
          product_id: 'prod-1',
          product_name: 'Test Product',
          product_sku: 'SKU-001',
          transaction_count: '15',
          total_quantity: '150',
        },
      ];

      const mockTopWarehouses = [
        {
          warehouse_id: 'wh-1',
          warehouse_name: 'Main Warehouse',
          transaction_count: '15',
          total_quantity: '150',
        },
      ];

      (query as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockSummary)
        .mockResolvedValueOnce(mockTopProducts)
        .mockResolvedValueOnce(mockTopWarehouses);

      const request = new NextRequest('http://localhost:3000/api/admin/reports/transactions', {
        method: 'POST',
        body: JSON.stringify({
          startDate: '2024-01-01',
          endDate: '2024-12-31',
        }),
      });

      const response = await POST(request) as Response;
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.summary).toHaveLength(2);
      expect(data.summary[0].transaction_type).toBe('goods_receipt');
      expect(data.summary[0].transaction_count).toBe(10);
      expect(data.topProducts).toHaveLength(1);
      expect(data.topWarehouses).toHaveLength(1);
    });

    it('should reject unauthorized admin for summary', async () => {
      (requireAdmin as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
        session: null,
      });

      const request = new NextRequest('http://localhost:3000/api/admin/reports/transactions', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request) as Response;

      expect(response.status).toBe(401);
    });

    it('should handle database errors in summary', async () => {
      (query as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = new NextRequest('http://localhost:3000/api/admin/reports/transactions', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request) as Response;

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to fetch transaction summary');
    });

    it('should produce valid SQL when no date filters are provided', async () => {
      const mockSummary: Record<string, unknown>[] = [];
      const mockTopProducts: Record<string, unknown>[] = [];
      const mockTopWarehouses: Record<string, unknown>[] = [];

      (query as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockSummary)
        .mockResolvedValueOnce(mockTopProducts)
        .mockResolvedValueOnce(mockTopWarehouses);

      const request = new NextRequest('http://localhost:3000/api/admin/reports/transactions', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request) as Response;
      expect(response.status).toBe(200);

      // The third query call is topWarehousesQuery — verify it contains WHERE
      const thirdCall = (query as unknown as ReturnType<typeof vi.fn>).mock.calls[2];
      const warehouseQuery = thirdCall[0] as string;
      expect(warehouseQuery).toContain('WHERE warehouse_id IS NOT NULL');
      expect(warehouseQuery).not.toMatch(/FROM\s+inventory_transactions\s+AND/);
    });
  });
});
