import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Tenant } from '@/lib/tenant';

const { mockAccountsCreate, mockAccountLinksCreate, mockAccountsRetrieve, mockQuery, mockQueryOne } =
  vi.hoisted(() => ({
    mockAccountsCreate: vi.fn(),
    mockAccountLinksCreate: vi.fn(),
    mockAccountsRetrieve: vi.fn(),
    mockQuery: vi.fn(),
    mockQueryOne: vi.fn(),
  }));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    v2: {
      core: {
        accounts: {
          create: mockAccountsCreate,
        },
        accountLinks: {
          create: mockAccountLinksCreate,
        },
      },
    },
    accounts: {
      retrieve: mockAccountsRetrieve,
    },
  },
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

import {
  getOrCreateConnectAccountForTenant,
  createConnectOnboardingLink,
  mapStripeAccountToStatusSnapshot,
  getConnectAccountStatusSnapshot,
  calculateApplicationFeeCents,
} from '@/lib/stripe-connect';

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

describe('getOrCreateConnectAccountForTenant', () => {
  beforeEach(() => {
    mockAccountsCreate.mockReset();
    mockAccountLinksCreate.mockReset();
    mockAccountsRetrieve.mockReset();
    mockQuery.mockReset();
    mockQueryOne.mockReset();
  });

  it('returns the existing account id without calling Stripe when already set', async () => {
    const tenant = makeTenant({ stripeConnectAccountId: 'acct_existing123' });

    const result = await getOrCreateConnectAccountForTenant(tenant, 'admin@acme.com');

    expect(result).toBe('acct_existing123');
    expect(mockAccountsCreate).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('creates a recipient-only account for icc_managed tenants and persists it', async () => {
    const tenant = makeTenant({ paymentsMode: 'icc_managed', stripeConnectAccountId: null });
    mockAccountsCreate.mockResolvedValue({ id: 'acct_new_managed', dashboard: 'express' });
    mockQuery.mockResolvedValue(undefined);

    const result = await getOrCreateConnectAccountForTenant(tenant, 'admin@acme.com');

    expect(result).toBe('acct_new_managed');
    expect(mockAccountsCreate).toHaveBeenCalledWith({
      display_name: tenant.name,
      contact_email: 'admin@acme.com',
      dashboard: 'express',
      identity: { country: 'us' },
      configuration: {
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
      },
      defaults: {
        currency: 'usd',
        responsibilities: { fees_collector: 'application', losses_collector: 'application' },
      },
      metadata: { tenant_id: tenant.id },
    });
    expect(mockQuery).toHaveBeenCalledWith(
      `UPDATE tenants SET stripe_connect_account_id = $1, updated_at = NOW() WHERE id = $2`,
      ['acct_new_managed', tenant.id]
    );
  });

  it('creates a merchant+recipient account for own_stripe tenants and persists it', async () => {
    const tenant = makeTenant({ paymentsMode: 'own_stripe', stripeConnectAccountId: null });
    mockAccountsCreate.mockResolvedValue({ id: 'acct_new_own', dashboard: 'full' });
    mockQuery.mockResolvedValue(undefined);

    const result = await getOrCreateConnectAccountForTenant(tenant, 'owner@acme.com');

    expect(result).toBe('acct_new_own');
    expect(mockAccountsCreate).toHaveBeenCalledWith({
      display_name: tenant.name,
      contact_email: 'owner@acme.com',
      dashboard: 'full',
      identity: { country: 'us' },
      configuration: {
        merchant: { capabilities: { card_payments: { requested: true } } },
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
      },
      defaults: {
        currency: 'usd',
        responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
      },
      metadata: { tenant_id: tenant.id },
    });
    expect(mockQuery).toHaveBeenCalledWith(
      `UPDATE tenants SET stripe_connect_account_id = $1, updated_at = NOW() WHERE id = $2`,
      ['acct_new_own', tenant.id]
    );
  });
});

describe('createConnectOnboardingLink', () => {
  beforeEach(() => {
    mockAccountLinksCreate.mockReset();
  });

  it('requests recipient-only configuration for icc_managed accounts', async () => {
    mockAccountLinksCreate.mockResolvedValue({ url: 'https://connect.stripe.com/setup/managed' });

    const url = await createConnectOnboardingLink(
      'acct_managed',
      'icc_managed',
      'https://app.example.com/return',
      'https://app.example.com/refresh'
    );

    expect(url).toBe('https://connect.stripe.com/setup/managed');
    expect(mockAccountLinksCreate).toHaveBeenCalledWith({
      account: 'acct_managed',
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['recipient'],
          return_url: 'https://app.example.com/return',
          refresh_url: 'https://app.example.com/refresh',
        },
      },
    });
  });

  it('requests merchant+recipient configuration for own_stripe accounts', async () => {
    mockAccountLinksCreate.mockResolvedValue({ url: 'https://connect.stripe.com/setup/own' });

    const url = await createConnectOnboardingLink(
      'acct_own',
      'own_stripe',
      'https://app.example.com/return',
      'https://app.example.com/refresh'
    );

    expect(url).toBe('https://connect.stripe.com/setup/own');
    expect(mockAccountLinksCreate).toHaveBeenCalledWith({
      account: 'acct_own',
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['merchant', 'recipient'],
          return_url: 'https://app.example.com/return',
          refresh_url: 'https://app.example.com/refresh',
        },
      },
    });
  });
});

describe('mapStripeAccountToStatusSnapshot', () => {
  it('maps snake_case Stripe fields to a camelCase snapshot', () => {
    const snapshot = mapStripeAccountToStatusSnapshot({
      charges_enabled: true,
      payouts_enabled: false,
      details_submitted: true,
    });

    expect(snapshot).toEqual({
      chargesEnabled: true,
      payoutsEnabled: false,
      detailsSubmitted: true,
    });
  });
});

describe('getConnectAccountStatusSnapshot', () => {
  beforeEach(() => {
    mockAccountsRetrieve.mockReset();
  });

  it('retrieves the account via the v1 SDK method and maps the result', async () => {
    mockAccountsRetrieve.mockResolvedValue({
      charges_enabled: true,
      payouts_enabled: false,
      details_submitted: true,
    });

    const snapshot = await getConnectAccountStatusSnapshot('acct_123');

    expect(mockAccountsRetrieve).toHaveBeenCalledWith('acct_123');
    expect(snapshot).toEqual({
      chargesEnabled: true,
      payoutsEnabled: false,
      detailsSubmitted: true,
    });
  });
});

describe('calculateApplicationFeeCents', () => {
  it('calculates the fee for a $100 order at 150 bps (1.5%)', () => {
    expect(calculateApplicationFeeCents(10000, 150)).toBe(150);
  });

  it('returns 0 when commissionBps is zero or negative', () => {
    expect(calculateApplicationFeeCents(10000, 0)).toBe(0);
    expect(calculateApplicationFeeCents(10000, -50)).toBe(0);
  });

  it('never returns a negative fee', () => {
    expect(calculateApplicationFeeCents(0, 150)).toBeGreaterThanOrEqual(0);
  });

  it('clamps the fee below the full amount for extreme bps values', () => {
    const amountCents = 10000;
    const fee = calculateApplicationFeeCents(amountCents, 15000); // 150% naive calc
    expect(fee).toBeLessThan(amountCents);
    expect(fee).toBe(amountCents - 1);
  });
});
