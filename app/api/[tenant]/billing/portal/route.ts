import { NextRequest, NextResponse } from 'next/server';
import { getTenantBySlug } from '@/lib/tenant';
import { createBillingPortalSession } from '@/lib/billing';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);

  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!tenant.stripeCustomerId) {
    return NextResponse.redirect(new URL(`/${slug}/billing`, request.url));
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(new URL(`/${slug}/auth/sign-in`, request.url));

  try {
    const returnUrl = new URL(`/${slug}/billing`, request.url).href;
    const portalUrl = await createBillingPortalSession(tenant.stripeCustomerId, returnUrl);
    return NextResponse.redirect(portalUrl);
  } catch {
    return NextResponse.redirect(new URL(`/${slug}/billing?error=portal_failed`, request.url));
  }
}
