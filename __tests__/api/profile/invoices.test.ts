import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, PATCH } from '@/app/api/profile/invoices/route';
import {
  createGetRequest,
  createPostRequest,
  createPatchRequest,
  parseJsonResponse,
} from '../helpers/request-helpers';
import { createMockSession } from '../helpers/auth-mock';

// Mock the database and auth with vi.hoisted
const { mockQuery, mockQueryOne, mockGetSession } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
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
    upload: { limit: 10, window: 60 },
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

// Mock S3 presigned URL generation
const { mockGeneratePresignedUploadUrl } = vi.hoisted(() => ({
  mockGeneratePresignedUploadUrl: vi.fn(),
}));

vi.mock('@/lib/s3', () => ({
  generatePresignedUploadUrl: mockGeneratePresignedUploadUrl,
}));

describe('GET /api/profile/invoices', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockGetSession.mockReset();
  });

  describe('authenticated requests', () => {
    it('should return empty array when user has no invoices', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);
      mockQuery.mockResolvedValue([]);

      const request = createGetRequest('/api/profile/invoices');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('invoices');
      expect(data.invoices).toEqual([]);
    });

    it('should return list of invoices for authenticated user', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const mockInvoices = [
        {
          id: 'inv-1',
          user_id: 'user-123',
          state: 'CA',
          file_url: 'https://example.com/invoice1.pdf',
          filename: 'invoice1.pdf',
          file_type: 'application/pdf',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'inv-2',
          user_id: 'user-123',
          state: 'TX',
          file_url: 'https://example.com/invoice2.pdf',
          filename: 'invoice2.pdf',
          file_type: 'application/pdf',
          created_at: '2025-01-02T00:00:00Z',
          updated_at: '2025-01-02T00:00:00Z',
        },
      ];
      mockQuery.mockResolvedValue(mockInvoices);

      const request = createGetRequest('/api/profile/invoices');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.invoices).toHaveLength(2);
      expect(data.invoices[0]).toHaveProperty('id', 'inv-1');
      expect(data.invoices[0]).toHaveProperty('state', 'CA');
      expect(data.invoices[0]).toHaveProperty('fileUrl', 'https://example.com/invoice1.pdf');
      expect(data.invoices[1]).toHaveProperty('id', 'inv-2');
      expect(data.invoices[1]).toHaveProperty('state', 'TX');
    });

    it('should only return invoices for the authenticated user', async () => {
      const mockSession = createMockSession({ id: 'specific-user-id' });
      mockGetSession.mockResolvedValue(mockSession);
      mockQuery.mockResolvedValue([]);

      const request = createGetRequest('/api/profile/invoices');
      await GET(request);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        ['specific-user-id']
      );
    });
  });

  describe('unauthorized requests', () => {
    it('should return 401 when no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const request = createGetRequest('/api/profile/invoices');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error', 'Unauthorized');
    });

    it('should return 401 when session has no user', async () => {
      mockGetSession.mockResolvedValue({ session: {}, user: null });

      const request = createGetRequest('/api/profile/invoices');
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

      const request = createGetRequest('/api/profile/invoices');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error', 'Failed to fetch invoices');
    });
  });
});

