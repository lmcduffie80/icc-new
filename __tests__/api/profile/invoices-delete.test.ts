import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DELETE } from '@/app/api/profile/invoices/[id]/route';
import { createDeleteRequest, parseJsonResponse } from '../helpers/request-helpers';
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
    moderate: { limit: 20, window: 60 },
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

// Mock S3 delete function
const { mockDeleteFromS3, mockGetKeyFromUrl } = vi.hoisted(() => ({
  mockDeleteFromS3: vi.fn(),
  mockGetKeyFromUrl: vi.fn(),
}));

vi.mock('@/lib/s3', () => ({
  deleteFromS3: mockDeleteFromS3,
  getKeyFromUrl: mockGetKeyFromUrl,
}));

// Helper function to create DELETE request with params
async function callDelete(id: string): Promise<Response> {
  const request = createDeleteRequest(`/api/profile/invoices/${id}`);
  return DELETE(request, { params: Promise.resolve({ id }) });
}

describe('DELETE /api/profile/invoices/[id]', () => {
  beforeEach(() => {
    mockQueryOne.mockReset();
    mockGetSession.mockReset();
    mockDeleteFromS3.mockReset();
    mockGetKeyFromUrl.mockReset();
  });

  describe('authenticated requests', () => {
    it('should delete invoice owned by user', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const invoiceId = '550e8400-e29b-41d4-a716-446655440000';
      const mockInvoice = {
        id: invoiceId,
        user_id: 'user-123',
        file_url: 'https://s3.example.com/invoice-uploads/user-123/invoice.pdf',
      };

      // First query returns the invoice
      mockQueryOne.mockResolvedValueOnce(mockInvoice);
      // Second query deletes the invoice
      mockQueryOne.mockResolvedValueOnce(null);

      mockGetKeyFromUrl.mockReturnValue('invoice-uploads/user-123/invoice.pdf');
      mockDeleteFromS3.mockResolvedValue(undefined);

      const response = await callDelete(invoiceId);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('success', true);
    });

    it('should verify ownership before deleting', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const invoiceId = '550e8400-e29b-41d4-a716-446655440000';

      // First query returns null (no matching invoice for this user)
      mockQueryOne.mockResolvedValueOnce(null);

      const response = await callDelete(invoiceId);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(404);
      expect(data).toHaveProperty('error', 'Invoice not found');

      // Should have checked with user_id
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND user_id = $2'),
        [invoiceId, 'user-123']
      );
    });

    it('should delete file from S3 before deleting from database', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const invoiceId = '550e8400-e29b-41d4-a716-446655440000';
      const mockInvoice = {
        id: invoiceId,
        user_id: 'user-123',
        file_url: 'https://s3.example.com/invoice-uploads/user-123/invoice.pdf',
      };

      mockQueryOne.mockResolvedValueOnce(mockInvoice);
      mockQueryOne.mockResolvedValueOnce(null);
      mockGetKeyFromUrl.mockReturnValue('invoice-uploads/user-123/invoice.pdf');
      mockDeleteFromS3.mockResolvedValue(undefined);

      await callDelete(invoiceId);

      expect(mockGetKeyFromUrl).toHaveBeenCalledWith(mockInvoice.file_url);
      expect(mockDeleteFromS3).toHaveBeenCalledWith('invoice-uploads/user-123/invoice.pdf');
    });

    it('should continue with database deletion even if S3 delete fails', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const invoiceId = '550e8400-e29b-41d4-a716-446655440000';
      const mockInvoice = {
        id: invoiceId,
        user_id: 'user-123',
        file_url: 'https://s3.example.com/invoice-uploads/user-123/invoice.pdf',
      };

      mockQueryOne.mockResolvedValueOnce(mockInvoice);
      mockQueryOne.mockResolvedValueOnce(null);
      mockGetKeyFromUrl.mockReturnValue('invoice-uploads/user-123/invoice.pdf');
      mockDeleteFromS3.mockRejectedValue(new Error('S3 error'));

      const response = await callDelete(invoiceId);
      const data = await parseJsonResponse(response);

      // Should still succeed
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('success', true);

      // Database delete should have been called
      expect(mockQueryOne).toHaveBeenCalledTimes(2);
    });

    it('should handle invoice with no S3 key gracefully', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const invoiceId = '550e8400-e29b-41d4-a716-446655440000';
      const mockInvoice = {
        id: invoiceId,
        user_id: 'user-123',
        file_url: 'invalid-url',
      };

      mockQueryOne.mockResolvedValueOnce(mockInvoice);
      mockQueryOne.mockResolvedValueOnce(null);
      mockGetKeyFromUrl.mockReturnValue(null); // No valid key

      const response = await callDelete(invoiceId);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      // S3 delete should not be called
      expect(mockDeleteFromS3).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('should return 400 for invalid UUID format', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const response = await callDelete('not-a-valid-uuid');
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Invalid invoice ID');
    });

    it('should return 400 for empty ID', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const response = await callDelete('');
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Invalid invoice ID');
    });

    it('should return 400 for SQL injection attempt', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const response = await callDelete("'; DROP TABLE users; --");
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Invalid invoice ID');
    });
  });

  describe('unauthorized requests', () => {
    it('should return 401 when no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await callDelete('550e8400-e29b-41d4-a716-446655440000');
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error', 'Unauthorized');
    });

    it('should return 401 when session has no user', async () => {
      mockGetSession.mockResolvedValue({ session: {}, user: null });

      const response = await callDelete('550e8400-e29b-41d4-a716-446655440000');
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

      const response = await callDelete('550e8400-e29b-41d4-a716-446655440000');
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error', 'Failed to delete invoice');
    });

    it('should return 500 when database delete fails', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const invoiceId = '550e8400-e29b-41d4-a716-446655440000';
      const mockInvoice = {
        id: invoiceId,
        user_id: 'user-123',
        file_url: 'https://s3.example.com/invoice.pdf',
      };

      // First query succeeds
      mockQueryOne.mockResolvedValueOnce(mockInvoice);
      mockGetKeyFromUrl.mockReturnValue(null);
      // Second query (delete) fails
      mockQueryOne.mockRejectedValueOnce(new Error('Delete failed'));

      const response = await callDelete(invoiceId);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error', 'Failed to delete invoice');
    });
  });

  describe('edge cases', () => {
    it('should handle uppercase UUID', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const invoiceId = '550E8400-E29B-41D4-A716-446655440000';

      mockQueryOne.mockResolvedValueOnce(null);

      const response = await callDelete(invoiceId);

      // UUID validation should pass for uppercase
      expect(response.status).toBe(404); // Not found, but UUID is valid
    });

    it('should prevent accessing other users invoices', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const invoiceId = '550e8400-e29b-41d4-a716-446655440000';

      // Invoice exists but belongs to different user - query returns null due to user_id check
      mockQueryOne.mockResolvedValueOnce(null);

      const response = await callDelete(invoiceId);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(404);
      expect(data).toHaveProperty('error', 'Invoice not found');
    });
  });
});
