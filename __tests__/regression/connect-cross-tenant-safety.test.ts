import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { Tenant } from '@/lib/tenant';
import { createGetRequest, createPostRequest } from '../api/helpers/request-helpers';
import { createMockSession } from '../api/helpers/auth-mock';

/**
 * MONEY-SAFETY REGRESSION SUITE — Stripe Connect cross-tenant isolation.
 *
 * Purpose: prove there is no way for one tenant's money, Connect account id,
 * or commission rate to leak into another tenant's checkout, onboarding, or
 * status check — even across back-to-back calls that share the same Node
 * process/module state (i.e. no closed-over/cached/hardcoded tenant data).
 *
 * Every test in this file calls the SAME route handler function TWICE in a
 * row with two different tenants and asserts each call's captured
 * downstream args are scoped to that call's own tenant only. This is
 * deliberately redundant with the per-route unit tests in
 * __tests__/api/payment/create-intent.test.ts,
 * __tests__/api/tenant-admin/connect/{onboard,status}.test.ts — those prove
 * each route is correct in isolation; this file exists specifically to
 * prove tenant data doesn't bleed across sequential requests.
 */

const {
  mockGetTenantById,
  mockCreatePaymentIntent,
  mockRequireTenantAdmin,
  mockTenantAdminAuthErrorResponse,
  mockGetOrCreateConnectAccountForTenant,
  mockCreateConnectOnboardingLink,
  mockGetConnectAccountStatusSnapshot,
  mockQuery,
  mockQueryOne,
} = vi.hoisted(() => ({
  mockGetTenantById: vi.fn(),
  mockCreatePaymentIntent: vi.fn(),
  mockRequireTenantAdmin: vi.fn(),
  mockTenantAdminAuthErrorResponse: vi.fn(),
  mockGetOrCreateConnectAccountForTenant: vi.fn(),
  mockCreateConnectOnboardingLink: vi.fn(),
  mockGetConnectAccountStatusSnapshot: vi.fn(),
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock('@/lib/tenant', () => ({
  getTenantById: mockGetTenantById,
}));

vi.mock('@/lib/tenant-auth', () => ({
  requireTenantAdmin: mockRequireTenantAdmin,
  tenantAdminAuthErrorResponse: mockTenantAdminAuthErrorResponse,
}));

// Partial mock: keep the real `calculateApplicationFeeCents` so this suite
// exercises the actual bps math instead of a stub, since a hardcoded/shared
// fee value is exactly the kind of bug this file is meant to catch.
vi.mock('@/lib/stripe-connect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe-connect')>();
  return {
    ...actual,
    getOrCreateConnectAccountForTenant: mockGetOrCreateConnectAccountForTenant,
    createConnectOnboardingLink: mockCreateConnectOnboardingLink,
    getConnectAccountStatusSnapshot: mockGetConnectAccountStatusSnapshot,
  };
});

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

vi.mock('@/lib/order-validation', () => ({
  validateOrder: vi.fn().mockResolvedValue({
    valid: true,
    serverTotal: 100,
    clientTotal: 100,
    priceMismatch: false,
    inventoryIssues: false,
    items: [],
    errors: [],
    warnings: [],
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
  queryOne: mockQueryOne,
  query: mockQuery,
}));

vi.mock('@/lib/shipping-calculation', () => ({
  calculateShippingFee: vi.fn().mockReturnValue(9.99),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

import { POST as createIntentPOST } from '@/app/api/payment/create-intent/route';
import { POST as onboardPOST } from '@/app/api/tenant-admin/connect/onboard/route';
import { GET as statusGET } from '@/app/api/tenant-admin/connect/status/route';

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-x',
    slug: 'tenant-x',
    name: 'Tenant X',
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
    commissionBps: 0,
    stripeConnectChargesEnabled: false,
    stripeConnectPayoutsEnabled: false,
    stripeConnectDetailsSubmitted: false,
    ...overrides,
  };
}

/** icc_managed, 150 bps commission. */
const TENANT_A = makeTenant({
  id: 'tenant-a',
  slug: 'tenant-a-slug',
  name: 'Tenant A',
  paymentsMode: 'icc_managed',
  stripeConnectAccountId: 'acct_A111',
  commissionBps: 150,
  stripeConnectChargesEnabled: true,
});

/** own_stripe — merchant of record itself, no application fee. */
const TENANT_B = makeTenant({
  id: 'tenant-b',
  slug: 'tenant-b-slug',
  name: 'Tenant B',
  paymentsMode: 'own_stripe',
  stripeConnectAccountId: 'acct_B222',
  commissionBps: 0,
  stripeConnectChargesEnabled: true,
});

/**
 * icc_managed like tenant A, but with a DIFFERENT commission rate — this is
 * the harshest pairing for `create-intent`: same payments mode as A, so the
 * only thing that should differ between the two calls is the destination
 * account and the fee math, not any branch logic.
 */
const TENANT_C = makeTenant({
  id: 'tenant-c',
  slug: 'tenant-c-slug',
  name: 'Tenant C',
  paymentsMode: 'icc_managed',
  stripeConnectAccountId: 'acct_C333',
  commissionBps: 300,
  stripeConnectChargesEnabled: true,
});

const TENANTS_BY_ID: Record<string, Tenant> = {
  [TENANT_A.id]: TENANT_A,
  [TENANT_B.id]: TENANT_B,
  [TENANT_C.id]: TENANT_C,
};

function makeCreateIntentRequest(tenantId: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/payment/create-intent?tenant_id=${tenantId}`,
    {
      method: 'POST',
      body: JSON.stringify({
        amount: 117.99, // 100 (items, server-validated) + 9.99 (delivery) + 8 (tax)
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
    }
  );
}

async function authenticate() {
  const { auth } = await import('@/lib/auth');
  vi.mocked(auth.api.getSession).mockResolvedValue(
    createMockSession({ id: 'user123', email: 'test@example.com', name: 'Test User' })
  );
}

describe('Stripe Connect cross-tenant money-safety regression suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Per-call lookup keyed by the id argument — NOT a single static
    // resolved value — so a bug that ignores the argument and always
    // returns the first-resolved tenant would be caught immediately.
    mockGetTenantById.mockImplementation(async (id: string) => {
      switch (id) {
        case TENANT_A.id:
          return TENANT_A;
        case TENANT_B.id:
          return TENANT_B;
        case TENANT_C.id:
          return TENANT_C;
        default:
          return null;
      }
    });

    mockCreatePaymentIntent.mockResolvedValue({
      paymentIntent: { id: 'pi_test123' },
      clientSecret: 'pi_test123_secret_test',
    });

    mockQueryOne.mockResolvedValue({
      value: [
        { id: 'standard', name: 'Standard Shipping', price: 9.99, days: '5-7' },
        { id: 'express', name: 'Express Shipping', price: 19.99, days: '2-3' },
      ],
    });
    mockQuery.mockResolvedValue([]);

    mockTenantAdminAuthErrorResponse.mockReturnValue(null);
  });

  describe('1. create-intent cross-tenant isolation', () => {
    it('two icc_managed tenants with different commission bps: each call gets its own destination account and its own fee, never the other tenant\'s', async () => {
      await authenticate();

      const responseA = await createIntentPOST(makeCreateIntentRequest(TENANT_A.id));
      expect(responseA.status).toBe(200);

      const responseC = await createIntentPOST(makeCreateIntentRequest(TENANT_C.id));
      expect(responseC.status).toBe(200);

      expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(2);
      const [totalA, , metadataA, optionsA] = mockCreatePaymentIntent.mock.calls[0];
      const [totalC, , metadataC, optionsC] = mockCreatePaymentIntent.mock.calls[1];

      expect(metadataA.tenantId).toBe('tenant-a');
      expect(metadataC.tenantId).toBe('tenant-c');

      // (a) call A: tenant A's own account + exactly 150 bps of the order amount.
      const amountCentsA = Math.round(totalA * 100);
      expect(optionsA.connect.destinationAccountId).toBe('acct_A111');
      expect(optionsA.connect.applicationFeeAmountCents).toBe(
        Math.round((amountCentsA * 150) / 10000)
      );

      // (b) call C: tenant C's own account + exactly 300 bps — proven against
      // C's actual bps, not copy-pasted from A's expected value.
      const amountCentsC = Math.round(totalC * 100);
      expect(optionsC.connect.destinationAccountId).toBe('acct_C333');
      expect(optionsC.connect.applicationFeeAmountCents).toBe(
        Math.round((amountCentsC * 300) / 10000)
      );

      // (c) neither call's captured args mention the other tenant's account at all.
      const callAArgsJson = JSON.stringify([metadataA, optionsA]);
      const callCArgsJson = JSON.stringify([metadataC, optionsC]);
      expect(callAArgsJson).not.toContain('acct_C333');
      expect(callAArgsJson).not.toContain('tenant-c');
      expect(callCArgsJson).not.toContain('acct_A111');
      expect(callCArgsJson).not.toContain('tenant-a');

      // (d) the two calls' computed fees genuinely differ — proves the bps
      // value wasn't hardcoded or reused from the previous call.
      expect(optionsA.connect.applicationFeeAmountCents).not.toBe(
        optionsC.connect.applicationFeeAmountCents
      );
    });

    it('icc_managed vs own_stripe: the payments-mode branch itself does not leak between back-to-back calls', async () => {
      await authenticate();

      const responseA = await createIntentPOST(makeCreateIntentRequest(TENANT_A.id));
      expect(responseA.status).toBe(200);

      const responseB = await createIntentPOST(makeCreateIntentRequest(TENANT_B.id));
      expect(responseB.status).toBe(200);

      expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(2);
      const [, , metadataA, optionsA] = mockCreatePaymentIntent.mock.calls[0];
      const [, , metadataB, optionsB] = mockCreatePaymentIntent.mock.calls[1];

      expect(metadataA.tenantId).toBe('tenant-a');
      expect(metadataB.tenantId).toBe('tenant-b');
      expect(optionsA.connect.destinationAccountId).toBe('acct_A111');
      expect(optionsB.connect.destinationAccountId).toBe('acct_B222');

      // Tenant A (icc_managed): application fee present, no on_behalf_of —
      // and this must still hold true even though the *next* call (B) is
      // own_stripe, i.e. A's result isn't mutated retroactively.
      expect(optionsA.connect.applicationFeeAmountCents).toBeGreaterThan(0);
      expect(optionsA.connect.onBehalfOf).toBeUndefined();
      expect('onBehalfOf' in optionsA.connect).toBe(false);

      // Tenant B (own_stripe): on_behalf_of present, no application fee field
      // — the own_stripe branch from call B must not inherit call A's fee.
      expect(optionsB.connect.onBehalfOf).toBe('acct_B222');
      expect(optionsB.connect.applicationFeeAmountCents).toBeUndefined();
      expect('applicationFeeAmountCents' in optionsB.connect).toBe(false);

      const callAArgsJson = JSON.stringify([metadataA, optionsA]);
      const callBArgsJson = JSON.stringify([metadataB, optionsB]);
      expect(callAArgsJson).not.toContain('acct_B222');
      expect(callBArgsJson).not.toContain('acct_A111');
    });
  });

  describe('2. connect/status cross-tenant isolation', () => {
    it('two different tenant admins hitting the same endpoint back-to-back each get, and each persist, only their own tenant\'s live status', async () => {
      mockRequireTenantAdmin
        .mockResolvedValueOnce({ userId: 'admin-a', userEmail: 'admin@a.example.com', tenantId: TENANT_A.id })
        .mockResolvedValueOnce({ userId: 'admin-b', userEmail: 'admin@b.example.com', tenantId: TENANT_B.id });

      // Keyed by the account id argument, not a static value — a bug that
      // ignores the argument (e.g. a module-level cached snapshot) would
      // return the same values for both calls and fail this test.
      mockGetConnectAccountStatusSnapshot.mockImplementation(async (accountId: string) => {
        switch (accountId) {
          case TENANT_A.stripeConnectAccountId:
            return { chargesEnabled: true, payoutsEnabled: false, detailsSubmitted: true };
          case TENANT_B.stripeConnectAccountId:
            return { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true };
          default:
            throw new Error(`Unexpected Stripe account id: ${accountId}`);
        }
      });

      const responseA = await statusGET(createGetRequest('/api/tenant-admin/connect/status'));
      const bodyA = await responseA.json();

      const responseB = await statusGET(createGetRequest('/api/tenant-admin/connect/status'));
      const bodyB = await responseB.json();

      expect(responseA.status).toBe(200);
      expect(responseB.status).toBe(200);

      const updateCalls = mockQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('UPDATE tenants')
      );
      expect(updateCalls).toHaveLength(2);

      // (a) request 1's DB write used tenant A's id and tenant A's snapshot values.
      expect(updateCalls[0][1]).toEqual([true, false, true, TENANT_A.id]);

      // (b) request 2's DB write used tenant B's id and tenant B's snapshot values.
      expect(updateCalls[1][1]).toEqual([true, true, true, TENANT_B.id]);

      expect(bodyA).toEqual({
        paymentsMode: 'icc_managed',
        hasConnectAccount: true,
        chargesEnabled: true,
        payoutsEnabled: false,
        detailsSubmitted: true,
        needsOnboarding: false,
      });
      expect(bodyB).toEqual({
        paymentsMode: 'own_stripe',
        hasConnectAccount: true,
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        needsOnboarding: false,
      });

      // (c) neither response contains the other tenant's account id or status values.
      expect(bodyA).not.toEqual(bodyB);
      expect(JSON.stringify(bodyA)).not.toContain(TENANT_B.stripeConnectAccountId!);
      expect(JSON.stringify(bodyB)).not.toContain(TENANT_A.stripeConnectAccountId!);
      expect(mockGetConnectAccountStatusSnapshot).toHaveBeenNthCalledWith(1, TENANT_A.stripeConnectAccountId);
      expect(mockGetConnectAccountStatusSnapshot).toHaveBeenNthCalledWith(2, TENANT_B.stripeConnectAccountId);
    });
  });

  describe('3. connect/onboard cross-tenant isolation', () => {
    it('two different tenant admins starting onboarding back-to-back each get an onboarding link scoped exclusively to their own tenant', async () => {
      mockRequireTenantAdmin
        .mockResolvedValueOnce({ userId: 'admin-a', userEmail: 'admin@a.example.com', tenantId: TENANT_A.id })
        .mockResolvedValueOnce({ userId: 'admin-b', userEmail: 'admin@b.example.com', tenantId: TENANT_B.id });

      // Keyed by which tenant object is passed in, not a static value.
      mockGetOrCreateConnectAccountForTenant.mockImplementation(async (tenant: Tenant) => {
        switch (tenant.id) {
          case TENANT_A.id:
            return TENANT_A.stripeConnectAccountId!;
          case TENANT_B.id:
            return TENANT_B.stripeConnectAccountId!;
          default:
            throw new Error(`Unexpected tenant: ${tenant.id}`);
        }
      });

      // Keyed by the account id argument, not a static value.
      mockCreateConnectOnboardingLink.mockImplementation(async (accountId: string) => {
        switch (accountId) {
          case TENANT_A.stripeConnectAccountId:
            return `https://connect.stripe.com/setup/${accountId}`;
          case TENANT_B.stripeConnectAccountId:
            return `https://connect.stripe.com/setup/${accountId}`;
          default:
            throw new Error(`Unexpected Stripe account id: ${accountId}`);
        }
      });

      const responseA = await onboardPOST(createPostRequest('/api/tenant-admin/connect/onboard', {}));
      const bodyA = await responseA.json();

      const responseB = await onboardPOST(createPostRequest('/api/tenant-admin/connect/onboard', {}));
      const bodyB = await responseB.json();

      expect(responseA.status).toBe(200);
      expect(responseB.status).toBe(200);

      // (a) call 1's URL is exclusively derived from tenant A's account id.
      expect(bodyA.url).toBe(`https://connect.stripe.com/setup/${TENANT_A.stripeConnectAccountId}`);
      expect(bodyA.url).not.toContain(TENANT_B.stripeConnectAccountId!);

      // (b) call 2's URL is exclusively derived from tenant B's account id.
      expect(bodyB.url).toBe(`https://connect.stripe.com/setup/${TENANT_B.stripeConnectAccountId}`);
      expect(bodyB.url).not.toContain(TENANT_A.stripeConnectAccountId!);

      expect(mockCreateConnectOnboardingLink).toHaveBeenCalledTimes(2);
      const [accountIdCall1, , returnUrlCall1, refreshUrlCall1] = mockCreateConnectOnboardingLink.mock.calls[0];
      const [accountIdCall2, , returnUrlCall2, refreshUrlCall2] = mockCreateConnectOnboardingLink.mock.calls[1];

      // (c) the two calls received distinct account ids matching only their own tenant.
      expect(accountIdCall1).toBe(TENANT_A.stripeConnectAccountId);
      expect(accountIdCall2).toBe(TENANT_B.stripeConnectAccountId);
      expect(accountIdCall1).not.toBe(accountIdCall2);

      // Return/refresh URLs are slug-scoped per tenant and must not cross over.
      expect(returnUrlCall1).toContain(TENANT_A.slug);
      expect(refreshUrlCall1).toContain(TENANT_A.slug);
      expect(returnUrlCall1).not.toContain(TENANT_B.slug);
      expect(refreshUrlCall1).not.toContain(TENANT_B.slug);

      expect(returnUrlCall2).toContain(TENANT_B.slug);
      expect(refreshUrlCall2).toContain(TENANT_B.slug);
      expect(returnUrlCall2).not.toContain(TENANT_A.slug);
      expect(refreshUrlCall2).not.toContain(TENANT_A.slug);
    });
  });
});
