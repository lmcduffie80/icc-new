import { NextRequest, NextResponse } from 'next/server';
import {
  requireTenantAdmin,
  tenantAdminAuthErrorResponse,
  type TenantAdminContext,
} from '@/lib/tenant-auth';
import { getTenantById } from '@/lib/tenant';
import {
  getOrCreateConnectAccountForTenant,
  createConnectOnboardingLink,
} from '@/lib/stripe-connect';

/**
 * POST /api/tenant-admin/connect/onboard
 *
 * Starts (or resumes) Stripe Connect onboarding for the calling tenant admin's
 * own tenant, returning a hosted Account Link URL to redirect the browser to.
 */
export async function POST(request: NextRequest) {
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

  const origin = new URL(request.url).origin;
  const returnUrl = `${origin}/${tenant.slug}/account/payments-setup?onboarding=complete`;
  const refreshUrl = `${origin}/${tenant.slug}/account/payments-setup?onboarding=refresh`;

  try {
    const accountId = await getOrCreateConnectAccountForTenant(tenant, admin.userEmail);
    const url = await createConnectOnboardingLink(
      accountId,
      tenant.paymentsMode,
      returnUrl,
      refreshUrl
    );
    return NextResponse.json({ url });
  } catch (err) {
    console.error('[POST /api/tenant-admin/connect/onboard] error:', err);
    return NextResponse.json(
      { error: 'Unable to start payment onboarding. Please try again.' },
      { status: 502 }
    );
  }
}
