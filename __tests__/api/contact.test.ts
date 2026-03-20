import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/contact/route';
import { createPostRequest, parseJsonResponse } from './helpers/request-helpers';
import { createMockSession } from './helpers/auth-mock';

// Mock the database and auth with vi.hoisted
const { mockQueryOne, mockGetSession, mockVerifyRecaptcha } = vi.hoisted(() => ({
  mockQueryOne: vi.fn(),
  mockGetSession: vi.fn(),
  mockVerifyRecaptcha: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  queryOne: mockQueryOne,
}));

// Mock headers function
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// Mock auth
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: () => mockGetSession(),
    },
  },
}));

// Mock reCAPTCHA verification -- defaults to passing
vi.mock('@/lib/recaptcha', () => ({
  verifyRecaptcha: (...args: unknown[]) => mockVerifyRecaptcha(...args),
  SCORE_THRESHOLD: 0.5,
}));

describe('POST /api/contact', () => {
  beforeEach(() => {
    mockQueryOne.mockReset();
    mockGetSession.mockReset();
    mockVerifyRecaptcha.mockReset();
    mockVerifyRecaptcha.mockResolvedValue({ success: true, score: 0.9 });
  });

  describe('valid submissions', () => {
    it('should create contact submission from guest user', async () => {
      const mockSubmission = {
        id: 'submission-1',
        user_id: null,
        name: 'John Doe',
        email: 'john@example.com',
        phone: '555-123-4567',
        subject: 'Product Inquiry',
        message: 'I have a question about your products',
        status: 'new',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockQueryOne.mockResolvedValue(mockSubmission);
      mockGetSession.mockResolvedValue(null);

      const requestBody = {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '555-123-4567',
        subject: 'Product Inquiry',
        message: 'I have a question about your products',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('submission');
      expect(data.submission).toHaveProperty('id');
      expect(data.submission).toHaveProperty('message');
    });

    it('should create contact submission from authenticated user', async () => {
      const mockSession = createMockSession({ id: 'auth-user-123' });
      
      const mockSubmission = {
        id: 'submission-2',
        user_id: 'auth-user-123',
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: null,
        subject: 'Support Request',
        message: 'Need help with my order',
        status: 'new',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockQueryOne.mockResolvedValue(mockSubmission);
      mockGetSession.mockResolvedValue(mockSession);

      const requestBody = {
        name: 'Jane Smith',
        email: 'jane@example.com',
        subject: 'Support Request',
        message: 'Need help with my order',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should handle submission without phone number', async () => {
      const mockSubmission = {
        id: 'submission-3',
        user_id: null,
        name: 'Bob Wilson',
        email: 'bob@example.com',
        phone: null,
        subject: 'General Inquiry',
        message: 'Just a general question',
        status: 'new',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockQueryOne.mockResolvedValue(mockSubmission);
      mockGetSession.mockResolvedValue(null);

      const requestBody = {
        name: 'Bob Wilson',
        email: 'bob@example.com',
        subject: 'General Inquiry',
        message: 'Just a general question',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should include success message in response', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'submission-4',
        user_id: null,
        name: 'Test User',
        email: 'test@example.com',
        phone: null,
        subject: 'Test',
        message: 'Test message',
        status: 'new',
        created_at: '2024-01-01T00:00:00Z',
      });
      mockGetSession.mockResolvedValue(null);

      const requestBody = {
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Test',
        message: 'Test message',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.submission.message).toBe(
        'Your message has been sent successfully. We will get back to you shortly.'
      );
    });
  });

  describe('validation errors', () => {
    it('should return 400 when name is missing', async () => {
      const requestBody = {
        email: 'test@example.com',
        subject: 'Test',
        message: 'Test message',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Validation failed');
    });

    it('should return 400 when email is missing', async () => {
      const requestBody = {
        name: 'John Doe',
        subject: 'Test',
        message: 'Test message',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
    });

    it('should return 400 when subject is missing', async () => {
      const requestBody = {
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Test message',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
    });

    it('should return 400 when message is missing', async () => {
      const requestBody = {
        name: 'John Doe',
        email: 'john@example.com',
        subject: 'Test Subject',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
    });

    it('should return 400 when all fields are missing', async () => {
      const requestBody = {};

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
    });
  });

  describe('email validation', () => {
    it('should return 400 for invalid email format', async () => {
      const requestBody = {
        name: 'John Doe',
        email: 'invalid-email',
        subject: 'Test',
        message: 'Test message',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Validation failed');
    });

    it('should reject email without @ symbol', async () => {
      const requestBody = {
        name: 'John Doe',
        email: 'johnexample.com',
        subject: 'Test',
        message: 'Test message',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
    });

    it('should reject email without domain', async () => {
      const requestBody = {
        name: 'John Doe',
        email: 'john@',
        subject: 'Test',
        message: 'Test message',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
    });

    it('should accept valid email formats', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'submission-5',
        user_id: null,
        name: 'Test',
        email: 'test@example.com',
        phone: null,
        subject: 'Test',
        message: 'Test',
        status: 'new',
        created_at: '2024-01-01T00:00:00Z',
      });
      mockGetSession.mockResolvedValue(null);

      const validEmails = [
        'test@example.com',
        'user.name@example.co.uk',
        'user+tag@example.org',
        'user_name@sub.example.com',
      ];

      for (const email of validEmails) {
        const requestBody = {
          name: 'Test User',
          email,
          subject: 'Test',
          message: 'Test message',
        };

        const request = createPostRequest('/api/contact', requestBody);
        const response = await POST(request);

        expect(response.status).toBe(200);
      }
    }, 25000);
  });

  describe('optional phone field', () => {
    it('should accept submission with phone number', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'submission-6',
        user_id: null,
        name: 'Test',
        email: 'test@example.com',
        phone: '555-123-4567',
        subject: 'Test',
        message: 'Test',
        status: 'new',
        created_at: '2024-01-01T00:00:00Z',
      });
      mockGetSession.mockResolvedValue(null);

      const requestBody = {
        name: 'Test User',
        email: 'test@example.com',
        phone: '555-123-4567',
        subject: 'Test',
        message: 'Test message',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should accept submission without phone number', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'submission-7',
        user_id: null,
        name: 'Test',
        email: 'test@example.com',
        phone: null,
        subject: 'Test',
        message: 'Test',
        status: 'new',
        created_at: '2024-01-01T00:00:00Z',
      });
      mockGetSession.mockResolvedValue(null);

      const requestBody = {
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Test',
        message: 'Test message',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should treat empty phone string as null', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'submission-8',
        user_id: null,
        name: 'Test',
        email: 'test@example.com',
        phone: null,
        subject: 'Test',
        message: 'Test',
        status: 'new',
        created_at: '2024-01-01T00:00:00Z',
      });
      mockGetSession.mockResolvedValue(null);

      const requestBody = {
        name: 'Test User',
        email: 'test@example.com',
        phone: '',
        subject: 'Test',
        message: 'Test message',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe('error handling', () => {
    it('should return 500 when database insert fails', async () => {
      mockQueryOne.mockRejectedValue(new Error('Database insert failed'));
      mockGetSession.mockResolvedValue(null);

      const requestBody = {
        name: 'John Doe',
        email: 'john@example.com',
        subject: 'Test',
        message: 'Test message',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Failed to submit contact form');
    });

    it('should return 500 when queryOne returns null', async () => {
      mockQueryOne.mockResolvedValue(null);
      mockGetSession.mockResolvedValue(null);

      const requestBody = {
        name: 'John Doe',
        email: 'john@example.com',
        subject: 'Test',
        message: 'Test message',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to submit contact form');
    });
  });

  describe('auth session handling', () => {
    it('should handle auth session error gracefully', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'submission-9',
        user_id: null,
        name: 'Test',
        email: 'test@example.com',
        phone: null,
        subject: 'Test',
        message: 'Test',
        status: 'new',
        created_at: '2024-01-01T00:00:00Z',
      });
      
      // Mock auth to throw error
      mockGetSession.mockRejectedValue(new Error('Auth service unavailable'));

      const requestBody = {
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Test',
        message: 'Test message',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      // Should still succeed as guest submission
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('honeypot protection', () => {
    it('should return fake success when honeypot field is filled', async () => {
      const requestBody = {
        name: 'Bot User',
        email: 'bot@example.com',
        subject: 'Spam',
        message: 'Buy our products now!!!',
        website: 'http://spam-site.com',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.submission).toHaveProperty('id', 'ok');
      // Database should NOT have been called
      expect(mockQueryOne).not.toHaveBeenCalled();
    });

    it('should proceed normally when honeypot field is empty', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'submission-hp-1',
        user_id: null,
        name: 'Real User',
        email: 'real@example.com',
        phone: null,
        subject: 'Test',
        message: 'Genuine message from a real user',
        status: 'new',
        created_at: '2024-01-01T00:00:00Z',
      });
      mockGetSession.mockResolvedValue(null);

      const requestBody = {
        name: 'Real User',
        email: 'real@example.com',
        subject: 'Test',
        message: 'Genuine message from a real user',
        website: '',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.submission.id).not.toBe('ok');
      expect(mockQueryOne).toHaveBeenCalled();
    });
  });

  describe('reCAPTCHA verification', () => {
    it('should reject submissions with low reCAPTCHA score', async () => {
      mockVerifyRecaptcha.mockResolvedValue({ success: true, score: 0.2 });

      const requestBody = {
        name: 'Suspicious User',
        email: 'suspicious@example.com',
        subject: 'Test',
        message: 'Automated bot message',
        recaptchaToken: 'low-score-token',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(403);
      expect(data.error).toBe('Verification failed. Please try again.');
      expect(mockQueryOne).not.toHaveBeenCalled();
    });

    it('should reject submissions when reCAPTCHA verification fails', async () => {
      mockVerifyRecaptcha.mockResolvedValue({ success: false, score: 0 });

      const requestBody = {
        name: 'Bot User',
        email: 'bot@example.com',
        subject: 'Test',
        message: 'Automated spam message',
        recaptchaToken: 'invalid-token',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(403);
      expect(data.error).toBe('Verification failed. Please try again.');
    });

    it('should accept submissions with high reCAPTCHA score', async () => {
      mockVerifyRecaptcha.mockResolvedValue({ success: true, score: 0.9 });
      mockQueryOne.mockResolvedValue({
        id: 'submission-rc-1',
        user_id: null,
        name: 'Good User',
        email: 'good@example.com',
        phone: null,
        subject: 'Test',
        message: 'Legitimate contact request',
        status: 'new',
        created_at: '2024-01-01T00:00:00Z',
      });
      mockGetSession.mockResolvedValue(null);

      const requestBody = {
        name: 'Good User',
        email: 'good@example.com',
        subject: 'Test',
        message: 'Legitimate contact request',
        recaptchaToken: 'good-token',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should gracefully degrade when reCAPTCHA is not configured', async () => {
      mockVerifyRecaptcha.mockResolvedValue({ success: true, score: 1.0 });
      mockQueryOne.mockResolvedValue({
        id: 'submission-rc-2',
        user_id: null,
        name: 'Test User',
        email: 'test@example.com',
        phone: null,
        subject: 'Test',
        message: 'Message without recaptcha',
        status: 'new',
        created_at: '2024-01-01T00:00:00Z',
      });
      mockGetSession.mockResolvedValue(null);

      const requestBody = {
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Test',
        message: 'Message without recaptcha',
      };

      const request = createPostRequest('/api/contact', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockVerifyRecaptcha).toHaveBeenCalledWith('', expect.anything());
    });
  });
});

