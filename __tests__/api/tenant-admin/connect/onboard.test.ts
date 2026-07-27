import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Tenant } from '@/lib/tenant';
import { createPostRequest } from '../../helpers/request-helpers';

const {
  mockRequireTenantAdmin,
  mockTenantAdminAuthErrorResponse,
  mockGetTenantById,
  mockGetOrCreateConnectAccountForTenant,
  mockCreateConnectOnboardingLink,
} = vi.hoisted(() => ({
  mockRequireTenantAdmin: vi.fn(),
  mockTenantAdminAuthErrorResponse: vi.fn(),
  mockGetTenantById: vi.fn(),
  mockGetOrCreateConnectAccountForTenant: vi.fn(),
  mockCreateConnectOnboardingLink: vi.fn(),
}));

vi.mock('@/lib/tenant-auth', () => ({
  requireTenantAdmin: mockRequireTenantAdmin,
  tenantAdminAuthErrorResponse: mockTenantAdminAuthErrorResponse,
}));

vi.mock('@/lib/tenant', () => ({
  getTenantById: mockGetTenantById,
}));

vi.mock('@/lib/stripe-connect', () => ({
  getOrCreateConnectAccountForTenant: mockGetOrCreateConnectAccountForTenant,
  createConnectOnboardingLink: mockCreateConnectOnboardingLink,
}));

import { POST } from '@/app/api/tenant-admin/connect/onboard/route';

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

