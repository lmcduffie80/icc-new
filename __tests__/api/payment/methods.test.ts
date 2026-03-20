import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, DELETE } from '@/app/api/payment/methods/route';
import { NextRequest } from 'next/server';
import { createMockSession } from '../helpers/auth-mock';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimiters: {
    lenient: {},
    moderate: {},
  },
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  createRateLimitResponse: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  createOrGetStripeCustomer: vi.fn().mockResolvedValue('cus_test123'),
  listPaymentMethods: vi.fn().mockResolvedValue([]),
  createSetupIntent: vi.fn().mockResolvedValue({
    setupIntent: { id: 'seti_test123' },
    clientSecret: 'seti_test123_secret_test',
  }),
  detachPaymentMethod: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/db', () => ({
  query: vi.fn().mockResolvedValue([]),
  queryOne: vi.fn().mockResolvedValue({
    value: {
      stripe_enabled: true,
      allow_saved_cards: true,
      send_receipt_emails: true,
      min_order_amount: 10,
      max_order_amount: 10000,
    },
  }),
}));

vi.mock('@/lib/security-logger', () => ({
  securityLogger: {
    logEvent: vi.fn(),
    logError: vi.fn(),
    logRateLimitExceeded: vi.fn(),
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

describe('Payment Methods API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/payment/methods', () => {
    it('should list payment methods for authenticated user', async () => {
      const { auth } = await import('@/lib/auth');
      vi.mocked(auth.api.getSession).mockResolvedValue(
        createMockSession({ id: 'user123', email: 'test@example.com' })
      );

      const request = new NextRequest('http://localhost:3000/api/payment/methods');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.paymentMethods).toBeDefined();
      expect(Array.isArray(data.paymentMethods)).toBe(true);
    });

    it('should reject unauthenticated requests', async () => {
      const { auth } = await import('@/lib/auth');
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/payment/methods');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/payment/methods', () => {
    it('should create setup intent for authenticated user', async () => {
      const { auth } = await import('@/lib/auth');
      vi.mocked(auth.api.getSession).mockResolvedValue(
        createMockSession({ id: 'user123', email: 'test@example.com' })
      );

      const request = new NextRequest('http://localhost:3000/api/payment/methods', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.clientSecret).toBeDefined();
      expect(data.setupIntentId).toBe('seti_test123');
    });
  });

  describe('DELETE /api/payment/methods', () => {
    it('should remove payment method for authenticated user', async () => {
      const { auth } = await import('@/lib/auth');
      const { query } = await import('@/lib/db');

      vi.mocked(auth.api.getSession).mockResolvedValue(
        createMockSession({ id: 'user123', email: 'test@example.com' })
      );

      // Mock that payment method exists
      vi.mocked(query).mockResolvedValueOnce([
        {
          id: 'pm_db123',
          user_id: 'user123',
          stripe_payment_method_id: 'pm_test123',
        },
      ]);

      const request = new NextRequest('http://localhost:3000/api/payment/methods', {
        method: 'DELETE',
        body: JSON.stringify({
          paymentMethodId: 'pm_test123',
        }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should return 404 if payment method not found', async () => {
      const { auth } = await import('@/lib/auth');
      const { query } = await import('@/lib/db');

      vi.mocked(auth.api.getSession).mockResolvedValue(
        createMockSession({ id: 'user123', email: 'test@example.com' })
      );

      // Mock that payment method doesn't exist
      vi.mocked(query).mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost:3000/api/payment/methods', {
        method: 'DELETE',
        body: JSON.stringify({
          paymentMethodId: 'pm_test123',
        }),
      });

      const response = await DELETE(request);

      expect(response.status).toBe(404);
    });
  });
});