describe('POST /api/profile/invoices', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockGetSession.mockReset();
    mockGeneratePresignedUploadUrl.mockReset();
  });

  describe('authenticated requests', () => {
    it('should generate presigned URL for valid upload request', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockGeneratePresignedUploadUrl.mockResolvedValue({
        uploadUrl: 'https://s3.example.com/presigned-upload',
        publicUrl: 'https://s3.example.com/invoice-uploads/user-123/invoice.pdf',
      });

      const request = createPostRequest('/api/profile/invoices', {
        fileName: 'farm_invoice.pdf',
        contentType: 'application/pdf',
        size: 1000000,
        state: 'CA',
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('uploadUrl');
      expect(data).toHaveProperty('publicUrl');
      expect(data).toHaveProperty('key');
      expect(data).toHaveProperty('state', 'CA');
      expect(data.key).toContain('invoice-uploads/user-123/');
    });

    it('should sanitize filename to prevent path traversal', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockGeneratePresignedUploadUrl.mockResolvedValue({
        uploadUrl: 'https://s3.example.com/presigned-upload',
        publicUrl: 'https://s3.example.com/invoice-uploads/user-123/invoice.pdf',
      });

      const request = createPostRequest('/api/profile/invoices', {
        fileName: '../../../etc/passwd.pdf',
        contentType: 'application/pdf',
        size: 1000000,
        state: 'CA',
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      // Filename should be sanitized - slashes are replaced with underscores
      expect(data.key).not.toContain('/etc/');
      expect(data.key).not.toMatch(/\/\.\.\//); // No path traversal patterns
      expect(data.key).toContain('invoice-uploads/user-123/');
    });

    it('should accept image file types', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockGeneratePresignedUploadUrl.mockResolvedValue({
        uploadUrl: 'https://s3.example.com/presigned-upload',
        publicUrl: 'https://s3.example.com/invoice-uploads/user-123/invoice.jpg',
      });

      const request = createPostRequest('/api/profile/invoices', {
        fileName: 'invoice.jpg',
        contentType: 'image/jpeg',
        size: 1000000,
        state: 'TX',
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('uploadUrl');
    });

    it('should return error when S3 presigned URL generation fails', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockGeneratePresignedUploadUrl.mockResolvedValue({
        error: 'S3 configuration error',
      });

      const request = createPostRequest('/api/profile/invoices', {
        fileName: 'invoice.pdf',
        contentType: 'application/pdf',
        size: 1000000,
        state: 'CA',
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'S3 configuration error');
    });
  });

  describe('validation', () => {
    it('should return 400 for invalid state code', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const request = createPostRequest('/api/profile/invoices', {
        fileName: 'invoice.pdf',
        contentType: 'application/pdf',
        size: 1000000,
        state: 'INVALID',
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Validation failed');
    });

    it('should return 400 for file too large', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const request = createPostRequest('/api/profile/invoices', {
        fileName: 'invoice.pdf',
        contentType: 'application/pdf',
        size: 100000000, // 100MB - way too large
        state: 'CA',
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Validation failed');
    });

    it('should return 400 for invalid content type', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const request = createPostRequest('/api/profile/invoices', {
        fileName: 'invoice.exe',
        contentType: 'application/x-msdownload',
        size: 1000000,
        state: 'CA',
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('unauthorized requests', () => {
    it('should return 401 when no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const request = createPostRequest('/api/profile/invoices', {
        fileName: 'invoice.pdf',
        contentType: 'application/pdf',
        size: 1000000,
        state: 'CA',
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error', 'Unauthorized');
    });
  });

  describe('error handling', () => {
    it('should return 500 when an unexpected error occurs', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockGeneratePresignedUploadUrl.mockRejectedValue(new Error('Unexpected error'));

      const request = createPostRequest('/api/profile/invoices', {
        fileName: 'invoice.pdf',
        contentType: 'application/pdf',
        size: 1000000,
        state: 'CA',
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error', 'Failed to generate upload URL');
    });
  });
});

describe('PATCH /api/profile/invoices', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockGetSession.mockReset();
  });

  describe('authenticated requests', () => {
    it('should save invoice to database after upload confirmation', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const mockInvoice = {
        id: 'inv-new',
        user_id: 'user-123',
        state: 'CA',
        file_url: 'https://s3.example.com/invoice.pdf',
        filename: 'invoice.pdf',
        file_type: 'application/pdf',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      mockQueryOne.mockResolvedValue(mockInvoice);

      const request = createPatchRequest('/api/profile/invoices', {
        invoiceUrl: 'https://s3.example.com/invoice.pdf',
        state: 'CA',
        filename: 'invoice.pdf',
        fileType: 'application/pdf',
      });

      const response = await PATCH(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('invoice');
      expect(data.invoice).toHaveProperty('id', 'inv-new');
      expect(data.invoice).toHaveProperty('state', 'CA');
      expect(data.invoice).toHaveProperty('fileUrl', 'https://s3.example.com/invoice.pdf');
    });

    it('should insert invoice with correct user ID', async () => {
      const mockSession = createMockSession({ id: 'specific-user-id' });
      mockGetSession.mockResolvedValue(mockSession);
      mockQueryOne.mockResolvedValue({
        id: 'inv-new',
        user_id: 'specific-user-id',
        state: 'TX',
        file_url: 'https://s3.example.com/invoice.pdf',
        filename: 'invoice.pdf',
        file_type: 'application/pdf',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      });

      const request = createPatchRequest('/api/profile/invoices', {
        invoiceUrl: 'https://s3.example.com/invoice.pdf',
        state: 'TX',
        filename: 'invoice.pdf',
        fileType: 'application/pdf',
      });

      await PATCH(request);

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_invoices'),
        expect.arrayContaining(['specific-user-id', 'TX'])
      );
    });
  });

  describe('validation', () => {
    it('should return 400 for missing required fields', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const request = createPatchRequest('/api/profile/invoices', {
        invoiceUrl: 'https://s3.example.com/invoice.pdf',
        // Missing state, filename, fileType
      });

      const response = await PATCH(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Validation failed');
    });

    it('should return 400 for invalid state code', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const request = createPatchRequest('/api/profile/invoices', {
        invoiceUrl: 'https://s3.example.com/invoice.pdf',
        state: 'INVALID',
        filename: 'invoice.pdf',
        fileType: 'application/pdf',
      });

      const response = await PATCH(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Validation failed');
    });

    it('should return 400 for invalid URL', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const request = createPatchRequest('/api/profile/invoices', {
        invoiceUrl: 'not-a-valid-url',
        state: 'CA',
        filename: 'invoice.pdf',
        fileType: 'application/pdf',
      });

      const response = await PATCH(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('unauthorized requests', () => {
    it('should return 401 when no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const request = createPatchRequest('/api/profile/invoices', {
        invoiceUrl: 'https://s3.example.com/invoice.pdf',
        state: 'CA',
        filename: 'invoice.pdf',
        fileType: 'application/pdf',
      });

      const response = await PATCH(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error', 'Unauthorized');
    });
  });

  describe('error handling', () => {
    it('should return 500 when database insert fails', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);
      mockQueryOne.mockRejectedValue(new Error('Database error'));

      const request = createPatchRequest('/api/profile/invoices', {
        invoiceUrl: 'https://s3.example.com/invoice.pdf',
        state: 'CA',
        filename: 'invoice.pdf',
        fileType: 'application/pdf',
      });

      const response = await PATCH(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error', 'Failed to save invoice');
    });
  });
});
