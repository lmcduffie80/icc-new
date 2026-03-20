import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/admin/products/[id]/hard-delete/route';
import { createPostRequest, parseJsonResponse } from '../helpers/request-helpers';

const { mockQuery, mockQueryOne, mockRequireAdmin, mockLogAction } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
  mockRequireAdmin: vi.fn(),
  mockLogAction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock('@/lib/audit', () => ({
  logAction: mockLogAction,
}));

const adminSession = {
  error: null,
  session: {
    adminUser: { id: 'admin-1', user_id: 'admin-user-1' },
    permissions: ['products.delete'],
  },
};

const mockProduct = {
  id: 'prod-1',
  name: 'Glyphosate 53.8%',
  sku: '105001',
  category: 'Herbicides',
  price: 15.0,
  supplier_id: null,
};

describe('POST /api/admin/products/[id]/hard-delete', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockRequireAdmin.mockReset();
    mockLogAction.mockReset();
  });

  it('should permanently delete a product', async () => {
    mockRequireAdmin.mockResolvedValue(adminSession);
    mockQueryOne
      .mockResolvedValueOnce(mockProduct)   // SELECT product
      .mockResolvedValueOnce({ id: 'prod-1' }); // DELETE RETURNING
    mockQuery.mockResolvedValueOnce([]);    // DELETE inventory_transactions
    mockLogAction.mockResolvedValue(undefined);

    const request = createPostRequest('/api/admin/products/prod-1/hard-delete', { confirm: true });
    const response = await POST(request, { params: Promise.resolve({ id: 'prod-1' }) });
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain('105001');

    // Verify inventory_transactions deleted first
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM inventory_transactions'),
      ['prod-1']
    );
    // Verify product deleted
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM products'),
      ['prod-1']
    );
    expect(mockLogAction).toHaveBeenCalled();
  });

  it('should reject without confirmation', async () => {
    mockRequireAdmin.mockResolvedValue(adminSession);

    const request = createPostRequest('/api/admin/products/prod-1/hard-delete', {});
    const response = await POST(request, { params: Promise.resolve({ id: 'prod-1' }) });
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(400);
    expect(data.error).toContain('Confirmation required');
  });

  it('should return 404 for non-existent product', async () => {
    mockRequireAdmin.mockResolvedValue(adminSession);
    mockQueryOne.mockResolvedValueOnce(null);

    const request = createPostRequest('/api/admin/products/fake-id/hard-delete', { confirm: true });
    const response = await POST(request, { params: Promise.resolve({ id: 'fake-id' }) });
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(404);
    expect(data.error).toBe('Product not found');
  });

  it('should reject without products.delete permission', async () => {
    const errorResponse = new Response(
      JSON.stringify({ error: 'Insufficient permissions' }),
      { status: 403 }
    );
    mockRequireAdmin.mockResolvedValue({ error: errorResponse });

    const request = createPostRequest('/api/admin/products/prod-1/hard-delete', { confirm: true });
    const response = await POST(request, { params: Promise.resolve({ id: 'prod-1' }) });

    expect(response.status).toBe(403);
  });

  it('should handle database errors gracefully', async () => {
    mockRequireAdmin.mockResolvedValue(adminSession);
    // First queryOne returns the product lookup.
    // Second queryOne (DELETE FROM products) rejects to simulate a real failure.
    mockQueryOne.mockResolvedValueOnce(mockProduct);
    mockQueryOne.mockRejectedValueOnce(new Error('Database error'));
    // query (inventory_transactions DELETE) is caught internally and ignored.
    mockQuery.mockResolvedValueOnce(undefined);

    const request = createPostRequest('/api/admin/products/prod-1/hard-delete', { confirm: true });
    const response = await POST(request, { params: Promise.resolve({ id: 'prod-1' }) });
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to delete product');
  });
});
