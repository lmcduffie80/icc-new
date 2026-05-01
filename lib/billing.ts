import { stripe } from './stripe';
import { query, queryOne } from './db';
import { securityLogger } from './security-logger';
import type { Tenant, Plan } from './tenant';

export interface CheckoutSessionResult {
  url: string;
  sessionId: string;
}

/**
 * Create or retrieve a Stripe customer for a tenant (billing, not product orders).
 */
export async function getOrCreateTenantStripeCustomer(
  tenantId: string,
  tenantName: string,
  email: string
): Promise<string> {
  const tenant = await queryOne<{ stripe_customer_id: string | null }>(
    `SELECT stripe_customer_id FROM tenants WHERE id = $1`,
    [tenantId]
  );

  if (tenant?.stripe_customer_id) {
    return tenant.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    name: tenantName,
    email,
    metadata: { tenant_id: tenantId },
  });

  await query(
    `UPDATE tenants SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2`,
    [customer.id, tenantId]
  );

  return customer.id;
}

/**
 * Create a Stripe Checkout session to start a new subscription.
 */
export async function createSubscriptionCheckout(
  tenant: Tenant,
  plan: Plan,
  cycle: 'monthly' | 'annual',
  adminEmail: string,
  successUrl: string,
  cancelUrl: string
): Promise<CheckoutSessionResult> {
  const stripeCustomerId = await getOrCreateTenantStripeCustomer(
    tenant.id,
    tenant.name,
    adminEmail
  );

  const priceId =
    cycle === 'annual' ? plan.features['stripe_annual_price_id'] : plan.features['stripe_monthly_price_id'];

  if (!priceId || typeof priceId !== 'string') {
    throw new Error(`No Stripe price ID configured for plan "${plan.name}" (${cycle})`);
  }

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { tenant_id: tenant.id, plan_id: plan.id, cycle },
    subscription_data: {
      metadata: { tenant_id: tenant.id, plan_id: plan.id },
    },
  });

  if (!session.url) throw new Error('Stripe Checkout session created without URL');
  return { url: session.url, sessionId: session.id };
}

/**
 * Create a Stripe Customer Portal session for self-serve billing management.
 */
export async function createBillingPortalSession(
  stripeCustomerId: string,
  returnUrl: string
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
  return session.url;
}

/**
 * Apply a Stripe subscription event to the tenants table.
 * Called from the stripe-billing webhook handler.
 */
export async function syncSubscriptionToTenant(
  subscriptionId: string,
  stripeCustomerId: string,
  status: string
): Promise<void> {
  try {
    await query(
      `UPDATE tenants
       SET stripe_subscription_id = $1,
           subscription_status    = $2,
           updated_at             = NOW()
       WHERE stripe_customer_id   = $3`,
      [subscriptionId, mapStripeStatus(status), stripeCustomerId]
    );
  } catch (err) {
    securityLogger.logError('Failed to sync subscription to tenant', err, 'system', {
      subscriptionId,
      stripeCustomerId,
      status,
    });
    throw err;
  }
}

/**
 * Map Stripe subscription status to our internal status vocabulary.
 */
function mapStripeStatus(stripeStatus: string): string {
  const map: Record<string, string> = {
    active: 'active',
    past_due: 'past_due',
    unpaid: 'unpaid',
    canceled: 'canceled',
    incomplete: 'past_due',
    incomplete_expired: 'canceled',
    trialing: 'trialing',
    paused: 'past_due',
  };
  return map[stripeStatus] ?? stripeStatus;
}

/**
 * Get all available plans for display.
 */
export async function getPlans(): Promise<Plan[]> {
  const rows = await query<{
    id: string;
    name: string;
    display_name: string;
    price_monthly_usd: string | null;
    price_annual_usd: string | null;
    features: Record<string, boolean | number>;
    sort_order: number;
  }>(
    `SELECT id, name, display_name, price_monthly_usd, price_annual_usd, features, sort_order
     FROM plans
     WHERE is_active = true
     ORDER BY sort_order ASC`
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    displayName: r.display_name,
    priceMonthlyUsd: r.price_monthly_usd ? parseFloat(r.price_monthly_usd) : null,
    priceAnnualUsd: r.price_annual_usd ? parseFloat(r.price_annual_usd) : null,
    features: r.features ?? {},
  }));
}
