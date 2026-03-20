import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/invoice/check-recent/route';
import { createGetRequest, parseJsonResponse } from '../helpers/request-helpers';
import { createMockSession } from '../helpers/auth-mock';

// Mock the database and auth with vi.hoisted
const { mockQueryOne, mockGetSession } = vi.hoisted(() => ({
  mockQueryOne: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: vi.fn(),
  queryOne: mockQueryOne,
  pool: {},
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: () => mockGetSession(),
    },
  },
}));

// Mock rate limiting to always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimiters: {
    relaxed: { limit: 60, window: 60 },
  },
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  createRateLimitResponse: vi.fn(),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

// Mock security logger
vi.mock('@/lib/security-logger', () => ({
  securityLogger: {
    logEvent: vi.fn(),
    logError: vi.fn(),
    logRateLimitExceeded: vi.fn(),
  },
}));

describe('GET /api/invoice/check-recent', () => {
  beforeEach(() => {
    mockQueryOne.mockReset();
    mockGetSession.mockReset();
  });

  describe('authenticated requests', () => {
    it('should return hasRecentInvoice: true when user has an invoice in user_invoices table', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const invoiceDate = new Date();
      invoiceDate.setMonth(invoiceDate.getMonth() - 3); // 3 months ago

      // Mock user_invoices table format (checked first)
      const mockUserInvoice = {
        id: 'invoice-1',
        file_url: 'https://example.com/invoice.pdf',
        state: 'CA',
        created_at: invoiceDate.toISOString(),
        filename: 'farm_invoice.pdf',
        file_type: 'application/pdf',
      };

      mockQueryOne.mockResolvedValueOnce(mockUserInvoice);

      const request = createGetRequest('/api/invoice/check-recent');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('hasRecentInvoice', true);
      expect(data).toHaveProperty('recentInvoice');
      expect(data.recentInvoice).toHaveProperty('invoice_url', 'https://example.com/invoice.pdf');
      expect(data.recentInvoice).toHaveProperty('invoice_state', 'CA');
      expect(data.recentInvoice).toHaveProperty('invoice_filename', 'farm_invoice.pdf');
      expect(data.recentInvoice).toHaveProperty('invoice_file_type', 'application/pdf');
    });

    it('should return hasRecentInvoice: false when user_invoices is empty (no fallback to order metadata)', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      // user_invoices returns null - user must upload a new invoice
      mockQueryOne.mockResolvedValueOnce(null);
      // user_profiles returns null (not exempt)
      mockQueryOne.mockResolvedValueOnce(null);

      const request = createGetRequest('/api/invoice/check-recent');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('hasRecentInvoice', false);
      expect(data).toHaveProperty('recentInvoice', null);
      // Should query user_invoices first, then user_profiles for exemption check
      expect(mockQueryOne).toHaveBeenCalledTimes(2);
    });

    it('should return hasRecentInvoice: false when user has no invoices', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockQueryOne.mockResolvedValue(null);

      const request = createGetRequest('/api/invoice/check-recent');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('hasRecentInvoice', false);
      expect(data).toHaveProperty('recentInvoice', null);
    });

    it('should return hasRecentInvoice: false when invoice is older than 6 months', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      // The API filters by date in the SQL query, so if an old invoice exists,
      // the query returns null because it doesn't match the date filter
      mockQueryOne.mockResolvedValue(null);

      const request = createGetRequest('/api/invoice/check-recent');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('hasRecentInvoice', false);
      expect(data).toHaveProperty('recentInvoice', null);
    });

    it('should only check invoices for the current user', async () => {
      const mockSession = createMockSession({ id: 'specific-user-id' });
      mockGetSession.mockResolvedValue(mockSession);

      mockQueryOne.mockResolvedValue(null);

      const request = createGetRequest('/api/invoice/check-recent');
      await GET(request);

      // Verify the query was called with the correct user ID
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        expect.arrayContaining(['specific-user-id'])
      );
    });

    it('should query user_invoices table first', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockQueryOne.mockResolvedValue(null);

      const request = createGetRequest('/api/invoice/check-recent');
      await GET(request);

      // Verify the first query is to user_invoices table
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('FROM user_invoices'),
        expect.arrayContaining([
          'user-123',
          expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), // ISO date format
        ])
      );
    });
  });

  describe('unauthorized requests', () => {
    it('should return 401 when no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const request = createGetRequest('/api/invoice/check-recent');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error', 'Unauthorized');
    });

    it('should return 401 when session has no user', async () => {
      mockGetSession.mockResolvedValue({ session: {}, user: null });

      const request = createGetRequest('/api/invoice/check-recent');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error', 'Unauthorized');
    });
  });

  describe('error handling', () => {
    it('should return 500 when database query fails', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockQueryOne.mockRejectedValue(new Error('Database error'));

      const request = createGetRequest('/api/invoice/check-recent');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error', 'Failed to check recent invoice');
    });
  });

  describe('edge cases', () => {
    it('should only query user_invoices table and not orders table', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      // user_invoices returns null
      mockQueryOne.mockResolvedValueOnce(null);
      // user_profiles returns null (not exempt)
      mockQueryOne.mockResolvedValueOnce(null);

      const request = createGetRequest('/api/invoice/check-recent');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('hasRecentInvoice', false);
      // Verify the first query is to user_invoices (not orders table)
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('FROM user_invoices'),
        expect.any(Array)
      );
    });

    it('should return the most recent invoice when multiple exist', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      // The SQL query orders by date DESC and limits to 1, so it returns the most recent
      const recentDate = new Date();
      recentDate.setMonth(recentDate.getMonth() - 1); // 1 month ago

      // Mock user_invoices format (checked first)
      const mockUserInvoice = {
        id: 'invoice-recent',
        file_url: 'https://example.com/recent_invoice.pdf',
        state: 'NY',
        created_at: recentDate.toISOString(),
        filename: 'recent_invoice.pdf',
        file_type: 'application/pdf',
      };

      mockQueryOne.mockResolvedValueOnce(mockUserInvoice);

      const request = createGetRequest('/api/invoice/check-recent');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.recentInvoice.invoice_filename).toBe('recent_invoice.pdf');
      expect(data.recentInvoice.invoice_state).toBe('NY');
    });
  });
});
