import { NextRequest, NextResponse } from 'next/server';

// The path-based fallback tenant. Any request that isn't already scoped to
// a real tenant slug redirects here (see DEFAULT_TENANT_SLUG below).
const DEFAULT_TENANT_SLUG = 'icc';

// Routes that resolve their own tenant context (headers/query param) instead
// of via the URL's first path segment — see lib/tenant.ts#getRequiredTenantId.
// All /api/* calls are same-origin fetches with no tenant prefix in their
// path (e.g. fetch('/api/products')), so path-based slug resolution never
// applies to them.
const BYPASS_PREFIXES = [
  '/admin',
  '/supplier',
  '/api',
  '/_next',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
];

// The impersonation "end" route must stay accessible from the portal
const IMPERSONATION_COOKIE = 'admin_impersonation_token';

// A path matches a bypass prefix only if it IS that prefix or is nested
// under it (prefix + '/'). Plain `startsWith` would let a real tenant slug
// like "apitools" or "administrator" collide with "/api" or "/admin".
function isBypassPath(pathname: string): boolean {
  return BYPASS_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const search = request.nextUrl.search;

  // Let bypass routes through immediately
  if (isBypassPath(pathname)) {
    return NextResponse.next();
  }

  // Extract first path segment as potential tenant slug
  const segments = pathname.split('/').filter(Boolean);
  const slug = segments[0];

  // No tenant in the URL at all (e.g. bare "/") — send to the default tenant.
  if (!slug) {
    return NextResponse.redirect(new URL(`/${DEFAULT_TENANT_SLUG}${search}`, request.url));
  }

  // Resolve tenant from DB via the lightweight internal API
  // We use a direct DB lookup via the edge-compatible fetch to avoid importing
  // server-only modules directly in middleware.
  const tenantRes = await fetch(
    new URL(`/api/internal/tenant/${slug}`, request.url),
    {
      headers: { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' },
    }
  ).catch(() => null);

  // The default tenant is itself already the redirect target for unresolved
  // slugs. If IT fails to resolve (DB outage, bad INTERNAL_API_SECRET, the
  // row itself missing), redirecting again would produce an unbounded
  // /icc/icc/icc/... loop for every visitor. Fall through instead, matching
  // the old failure-tolerant behavior, but only for this specific case.
  const isDefaultSlug = slug === DEFAULT_TENANT_SLUG;

  if (!tenantRes || !tenantRes.ok) {
    if (isDefaultSlug) {
      return NextResponse.next();
    }
    // First segment isn't a real tenant slug — this used to fall through to
    // the legacy unscoped app/(main) route tree. That tree no longer exists,
    // so redirect to the same path under the default tenant instead.
    return NextResponse.redirect(new URL(`/${DEFAULT_TENANT_SLUG}${pathname}${search}`, request.url));
  }

  const tenant = await tenantRes.json().catch(() => null);
  if (!tenant) {
    if (isDefaultSlug) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL(`/${DEFAULT_TENANT_SLUG}${pathname}${search}`, request.url));
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
