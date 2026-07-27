import { stripe } from './stripe';
import { query } from './db';
import type { Tenant } from './tenant';

export interface ConnectAccountStatusSnapshot {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

/**
 * Get a tenant's Stripe Connect account id, creating one via the v2 Core
 * Accounts API if it doesn't exist yet. The shape of the create request
 * differs by payments mode:
 * - `icc_managed`: ICC is merchant of record, so the tenant only needs a
 *   `recipient` configuration (payouts) and ICC (the application) collects
 *   fees/losses.
 * - `own_stripe`: the tenant is merchant of record, so it needs both
 *   `merchant` (to accept charges via `on_behalf_of`) and `recipient`
 *   configurations, and Stripe collects fees/losses directly from the tenant.
 */
export async function getOrCreateConnectAccountForTenant(
  tenant: Tenant,
  contactEmail: string
): Promise<string> {
  if (tenant.stripeConnectAccountId) {
    return tenant.stripeConnectAccountId;
  }

  // Hardcoded 'us' (lowercase) for this Phase 2 pass — CA (tenant.country can
  // be 'US'|'CA') is not yet verified to work the same way. CA support is
  // future work.
  const identity = { country: 'us' as const };

  const account =
    tenant.paymentsMode === 'icc_managed'
      ? await stripe.v2.core.accounts.create({
          display_name: tenant.name,
          contact_email: contactEmail,
          dashboard: 'express',
          identity,
          configuration: {
            recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
          },
          defaults: {
            currency: 'usd',
            responsibilities: { fees_collector: 'application', losses_collector: 'application' },
          },
          metadata: { tenant_id: tenant.id },
        })
      : await stripe.v2.core.accounts.create({
          display_name: tenant.name,
          contact_email: contactEmail,
          dashboard: 'full',
          identity,
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

  await query(
    `UPDATE tenants SET stripe_connect_account_id = $1, updated_at = NOW() WHERE id = $2`,
    [account.id, tenant.id]
  );

  return account.id;
}

/**
 * Create an onboarding Account Link for a Connect account. `own_stripe`
 * accounts need both `merchant` and `recipient` configurations onboarded
 * since they are the settlement merchant; `icc_managed` accounts only need
 * `recipient` (payouts).
 */
export async function createConnectOnboardingLink(
  accountId: string,
  paymentsMode: 'own_stripe' | 'icc_managed',
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  const configurations: Array<'merchant' | 'recipient'> =
    paymentsMode === 'icc_managed' ? ['recipient'] : ['merchant', 'recipient'];

  const accountLink = await stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        configurations,
        return_url: returnUrl,
        refresh_url: refreshUrl,
      },
    },
  });

  return accountLink.url;
}

/**
 * Pure mapping from the flat v1 Stripe account fields to our camelCase
 * status snapshot. Exported so the webhook handler (which receives the same
 * flat shape in `event.data.object` for `account.updated` events) can reuse
 * this instead of duplicating the mapping.
 */
export function mapStripeAccountToStatusSnapshot(account: {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}): ConnectAccountStatusSnapshot {
  return {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  };
}

/**
 * Live-check a Connect account's status. Deliberately uses the v1
 * `stripe.accounts.retrieve` method (not the deeply-nested v2 `configuration.*`
 * shape) since it returns simple, flat booleans.
 */
export async function getConnectAccountStatusSnapshot(
  accountId: string
): Promise<ConnectAccountStatusSnapshot> {
  const account = await stripe.accounts.retrieve(accountId);
  return mapStripeAccountToStatusSnapshot(account);
}

/**
 * Calculate the `application_fee_amount` (in cents) ICC collects on an
 * order. Callers must pass integer cents for `amountCents` — this function
 * does not validate that.
 */
export function calculateApplicationFeeCents(amountCents: number, commissionBps: number): number {
  if (commissionBps <= 0) return 0;

  const naiveFee = Math.round((amountCents * commissionBps) / 10000);

  // Stripe rejects application_fee_amount >= the charge amount, so clamp
  // below the full amount (shouldn't happen at realistic bps, but guard
  // anyway). `maxFee` floors at 0 so a zero/negative amountCents never
  // produces a negative upper bound.
  const maxFee = Math.max(amountCents - 1, 0);
  return Math.min(Math.max(naiveFee, 0), maxFee);
}
