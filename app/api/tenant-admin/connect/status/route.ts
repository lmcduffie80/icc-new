import { NextRequest, NextResponse } from 'next/server';
import {
  requireTenantAdmin,
  tenantAdminAuthErrorResponse,
  type TenantAdminContext,
} from '@/lib/tenant-auth';
import { getTenantById } from '@/lib/tenant';
import { getConnectAccountStatusSnapshot } from '@/lib/stripe-connect';
import { query } from '@/lib/db';

interface ConnectStatusResponse {
  paymentsMode: 'own_stripe' | 'icc_managed';
  hasConnectAccount: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  needsOnboarding: boolean;
}

/**
 * GET /api/tenant-admin/connect/status
 *
 * Reports the calling tenant admin's own tenant's Stripe Connect onboarding
 * status. When a Connect account exists, this does a LIVE Stripe check
 * (rather than trusting the DB cache) so a tenant admin who just finished
 * Stripe's hosted onboarding and got redirected back sees fresh data even if
 * the `account.updated` webhook hasn't landed yet. The live values are
 * opportunistically written back to the DB cache on success.
 */
export async function GET(request: NextRequest) {
  let admin: TenantAdminContext;
  try {
    admin = await requireTenantAdmin(request);
  } catch (err) {
    const res = tenantAdminAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

  const tenant = await getTenantById(admin.tenantId);
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  if (!tenant.stripeConnectAccountId) {
    return NextResponse.json<ConnectStatusResponse>({
      paymentsMode: tenant.paymentsMode,
      hasConnectAccount: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      needsOnboarding: true,
    });
  }

  try {
    const snapshot = await getConnectAccountStatusSnapshot(tenant.stripeConnectAccountId);

    await query(
      `UPDATE tenants SET stripe_connect_charges_enabled = $1, stripe_connect_payouts_enabled = $2, stripe_connect_details_submitted = $3, updated_at = NOW() WHERE id = $4`,
      [snapshot.chargesEnabled, snapshot.payoutsEnabled, snapshot.detailsSubmitted, tenant.id]
    );

    return NextResponse.json<ConnectStatusResponse>({
      paymentsMode: tenant.paymentsMode,
      hasConnectAccount: true,
      chargesEnabled: snapshot.chargesEnabled,
      payoutsEnabled: snapshot.payoutsEnabled,
      detailsSubmitted: snapshot.detailsSubmitted,
      needsOnboarding: !snapshot.chargesEnabled,
    });
  } catch (err) {
    console.error('[GET /api/tenant-admin/connect/status] live Stripe check failed:', err);

    return NextResponse.json<ConnectStatusResponse>({
      paymentsMode: tenant.paymentsMode,
      hasConnectAccount: true,
      chargesEnabled: tenant.stripeConnectChargesEnabled,
      payoutsEnabled: tenant.stripeConnectPayoutsEnabled,
      detailsSubmitted: tenant.stripeConnectDetailsSubmitted,
      needsOnboarding: !tenant.stripeConnectChargesEnabled,
    });
  }
}
