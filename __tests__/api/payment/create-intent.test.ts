import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/payment/create-intent/route';
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
    moderate: {},
    relaxed: {},
  },
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  createRateLimitResponse: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  createOrGetStripeCustomer: vi.fn().mockResolvedValue('cus_test123'),
  createPaymentIntent: vi.fn().mockResolvedValue({
    paymentIntent: { id: 'pi_test123' },
    clientSecret: 'pi_test123_secret_test',
  }),
}));

vi.mock('@/lib/order-validation', () => ({
  validateOrder: vi.fn().mockResolvedValue({
    valid: true,
    serverTotal: 100,
    clientTotal: 100,
    priceMismatch: false,
    inventoryIssues: false,
    items: [],
    errors: [],
    warnings: [],  // Required by the route
  }),
}));

vi.mock('@/lib/security-logger', () => ({
  securityLogger: {
    logEvent: vi.fn(),
    logError: vi.fn(),
    logValidationFailure: vi.fn(),
    logSuspiciousActivity: vi.fn(),
  },
}));

vi.mock('@/lib/tax', () => ({
  calculateTax: vi.fn().mockResolvedValue(8),
  getTaxRateForState: vi.fn().mockResolvedValue(0.08),
}));

vi.mock('@/lib/db', () => ({
  pool: {},
  queryOne: vi.fn().mockResolvedValue({
    value: [
      { id: 'standard', name: 'Standard Shipping', price: 9.99, days: '5-7' },
      { id: 'express', name: 'Express Shipping', price: 19.99, days: '2-3' },
    ],
  }),
  query: vi.fn().mockResolvedValue([]), // For warehouse inventory queries
}));

vi.mock('@/lib/shipping-calculation', () => ({
  calculateShippingFee: vi.fn().mockReturnValue(9.99), // Match the test's deliveryFee
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

describe('Payment Intent Creation API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create payment intent for authenticated user', async () => {
    const { auth } = await import('@/lib/auth');
    vi.mocked(auth.api.getSession).mockResolvedValue(
      createMockSession({ id: 'user123', email: 'test@example.com', name: 'Test User' })
    );

    const request = new NextRequest('http://localhost:3000/api/payment/create-intent', {
      method: 'POST',
      body: JSON.stringify({
        amount: 117.99, // 100 (items) + 9.99 (delivery) + 8 (tax)
        items: [
          {
            productId: '550e8400-e29b-41d4-a716-446655440000',
            quantity: 1,
            price: 100,
            name: 'Test Product',
          },
        ],
        deliveryFee: 9.99,
        tax: 8,
        deliveryMethod: 'standard',
        state: 'CA',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    // Debug: log data if status is not 200
    if (response.status !== 200) {
      console.log('Error response:', data);
    }

    expect(response.status).toBe(200);
    expect(data.clientSecret).toBeDefined();
    expect(data.paymentIntentId).toBe('pi_test123');
  });

  it('should reject unauthenticated requests', async () => {
    const { auth } = await import('@/lib/auth');
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/payment/create-intent', {
      method: 'POST',
      body: JSON.stringify({
        amount: 100,
        items: [],
        deliveryFee: 0,
        tax: 0,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('should reject invalid request data', async () => {
    const { auth } = await import('@/lib/auth');
    vi.mocked(auth.api.getSession).mockResolvedValue(
      createMockSession({ id: 'user123', email: 'test@example.com' })
    );

    const request = new NextRequest('http://localhost:3000/api/payment/create-intent', {
      method: 'POST',
      body: JSON.stringify({
        // Missing required fields
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});

