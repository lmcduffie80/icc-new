import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/admin/tax-rates/route';
import { PUT, DELETE } from '@/app/api/admin/tax-rates/[id]/route';

// Mock dependencies
vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: vi.fn().mockResolvedValue({
    error: null,
    session: {
      adminUser: {
        id: 'admin-123',
        email: 'admin@example.com',
        permissions: ['settings.view_tax', 'settings.update_tax'],
      },
    },
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimiters: {
    moderate: { limit: 5, windowMs: 60000 },
  },
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  createRateLimitResponse: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/security-logger', () => ({
  securityLogger: {
    logAdminAction: vi.fn(),
    logError: vi.fn(),
    logEvent: vi.fn(),
  },
}));

vi.mock('@/lib/tax', () => ({
  getAllTaxRates: vi.fn(),
  createTaxRate: vi.fn(),
  getTaxRateById: vi.fn(),
  updateTaxRate: vi.fn(),
  deleteTaxRate: vi.fn(),
}));

import { getAllTaxRates, createTaxRate, getTaxRateById, updateTaxRate, deleteTaxRate } from '@/lib/tax';
import { requireAdmin } from '@/lib/admin-auth';

describe('/api/admin/tax-rates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/admin/tax-rates', () => {
    it('should return all tax rates for authorized admin', async () => {
      const mockRates = [
        {
          id: '1',
          stateCode: 'CA',
          rate: 0.021,
          effectiveDate: new Date().toISOString(),
          isActive: true,
          createdBy: 'admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      (getAllTaxRates as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockRates);

      // This route doesn't take a request parameter
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockRates);
      expect(getAllTaxRates).toHaveBeenCalled();
    });

    it('should reject unauthorized admin', async () => {
      (requireAdmin as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
        session: null,
      });

      // This route doesn't take a request parameter
      const response = await GET();

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/admin/tax-rates', () => {
    it('should create a new tax rate', async () => {
      const newRate = {
        id: '1',
        stateCode: 'CA',
        rate: 0.021,
        effectiveDate: new Date(),
        isActive: true,
        createdBy: 'admin-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (createTaxRate as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(newRate);

      const request = new NextRequest('http://localhost:3000/api/admin/tax-rates', {
        method: 'POST',
        body: JSON.stringify({
          stateCode: 'CA',
          rate: 0.021,
          effectiveDate: new Date().toISOString(),
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.stateCode).toBe('CA');
      expect(data.rate).toBe(0.021);
    });

    it('should reject rate exceeding 20%', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/tax-rates', {
        method: 'POST',
        body: JSON.stringify({
          stateCode: 'CA',
          rate: 0.25, // 25%
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('maximum');
    });

    it('should reject invalid state code', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/tax-rates', {
        method: 'POST',
        body: JSON.stringify({
          stateCode: 'INVALID',
          rate: 0.021,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
    });

    it('should reject unauthorized admin', async () => {
      (requireAdmin as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
        session: null,
      });

      const request = new NextRequest('http://localhost:3000/api/admin/tax-rates', {
        method: 'POST',
        body: JSON.stringify({
          stateCode: 'CA',
          rate: 0.021,
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/admin/tax-rates/[id]', () => {
    it('should update a future-effective tax rate', async () => {
      const existingRate = {
        id: '1',
        stateCode: 'CA',
        rate: 0.021,
        effectiveDate: new Date(Date.now() + 86400000), // Tomorrow
        isActive: true,
        createdBy: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedRate = {
        ...existingRate,
        rate: 0.025,
      };

      (getTaxRateById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(existingRate);
      (updateTaxRate as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(updatedRate);

      const request = new NextRequest('http://localhost:3000/api/admin/tax-rates/1', {
        method: 'PUT',
        body: JSON.stringify({
          rate: 0.025,
        }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: '1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.rate).toBe(0.025);
    });

    it('should reject updating already-effective rate', async () => {
      (getTaxRateById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: '1',
        effectiveDate: new Date(Date.now() - 86400000), // Yesterday
      });
      (updateTaxRate as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/admin/tax-rates/1', {
        method: 'PUT',
        body: JSON.stringify({
          rate: 0.025,
        }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: '1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('future-effective');
    });

    it('should return 404 for non-existent rate', async () => {
      (getTaxRateById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/admin/tax-rates/999', {
        method: 'PUT',
        body: JSON.stringify({
          rate: 0.025,
        }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: '999' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });

  describe('DELETE /api/admin/tax-rates/[id]', () => {
    it('should delete a future-effective tax rate', async () => {
      (getTaxRateById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: '1',
        stateCode: 'CA',
        effectiveDate: new Date(Date.now() + 86400000), // Tomorrow
      });
      (deleteTaxRate as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const request = new NextRequest('http://localhost:3000/api/admin/tax-rates/1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: '1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should allow deleting an already-effective rate', async () => {
      (getTaxRateById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: '1',
        stateCode: 'CA',
        effectiveDate: new Date(Date.now() - 86400000), // Yesterday
        isActive: true,
      });
      (deleteTaxRate as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const request = new NextRequest('http://localhost:3000/api/admin/tax-rates/1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: '1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should return 404 for non-existent rate', async () => {
      (getTaxRateById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/admin/tax-rates/999', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: '999' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });
});
