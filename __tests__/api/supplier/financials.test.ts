import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/supplier/reports/financials/route';
import { createGetRequest, parseJsonResponse } from '../helpers/request-helpers';

const { mockQuery, mockGetSupplierSession } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetSupplierSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
}));

vi.mock('@/lib/supplier-auth', () => ({
  getSupplierSession: mockGetSupplierSession,
}));

const mockSession = {
  user: {
    id: 'supplier-1',
    email: 'supplier@example.com',
    name: 'Test Supplier',
    company_name: 'Test Company',
  },
};

describe('GET /api/supplier/reports/financials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    mockGetSupplierSession.mockResolvedValue(null);

    const request = createGetRequest('/api/supplier/reports/financials');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return financial data with correct totals', async () => {
    mockGetSupplierSession.mockResolvedValue(mockSession);

    const mockMonthlyData = [
      {
        month: '2025-01',
        products_sold: '10',
        revenue: '1000.00',
        icc_payout: '150.00',
        supplier_payout: '850.00',
      },
    ];

    const mockProductData = [
      {
        product_id: 'prod-1',
        product_name: 'Test Product',
        quantity_sold: '10',
        total_revenue: '1000.00',
        icc_share: '150.00',
        supplier_share: '850.00',
        margin_split_percentage: '50',
      },
    ];

    mockQuery
      .mockResolvedValueOnce(mockMonthlyData)
      .mockResolvedValueOnce(mockProductData);

    const request = createGetRequest('/api/supplier/reports/financials');
    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.totals.revenue).toBe(1000);
    expect(data.totals.productsSold).toBe(10);
    expect(data.totals.iccPayout).toBe(150);
    expect(data.totals.supplierPayout).toBe(850);
    expect(data.monthly).toEqual(mockMonthlyData);
    expect(data.products).toEqual(mockProductData);
  });

  it('should include confirmed and processing orders (NOT IN cancelled/refunded filter)', async () => {
    mockGetSupplierSession.mockResolvedValue(mockSession);

    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const request = createGetRequest('/api/supplier/reports/financials');
    await GET(request);

    const monthlyQueryArg = mockQuery.mock.calls[0][0] as string;
    const productQueryArg = mockQuery.mock.calls[1][0] as string;

    expect(monthlyQueryArg).toContain("NOT IN ('cancelled', 'refunded')");
    expect(productQueryArg).toContain("NOT IN ('cancelled', 'refunded')");

    expect(monthlyQueryArg).not.toContain("IN ('delivered', 'shipped')");
    expect(productQueryArg).not.toContain("IN ('delivered', 'shipped')");
  });

  it('should use order-time price (oi.price) not current product price (p.price)', async () => {
    mockGetSupplierSession.mockResolvedValue(mockSession);

    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const request = createGetRequest('/api/supplier/reports/financials');
    await GET(request);

    const monthlyQueryArg = mockQuery.mock.calls[0][0] as string;
    const productQueryArg = mockQuery.mock.calls[1][0] as string;

    expect(monthlyQueryArg).toContain('oi.quantity * oi.price');
    expect(productQueryArg).toContain('oi.quantity * oi.price');

    expect(monthlyQueryArg).not.toContain('oi.quantity * p.price');
    expect(productQueryArg).not.toContain('oi.quantity * p.price');
  });

  it('should COALESCE supplier_price to prevent NULL revenue', async () => {
    mockGetSupplierSession.mockResolvedValue(mockSession);

    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const request = createGetRequest('/api/supplier/reports/financials');
    await GET(request);

    const monthlyQueryArg = mockQuery.mock.calls[0][0] as string;
    const productQueryArg = mockQuery.mock.calls[1][0] as string;

    expect(monthlyQueryArg).toContain('COALESCE(p.supplier_price, 0)');
    expect(productQueryArg).toContain('COALESCE(p.supplier_price, 0)');
  });

  it('should use FIFO supplier attribution (COALESCE oi.supplier_id)', async () => {
    mockGetSupplierSession.mockResolvedValue(mockSession);

    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const request = createGetRequest('/api/supplier/reports/financials');
    await GET(request);

    const monthlyQueryArg = mockQuery.mock.calls[0][0] as string;
    const productQueryArg = mockQuery.mock.calls[1][0] as string;

    expect(monthlyQueryArg).toContain('COALESCE(oi.supplier_id, p.supplier_id)');
    expect(productQueryArg).toContain('COALESCE(oi.supplier_id, p.supplier_id)');
  });

  it('should pass date filters when provided', async () => {
    mockGetSupplierSession.mockResolvedValue(mockSession);

    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const request = createGetRequest('/api/supplier/reports/financials', {
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });
    await GET(request);

    const params = mockQuery.mock.calls[0][1];
    expect(params).toEqual(['supplier-1', '2025-01-01', '2025-12-31']);
  });

  it('should handle database error gracefully', async () => {
    mockGetSupplierSession.mockResolvedValue(mockSession);
    mockQuery.mockRejectedValue(new Error('DB connection failed'));

    const request = createGetRequest('/api/supplier/reports/financials');
    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch financial data');
  });

  it('should return zero totals when no data exists', async () => {
    mockGetSupplierSession.mockResolvedValue(mockSession);

    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const request = createGetRequest('/api/supplier/reports/financials');
    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.totals).toEqual({
      revenue: 0,
      productsSold: 0,
      iccPayout: 0,
      supplierPayout: 0,
    });
  });
});
