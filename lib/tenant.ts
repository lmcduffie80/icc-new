import { queryOne } from './db';
import { cache } from 'react';
import type { NextRequest } from 'next/server';

export interface Plan {
  id: string;
  name: string;
  displayName: string;
  priceMonthlyUsd: number | null;
  priceAnnualUsd: number | null;
  features: Record<string, boolean | number>;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  country: string;
  currency: string;
  planId: string | null;
  billingType: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  billingCycle: string | null;
  isActive: boolean;
  mfaRequired: boolean;
  plan: Plan | null;
  paymentsMode: 'own_stripe' | 'icc_managed';
  stripeConnectAccountId: string | null;
  commissionBps: number;
  stripeConnectChargesEnabled: boolean;
  stripeConnectPayoutsEnabled: boolean;
  stripeConnectDetailsSubmitted: boolean;
}

interface DbTenant {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  country: string;
  currency: string;
  plan_id: string | null;
  billing_type: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  trial_ends_at: string | null;
  billing_cycle: string | null;
  is_active: boolean;
  mfa_required: boolean;
  payments_mode: 'own_stripe' | 'icc_managed';
  stripe_connect_account_id: string | null;
  commission_bps: number;
  stripe_connect_charges_enabled: boolean;
  stripe_connect_payouts_enabled: boolean;
  stripe_connect_details_submitted: boolean;
  plan_name: string | null;
  plan_display_name: string | null;
  plan_price_monthly_usd: string | null;
  plan_price_annual_usd: string | null;
  plan_features: Record<string, boolean | number> | null;
}

const TENANT_SELECT = `
  SELECT
    t.id, t.slug, t.name, t.logo_url, t.primary_color,
    t.country, t.currency, t.plan_id, t.billing_type,
    t.stripe_customer_id, t.stripe_subscription_id,
    t.subscription_status, t.trial_ends_at, t.billing_cycle,
    t.is_active, t.mfa_required,
    t.payments_mode, t.stripe_connect_account_id, t.commission_bps,
    t.stripe_connect_charges_enabled, t.stripe_connect_payouts_enabled,
    t.stripe_connect_details_submitted,
    p.name          AS plan_name,
    p.display_name  AS plan_display_name,
    p.price_monthly_usd AS plan_price_monthly_usd,
    p.price_annual_usd  AS plan_price_annual_usd,
    p.features      AS plan_features
  FROM tenants t
  LEFT JOIN plans p ON p.id = t.plan_id
`;

function mapTenant(row: DbTenant): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    logoUrl: row.logo_url,
    primaryColor: row.primary_color ?? '#16a34a',
    country: row.country,
    currency: row.currency,
    planId: row.plan_id,
    billingType: row.billing_type,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    subscriptionStatus: row.subscription_status,
    trialEndsAt: row.trial_ends_at,
    billingCycle: row.billing_cycle,
    isActive: row.is_active,
    mfaRequired: row.mfa_required ?? false,
    paymentsMode: row.payments_mode,
    stripeConnectAccountId: row.stripe_connect_account_id,
    commissionBps: row.commission_bps,
    stripeConnectChargesEnabled: row.stripe_connect_charges_enabled,
    stripeConnectPayoutsEnabled: row.stripe_connect_payouts_enabled,
    stripeConnectDetailsSubmitted: row.stripe_connect_details_submitted,
    plan: row.plan_name
      ? {
          id: row.plan_id!,
          name: row.plan_name,
          displayName: row.plan_display_name ?? row.plan_name,
          priceMonthlyUsd: row.plan_price_monthly_usd
            ? parseFloat(row.plan_price_monthly_usd)
            : null,
          priceAnnualUsd: row.plan_price_annual_usd
            ? parseFloat(row.plan_price_annual_usd)
            : null,
          features: row.plan_features ?? {},
        }
      : null,
  };
}

/** Look up a tenant by URL slug. Cached per request via React cache(). */
export const getTenantBySlug = cache(async (slug: string): Promise<Tenant | null> => {
  if (!slug) return null;
  try {
    const row = await queryOne<DbTenant>(
      `${TENANT_SELECT} WHERE t.slug = $1 AND t.is_active = true`,
      [slug.toLowerCase()]
    );
    return row ? mapTenant(row) : null;
  } catch (err) {
    console.error('[getTenantBySlug] error:', err);
    return null;
  }
});

/** Look up a tenant by its UUID. Cached per request. */
export const getTenantById = cache(async (id: string): Promise<Tenant | null> => {
  if (!id) return null;
  try {
    const row = await queryOne<DbTenant>(
      `${TENANT_SELECT} WHERE t.id = $1`,
      [id]
    );
    return row ? mapTenant(row) : null;
  } catch (err) {
    console.error('[getTenantById] error:', err);
    return null;
  }
});

/** Read the tenant ID injected by middleware into request headers. */
export function getTenantIdFromHeaders(headers: Headers): string {
  return headers.get('x-tenant-id') ?? '';
}

/** Read the tenant slug injected by middleware into request headers. */
export function getTenantSlugFromHeaders(headers: Headers): string {
  return headers.get('x-tenant-slug') ?? '';
}

/**
 * Check whether a tenant's active plan includes a given feature.
 * Numeric features (e.g. max_products: 100) return true when > 0 or === -1 (unlimited).
 */
export function tenantCan(tenant: Tenant, feature: string): boolean {
  const val = tenant.plan?.features?.[feature];
  if (val === undefined || val === null) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === -1 || val > 0;
  return false;
}

/** True when the tenant's subscription allows access (not canceled/unpaid and trial not expired). */
export function tenantHasAccess(tenant: Tenant): boolean {
  const { subscriptionStatus, trialEndsAt } = tenant;
  if (subscriptionStatus === 'canceled' || subscriptionStatus === 'unpaid') return false;
  if (subscriptionStatus === 'trialing' && trialEndsAt) {
    return new Date(trialEndsAt) > new Date();
  }
  return true;
}

/**
 * Fallback tenant id for admin/supplier write endpoints that aren't yet
 * reachable through path-based tenant middleware (see middleware.ts
 * BYPASS_PREFIXES). Used until a real tenant-scoped admin/supplier UI
 * exists — see docs/superpowers/specs/2026-07-24-agrovus-ecommerce-multitenant-design.md
 * "What's still open after this plan".
 */
export const FALLBACK_TENANT_ID = 'tenant_icc_default';

/** Thrown by getRequiredTenantId when a request carries no resolvable tenant. */
export class MissingTenantError extends Error {
  constructor() {
    super('Request did not include a resolvable tenant');
    this.name = 'MissingTenantError';
  }
}

/**
 * Resolve the tenant id for an API route.
 *
 * Path-scoped page routes get `x-tenant-id` injected by middleware. Routes
 * called same-origin without a tenant path segment (e.g. `fetch('/api/products')`
 * from a client component) must pass `?tenant_id=` explicitly — client code
 * should source that value from `useTenant().id` (components/tenant-provider.tsx).
 * Throws MissingTenantError when neither is present so callers can return a 400.
 */
export function getRequiredTenantId(request: NextRequest): string {
  const fromHeader = request.headers.get('x-tenant-id');
  if (fromHeader) return fromHeader;

  const fromQuery = request.nextUrl.searchParams.get('tenant_id');
  if (fromQuery) return fromQuery;

  throw new MissingTenantError();
}
