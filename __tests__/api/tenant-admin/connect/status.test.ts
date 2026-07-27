import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Tenant } from '@/lib/tenant';
import { createGetRequest } from '../../helpers/request-helpers';

const {
  mockRequireTenantAdmin,
  mockTenantAdminAuthErrorResponse,
  mockGetTenantById,
  mockGetConnectAccountStatusSnapshot,
  mockQuery,
} = vi.hoisted(() => ({
  mockRequireTenantAdmin: vi.fn(),
  mockTenantAdminAuthErrorResponse: vi.fn(),
  mockGetTenantById: vi.fn(),
  mockGetConnectAccountStatusSnapshot: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock('@/lib/tenant-auth', () => ({
  requireTenantAdmin: mockRequireTenantAdmin,
  tenantAdminAuthErrorResponse: mockTenantAdminAuthErrorResponse,
}));

vi.mock('@/lib/tenant', () => ({
  getTenantById: mockGetTenantById,
}));

vi.mock('@/lib/stripe-connect', () => ({
  getConnectAccountStatusSnapshot: mockGetConnectAccountStatusSnapshot,
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
}));

import { GET } from '@/app/api/tenant-admin/connect/status/route';

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

/** Mimics the real `tenantAdminAuthErrorResponse` mapping for a fake thrown auth error shape. */
function fakeAuthErrorResponseImpl(err: unknown) {
  if (
    err &&
    typeof err === 'object' &&
    'status' in err &&
    'message' in err
  ) {
    const { status, message } = err as { status: number; message: string };
    return Response.json({ error: message }, { status });
  }
  return null;
}

class FakeTenantAdminAuthError extends Error {
  constructor(public readonly status: 401 | 403 | 400, message: string) {
    super(message);
    this.name = 'TenantAdminAuthError';
  }
}

describe('GET /api/tenant-admin/connect/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantAdminAuthErrorResponse.mockImplementation(fakeAuthErrorResponseImpl);
    mockQuery.mockResolvedValue([]);
  });

  it('returns 401 with the thrown error message when requireTenantAdmin throws Unauthorized', async () => {
    mockRequireTenantAdmin.mockRejectedValue(
      new FakeTenantAdminAuthError(401, 'Unauthorized')
    );

    const request = createGetRequest('/api/tenant-admin/connect/status');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(mockGetTenantById).not.toHaveBeenCalled();
  });

  it('returns 403 with the thrown error message when requireTenantAdmin throws Forbidden', async () => {
    mockRequireTenantAdmin.mockRejectedValue(
      new FakeTenantAdminAuthError(403, 'Forbidden: you are not an admin of this tenant')
    );

    const request = createGetRequest('/api/tenant-admin/connect/status');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Forbidden: you are not an admin of this tenant' });
  });

  it('returns 400 with the thrown error message when requireTenantAdmin throws a missing-tenant error', async () => {
    mockRequireTenantAdmin.mockRejectedValue(
      new FakeTenantAdminAuthError(400, 'Missing tenant context')
    );

    const request = createGetRequest('/api/tenant-admin/connect/status');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Missing tenant context' });
  });

  it('re-throws unmapped errors from requireTenantAdmin', async () => {
    mockRequireTenantAdmin.mockRejectedValue(new Error('boom'));

    const request = createGetRequest('/api/tenant-admin/connect/status');
    await expect(GET(request)).rejects.toThrow('boom');
  });

  it('returns 404 when the tenant cannot be found after auth passes', async () => {
    mockRequireTenantAdmin.mockResolvedValue({
      userId: 'user-1',
      userEmail: 'admin@acme.com',
      tenantId: 'tenant-1',
    });
    mockGetTenantById.mockResolvedValue(null);

    const request = createGetRequest('/api/tenant-admin/connect/status');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'Tenant not found' });
    expect(mockGetConnectAccountStatusSnapshot).not.toHaveBeenCalled();
  });

  it('returns the "not started" shape without calling Stripe when there is no Connect account yet', async () => {
    const tenant = makeTenant({
      paymentsMode: 'own_stripe',
      stripeConnectAccountId: null,
    });
    mockRequireTenantAdmin.mockResolvedValue({
      userId: 'user-1',
      userEmail: 'admin@acme.com',
      tenantId: 'tenant-1',
    });
    mockGetTenantById.mockResolvedValue(tenant);

    const request = createGetRequest('/api/tenant-admin/connect/status');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      paymentsMode: 'own_stripe',
      hasConnectAccount: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      needsOnboarding: true,
    });
    expect(mockGetConnectAccountStatusSnapshot).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('prefers live Stripe data over stale DB cache and writes the fresh values back', async () => {
    const tenant = makeTenant({
      paymentsMode: 'icc_managed',
      stripeConnectAccountId: 'acct_123',
      // Deliberately stale/different from the live snapshot below.
      stripeConnectChargesEnabled: false,
      stripeConnectPayoutsEnabled: false,
      stripeConnectDetailsSubmitted: false,
    });
    mockRequireTenantAdmin.mockResolvedValue({
      userId: 'user-1',
      userEmail: 'admin@acme.com',
      tenantId: 'tenant-1',
    });
    mockGetTenantById.mockResolvedValue(tenant);
    mockGetConnectAccountStatusSnapshot.mockResolvedValue({
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
    });

    const request = createGetRequest('/api/tenant-admin/connect/status');
    const response = await GET(request);
    const body = await response.json();

    expect(mockGetConnectAccountStatusSnapshot).toHaveBeenCalledWith('acct_123');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE tenants'),
      [true, true, true, 'tenant-1']
    );
    expect(response.status).toBe(200);
    expect(body).toEqual({
      paymentsMode: 'icc_managed',
      hasConnectAccount: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      needsOnboarding: false,
    });
  });

  it('sets needsOnboarding true from live data when chargesEnabled is false', async () => {
    const tenant = makeTenant({
      paymentsMode: 'icc_managed',
      stripeConnectAccountId: 'acct_123',
    });
    mockRequireTenantAdmin.mockResolvedValue({
      userId: 'user-1',
      userEmail: 'admin@acme.com',
      tenantId: 'tenant-1',
    });
    mockGetTenantById.mockResolvedValue(tenant);
    mockGetConnectAccountStatusSnapshot.mockResolvedValue({
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: true,
    });

    const request = createGetRequest('/api/tenant-admin/connect/status');
    const response = await GET(request);
    const body = await response.json();

    expect(body.needsOnboarding).toBe(true);
  });

  it('falls back to cached DB values without writing when the live Stripe check throws', async () => {
    const tenant = makeTenant({
      paymentsMode: 'own_stripe',
      stripeConnectAccountId: 'acct_456',
      // Distinct cached values so we can prove this is what the response used.
      stripeConnectChargesEnabled: true,
      stripeConnectPayoutsEnabled: false,
      stripeConnectDetailsSubmitted: true,
    });
    mockRequireTenantAdmin.mockResolvedValue({
      userId: 'user-1',
      userEmail: 'admin@acme.com',
      tenantId: 'tenant-1',
    });
    mockGetTenantById.mockResolvedValue(tenant);
    mockGetConnectAccountStatusSnapshot.mockRejectedValue(new Error('network blip'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = createGetRequest('/api/tenant-admin/connect/status');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      paymentsMode: 'own_stripe',
      hasConnectAccount: true,
      chargesEnabled: true,
      payoutsEnabled: false,
      detailsSubmitted: true,
      needsOnboarding: false,
    });
    expect(mockQuery).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
