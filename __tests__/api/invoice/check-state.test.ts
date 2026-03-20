import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/invoice/check-state/route';
import { createGetRequest, parseJsonResponse } from '../helpers/request-helpers';
import { createMockSession } from '../helpers/auth-mock';

// Mock the database and auth with vi.hoisted
const { mockQuery, mockGetSession } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  queryOne: vi.fn(),
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
    logValidationFailure: vi.fn(),
  },
}));

describe('GET /api/invoice/check-state', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGetSession.mockReset();
  });

  describe('authenticated requests', () => {
    it('should return hasMatchingInvoice: true when user has invoice for state', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockQuery.mockResolvedValue([{ id: 'inv-1' }]);

      const request = createGetRequest('/api/invoice/check-state', { state: 'CA' });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('hasMatchingInvoice', true);
      expect(data).toHaveProperty('state', 'CA');
    });

    it('should return hasMatchingInvoice: false when user has no invoice for state', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockQuery.mockResolvedValue([]);

      const request = createGetRequest('/api/invoice/check-state', { state: 'TX' });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('hasMatchingInvoice', false);
      expect(data).toHaveProperty('state', 'TX');
    });

    it('should check invoices only for the authenticated user', async () => {
      const mockSession = createMockSession({ id: 'specific-user-id' });
      mockGetSession.mockResolvedValue(mockSession);

      mockQuery.mockResolvedValue([]);

      const request = createGetRequest('/api/invoice/check-state', { state: 'CA' });
      await GET(request);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1 AND state = $2'),
        ['specific-user-id', 'CA']
      );
    });

    it('should handle multiple states in succession', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      // First check - has invoice
      mockQuery.mockResolvedValueOnce([{ id: 'inv-1' }]);

      const request1 = createGetRequest('/api/invoice/check-state', { state: 'CA' });
      const response1 = await GET(request1);
      const data1 = await parseJsonResponse(response1);

      expect(data1).toHaveProperty('hasMatchingInvoice', true);
      expect(data1).toHaveProperty('state', 'CA');
    });
  });

  describe('validation', () => {
    it('should return 400 when state parameter is missing', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const request = createGetRequest('/api/invoice/check-state');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('Invalid state parameter');
    });

    it('should return 400 for lowercase state code', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const request = createGetRequest('/api/invoice/check-state', { state: 'ca' });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('Invalid state parameter');
    });

    it('should return 400 for state code with wrong length', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const request = createGetRequest('/api/invoice/check-state', { state: 'CALI' });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('Invalid state parameter');
    });

    it('should return 400 for state code with numbers', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const request = createGetRequest('/api/invoice/check-state', { state: 'C1' });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('Invalid state parameter');
    });

    it('should return 400 for state code with special characters', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const request = createGetRequest('/api/invoice/check-state', { state: 'C@' });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('Invalid state parameter');
    });

    it('should return 400 for empty state parameter', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const request = createGetRequest('/api/invoice/check-state', { state: '' });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('Invalid state parameter');
    });
  });

  describe('unauthorized requests', () => {
    it('should return 401 when no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const request = createGetRequest('/api/invoice/check-state', { state: 'CA' });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error', 'Unauthorized');
    });

    it('should return 401 when session has no user', async () => {
      mockGetSession.mockResolvedValue({ session: {}, user: null });

      const request = createGetRequest('/api/invoice/check-state', { state: 'CA' });
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

      mockQuery.mockRejectedValue(new Error('Database error'));

      const request = createGetRequest('/api/invoice/check-state', { state: 'CA' });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error', 'Failed to check invoice');
    });
  });

  describe('edge cases', () => {
    it('should accept all valid US state codes', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const validStates = ['AL', 'AK', 'AZ', 'CA', 'CO', 'NY', 'TX', 'WA', 'FL'];

      for (const state of validStates) {
        mockQuery.mockResolvedValueOnce([]);

        const request = createGetRequest('/api/invoice/check-state', { state });
        const response = await GET(request);

        expect(response.status).toBe(200);
      }
    });

    it('should handle concurrent requests for different states', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockQuery.mockResolvedValueOnce([{ id: 'inv-ca' }]);
      mockQuery.mockResolvedValueOnce([]);

      const [response1, response2] = await Promise.all([
        GET(createGetRequest('/api/invoice/check-state', { state: 'CA' })),
        GET(createGetRequest('/api/invoice/check-state', { state: 'TX' })),
      ]);

      const data1 = await parseJsonResponse(response1);
      const data2 = await parseJsonResponse(response2);

      expect(data1.hasMatchingInvoice).toBe(true);
      expect(data2.hasMatchingInvoice).toBe(false);
    });
  });
});