describe('POST /api/tenant-admin/connect/onboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantAdminAuthErrorResponse.mockImplementation(fakeAuthErrorResponseImpl);
  });

  it('returns 401 with the thrown error message when requireTenantAdmin throws Unauthorized', async () => {
    mockRequireTenantAdmin.mockRejectedValue(
      new FakeTenantAdminAuthError(401, 'Unauthorized')
    );

    const request = createPostRequest('/api/tenant-admin/connect/onboard', {});
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(mockGetTenantById).not.toHaveBeenCalled();
  });

  it('returns 403 with the thrown error message when requireTenantAdmin throws Forbidden', async () => {
    mockRequireTenantAdmin.mockRejectedValue(
      new FakeTenantAdminAuthError(403, 'Forbidden: you are not an admin of this tenant')
    );

    const request = createPostRequest('/api/tenant-admin/connect/onboard', {});
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Forbidden: you are not an admin of this tenant' });
  });

  it('returns 400 with the thrown error message when requireTenantAdmin throws a missing-tenant error', async () => {
    mockRequireTenantAdmin.mockRejectedValue(
      new FakeTenantAdminAuthError(400, 'Missing tenant context')
    );

    const request = createPostRequest('/api/tenant-admin/connect/onboard', {});
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Missing tenant context' });
  });

  it('returns 404 when the tenant cannot be found after auth passes', async () => {
    mockRequireTenantAdmin.mockResolvedValue({
      userId: 'user-1',
      userEmail: 'admin@acme.com',
      tenantId: 'tenant-1',
    });
    mockGetTenantById.mockResolvedValue(null);

    const request = createPostRequest('/api/tenant-admin/connect/onboard', {});
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'Tenant not found' });
    expect(mockGetOrCreateConnectAccountForTenant).not.toHaveBeenCalled();
  });

  it('creates an onboarding link for an icc_managed tenant and returns the url', async () => {
    const tenant = makeTenant({
      id: 'tenant-1',
      slug: 'acme',
      paymentsMode: 'icc_managed',
    });
    mockRequireTenantAdmin.mockResolvedValue({
      userId: 'user-1',
      userEmail: 'admin@acme.com',
      tenantId: 'tenant-1',
    });
    mockGetTenantById.mockResolvedValue(tenant);
    mockGetOrCreateConnectAccountForTenant.mockResolvedValue('acct_managed_123');
    mockCreateConnectOnboardingLink.mockResolvedValue(
      'https://connect.stripe.com/setup/managed-link'
    );

    const request = createPostRequest('/api/tenant-admin/connect/onboard', {});
    const response = await POST(request);
    const body = await response.json();

    expect(mockGetOrCreateConnectAccountForTenant).toHaveBeenCalledWith(
      tenant,
      'admin@acme.com'
    );
    expect(mockCreateConnectOnboardingLink).toHaveBeenCalledWith(
      'acct_managed_123',
      'icc_managed',
      'http://localhost:3000/acme/account/payments-setup?onboarding=complete',
      'http://localhost:3000/acme/account/payments-setup?onboarding=refresh'
    );
    expect(response.status).toBe(200);
    expect(body).toEqual({ url: 'https://connect.stripe.com/setup/managed-link' });
  });

  it('creates an onboarding link for an own_stripe tenant and passes the mode through', async () => {
    const tenant = makeTenant({
      id: 'tenant-2',
      slug: 'own-stripe-co',
      paymentsMode: 'own_stripe',
    });
    mockRequireTenantAdmin.mockResolvedValue({
      userId: 'user-2',
      userEmail: 'owner@ownstripeco.com',
      tenantId: 'tenant-2',
    });
    mockGetTenantById.mockResolvedValue(tenant);
    mockGetOrCreateConnectAccountForTenant.mockResolvedValue('acct_own_456');
    mockCreateConnectOnboardingLink.mockResolvedValue(
      'https://connect.stripe.com/setup/own-link'
    );

    const request = createPostRequest('/api/tenant-admin/connect/onboard', {});
    const response = await POST(request);
    const body = await response.json();

    expect(mockGetOrCreateConnectAccountForTenant).toHaveBeenCalledWith(
      tenant,
      'owner@ownstripeco.com'
    );
    expect(mockCreateConnectOnboardingLink).toHaveBeenCalledWith(
      'acct_own_456',
      'own_stripe',
      'http://localhost:3000/own-stripe-co/account/payments-setup?onboarding=complete',
      'http://localhost:3000/own-stripe-co/account/payments-setup?onboarding=refresh'
    );
    expect(response.status).toBe(200);
    expect(body).toEqual({ url: 'https://connect.stripe.com/setup/own-link' });
  });

  it('returns a generic 502 and does not leak the raw Stripe error when account creation fails', async () => {
    const tenant = makeTenant({ id: 'tenant-1', slug: 'acme', paymentsMode: 'icc_managed' });
    mockRequireTenantAdmin.mockResolvedValue({
      userId: 'user-1',
      userEmail: 'admin@acme.com',
      tenantId: 'tenant-1',
    });
    mockGetTenantById.mockResolvedValue(tenant);
    mockGetOrCreateConnectAccountForTenant.mockRejectedValue(new Error('stripe boom'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = createPostRequest('/api/tenant-admin/connect/onboard', {});
    const response = await POST(request);
    const bodyText = await response.text();

    expect(response.status).toBe(502);
    expect(bodyText).not.toContain('stripe boom');
    expect(JSON.parse(bodyText)).toEqual({
      error: 'Unable to start payment onboarding. Please try again.',
    });
    expect(mockCreateConnectOnboardingLink).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('returns a generic 502 and does not leak the raw Stripe error when onboarding link creation fails', async () => {
    const tenant = makeTenant({ id: 'tenant-1', slug: 'acme', paymentsMode: 'icc_managed' });
    mockRequireTenantAdmin.mockResolvedValue({
      userId: 'user-1',
      userEmail: 'admin@acme.com',
      tenantId: 'tenant-1',
    });
    mockGetTenantById.mockResolvedValue(tenant);
    mockGetOrCreateConnectAccountForTenant.mockResolvedValue('acct_managed_123');
    mockCreateConnectOnboardingLink.mockRejectedValue(new Error('stripe boom'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = createPostRequest('/api/tenant-admin/connect/onboard', {});
    const response = await POST(request);
    const bodyText = await response.text();

    expect(response.status).toBe(502);
    expect(bodyText).not.toContain('stripe boom');
    expect(JSON.parse(bodyText)).toEqual({
      error: 'Unable to start payment onboarding. Please try again.',
    });

    consoleErrorSpy.mockRestore();
  });
});
