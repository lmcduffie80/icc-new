import { NextRequest, NextResponse } from 'next/server';

// Routes that bypass tenant resolution entirely
const BYPASS_PREFIXES = [
  '/admin',
  '/supplier',
  '/api/admin',
  '/api/supplier',
  '/api/auth',
  '/api/webhooks',
  '/api/internal',
  '/_next',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
];

// Known tenant-independent API routes
const STATIC_API_PREFIXES = ['/api/categories', '/api/products'];

// The impersonation "end" route must stay accessible from the portal
const IMPERSONATION_COOKIE = 'admin_impersonation_token';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let bypass routes through immediately
  if (BYPASS_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (STATIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Extract first path segment as potential tenant slug
  const segments = pathname.split('/').filter(Boolean);
  const slug = segments[0];

  // Root path — no tenant in URL yet, let through (will show tenant selector or redirect)
  if (!slug) {
    return NextResponse.next();
  }

  // Resolve tenant from DB via the lightweight internal API
  // We use a direct DB lookup via the edge-compatible fetch to avoid importing
  // server-only modules directly in middleware.
  const tenantRes = await fetch(
    new URL(`/api/internal/tenant/${slug}`, request.url),
    {
      headers: { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' },
      // Short timeout — if DB is unavailable, let the request through anyway
    }
  ).catch(() => null);

  if (!tenantRes || !tenantRes.ok) {
    // Slug not found as a tenant — pass through (could be a static route like /about)
    return NextResponse.next();
  }

  const tenant = await tenantRes.json().catch(() => null);
  if (!tenant) {
    return NextResponse.next();
  }

  // Subscription gate: canceled/unpaid → redirect to billing page
  // (unless already on the billing route)
  const isBillingPath = pathname.startsWith(`/${slug}/billing`);
  if (!isBillingPath) {
    const blocked =
      tenant.subscription_status === 'canceled' ||
      tenant.subscription_status === 'unpaid' ||
      (tenant.subscription_status === 'trialing' &&
        tenant.trial_ends_at &&
        new Date(tenant.trial_ends_at) < new Date());

    if (blocked) {
      return NextResponse.redirect(new URL(`/${slug}/billing`, request.url));
    }
  }

  // Inject tenant context into request headers for downstream handlers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-id', tenant.id);
  requestHeaders.set('x-tenant-slug', tenant.slug);
  requestHeaders.set('x-tenant-currency', tenant.currency ?? 'USD');
  requestHeaders.set('x-tenant-country', tenant.country ?? 'US');
  requestHeaders.set('x-tenant-subscription', tenant.subscription_status ?? 'active');
  requestHeaders.set('x-past-due', tenant.subscription_status === 'past_due' ? '1' : '0');
  requestHeaders.set('x-mfa-required', tenant.mfa_required ? '1' : '0');

  // ── Impersonation detection ──────────────────────────────────────────────
  // If the request carries an impersonation token, validate it via the
  // internal API (avoids importing pg/Node modules into the Edge runtime).
  const impersonationToken = request.cookies.get(IMPERSONATION_COOKIE)?.value;
  if (impersonationToken) {
    const impersonationRes = await fetch(
      new URL('/api/internal/impersonation', request.url),
      {
        headers: {
          'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
          'x-impersonation-token': impersonationToken,
        },
      }
    ).catch(() => null);

    if (impersonationRes?.ok) {
      const imp = await impersonationRes.json().catch(() => null);
      if (imp) {
        requestHeaders.set('x-impersonating-user-id', imp.target_user_id);
        requestHeaders.set('x-impersonating-user-name', imp.target_user_name ?? '');
        requestHeaders.set('x-impersonating-admin-id', imp.admin_user_id);
        requestHeaders.set('x-impersonating-admin-name', imp.admin_name ?? '');
        requestHeaders.set('x-impersonating-admin-email', imp.admin_email ?? '');
      }
    }
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except Next.js internals and static files.
     * Tenant resolution only runs for paths that could be tenant-scoped.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
