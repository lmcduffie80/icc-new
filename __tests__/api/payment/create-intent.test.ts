import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createMockSession } from '../helpers/auth-mock';
import type { Tenant } from '@/lib/tenant';

const { mockCreatePaymentIntent, mockGetTenantById } = vi.hoisted(() => ({
  mockCreatePaymentIntent: vi.fn(),
  mockGetTenantById: vi.fn(),
}));

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
  createPaymentIntent: mockCreatePaymentIntent,
}));

vi.mock('@/lib/tenant', () => ({
  getTenantById: mockGetTenantById,
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

import { POST } from '@/app/api/payment/create-intent/route';

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-1',
    slug: 'acme',
    name: 'Acme Co',
    logoUrl: null,
    primaryColor: '#16a34a',
    country: 'US',
    currency: 'usd',
    planId: null,
    billingType: 'subscription',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: 'active',
    trialEndsAt: null,
    billingCycle: null,
    isActive: true,
    mfaRequired: false,
    plan: null,
    paymentsMode: 'icc_managed',
    stripeConnectAccountId: null,
    commissionBps: 150,
    stripeConnectChargesEnabled: false,
    stripeConnectPayoutsEnabled: false,
    stripeConnectDetailsSubmitted: false,
    ...overrides,
  };
}

function makeRequest(url = 'http://localhost:3000/api/payment/create-intent') {
  return new NextRequest(url, {
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
}

describe('Payment Intent Creation API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreatePaymentIntent.mockResolvedValue({
      paymentIntent: { id: 'pi_test123' },
      clientSecret: 'pi_test123_secret_test',
    });
    mockGetTenantById.mockResolvedValue(null);
  });

  async function authenticate() {
    const { auth } = await import('@/lib/auth');
    vi.mocked(auth.api.getSession).mockResolvedValue(
      createMockSession({ id: 'user123', email: 'test@example.com', name: 'Test User' })
    );
  }

  it('should create payment intent for authenticated user', async () => {
    await authenticate();

    const response = await POST(makeRequest());
    const data = await response.json();

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
    await authenticate();

    const request = new NextRequest('http://localhost:3000/api/payment/create-intent', {
      method: 'POST',
      body: JSON.stringify({
        // Missing required fields
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  describe('Stripe Connect tenant routing', () => {
    it('CRITICAL REGRESSION: no tenant_id param → identical direct-charge call, no connect fields, no tenantId in metadata', async () => {
      await authenticate();

      const response = await POST(makeRequest());
      expect(response.status).toBe(200);

      expect(mockGetTenantById).not.toHaveBeenCalled();
      expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);
      const [, , metadata, options] = mockCreatePaymentIntent.mock.calls[0];

      // No tenantId key at all — not even undefined — to prove this is a byte-for-byte
      // identical call to the pre-Connect behavior for any caller that doesn't know
      // about tenant_id (i.e. ICC's own checkout).
      expect(Object.keys(metadata)).not.toContain('tenantId');
      expect(options.connect).toBeUndefined();
      expect(options).not.toHaveProperty('connect');
    });

    it('tenant_id resolves to a tenant with no Connect account → same direct-charge call, but metadata includes tenantId', async () => {
      await authenticate();
      mockGetTenantById.mockResolvedValue(
        makeTenant({ id: 'tenant-no-connect', stripeConnectAccountId: null })
      );

      const response = await POST(makeRequest('http://localhost:3000/api/payment/create-intent?tenant_id=tenant-no-connect'));
      expect(response.status).toBe(200);

      expect(mockGetTenantById).toHaveBeenCalledWith('tenant-no-connect');
      const [, , metadata, options] = mockCreatePaymentIntent.mock.calls[0];
      expect(metadata.tenantId).toBe('tenant-no-connect');
      expect(options.connect).toBeUndefined();
    });

    it('tenant_id resolves to a tenant with Connect account but charges disabled → 503, createPaymentIntent never called', async () => {
      await authenticate();
      mockGetTenantById.mockResolvedValue(
        makeTenant({
          id: 'tenant-not-ready',
          stripeConnectAccountId: 'acct_not_ready',
          stripeConnectChargesEnabled: false,
        })
      );

      const response = await POST(makeRequest('http://localhost:3000/api/payment/create-intent?tenant_id=tenant-not-ready'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({
        error: "This store's payment processing isn't fully set up yet. Please try again later.",
      });
      expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
    });

    it('icc_managed tenant with charges enabled → transfer_data destination + application_fee_amount, no on_behalf_of', async () => {
      await authenticate();
      mockGetTenantById.mockResolvedValue(
        makeTenant({
          id: 'tenant-managed',
          paymentsMode: 'icc_managed',
          stripeConnectAccountId: 'acct_managed_123',
          stripeConnectChargesEnabled: true,
          commissionBps: 150,
        })
      );

      const response = await POST(makeRequest('http://localhost:3000/api/payment/create-intent?tenant_id=tenant-managed'));
      expect(response.status).toBe(200);

      const [amount, , metadata, options] = mockCreatePaymentIntent.mock.calls[0];
      const amountCents = Math.round(amount * 100);

      expect(metadata.tenantId).toBe('tenant-managed');
      expect(options.connect.destinationAccountId).toBe('acct_managed_123');
      expect(options.connect.applicationFeeAmountCents).toBe(Math.round((amountCents * 150) / 10000));
      expect(options.connect.onBehalfOf).toBeUndefined();
    });

    it('own_stripe tenant with charges enabled → on_behalf_of set, no application_fee_amount', async () => {
      await authenticate();
      mockGetTenantById.mockResolvedValue(
        makeTenant({
          id: 'tenant-own-stripe',
          paymentsMode: 'own_stripe',
          stripeConnectAccountId: 'acct_own_123',
          stripeConnectChargesEnabled: true,
          commissionBps: 150,
        })
      );

      const response = await POST(makeRequest('http://localhost:3000/api/payment/create-intent?tenant_id=tenant-own-stripe'));
      expect(response.status).toBe(200);

      const [, , metadata, options] = mockCreatePaymentIntent.mock.calls[0];
      expect(metadata.tenantId).toBe('tenant-own-stripe');
      expect(options.connect.destinationAccountId).toBe('acct_own_123');
      expect(options.connect.onBehalfOf).toBe('acct_own_123');
      expect(options.connect.applicationFeeAmountCents).toBeUndefined();
    });

    it('tenant_id present but does not resolve to a real tenant → falls back to direct-charge behavior, no error', async () => {
      await authenticate();
      mockGetTenantById.mockResolvedValue(null);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const response = await POST(makeRequest('http://localhost:3000/api/payment/create-intent?tenant_id=does-not-exist'));
      expect(response.status).toBe(200);

      const [, , metadata, options] = mockCreatePaymentIntent.mock.calls[0];
      expect(Object.keys(metadata)).not.toContain('tenantId');
      expect(options.connect).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });
});
