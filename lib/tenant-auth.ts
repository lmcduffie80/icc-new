import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from './auth';
import { queryOne } from './db';
import { getRequiredTenantId, MissingTenantError } from './tenant';

/**
 * Authenticated tenant-admin identity, resolved for the tenant the request
 * targets. Only present when the caller is a member of that specific tenant
 * with role `tenant_admin` — see `requireTenantAdmin`.
 */
export interface TenantAdminContext {
  userId: string;
  userEmail: string;
  tenantId: string;
}

/**
 * Thrown by `requireTenantAdmin` for every authorization failure so route
 * handlers can catch a single error type and map it straight to a response
 * via `tenantAdminAuthErrorResponse`.
 */
export class TenantAdminAuthError extends Error {
  constructor(public readonly status: 401 | 403 | 400, message: string) {
    super(message);
    this.name = 'TenantAdminAuthError';
  }
}

interface TenantMembershipRow {
  role: string;
}

/**
 * Authorize a request as coming from a `tenant_admin` of the specific
 * tenant it targets.
 *
 * This is distinct from `lib/admin-auth.ts`'s `requireAdmin`, which gates
 * ICC's own global staff console and has no notion of tenants. Here, "admin"
 * means "admin of this one tenant" — a role granted per-tenant via
 * `tenant_memberships`, not a global staff permission.
 *
 * Throws `TenantAdminAuthError`:
 * - 401 when there is no authenticated session.
 * - 400 when the request carries no resolvable tenant (wraps `MissingTenantError`).
 * - 403 when the user has no `tenant_memberships` row for this tenant, or
 *   has one but with `role !== 'tenant_admin'`.
 */
export async function requireTenantAdmin(
  request: NextRequest
): Promise<TenantAdminContext> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    throw new TenantAdminAuthError(401, 'Unauthorized');
  }

  let tenantId: string;
  try {
    tenantId = getRequiredTenantId(request);
  } catch (err) {
    if (err instanceof MissingTenantError) {
      throw new TenantAdminAuthError(400, 'Missing tenant context');
    }
    throw err;
  }

  const membership = await queryOne<TenantMembershipRow>(
    `SELECT role FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2`,
    [session.user.id, tenantId]
  );

  if (!membership || membership.role !== 'tenant_admin') {
    throw new TenantAdminAuthError(
      403,
      'Forbidden: you are not an admin of this tenant'
    );
  }

  return {
    userId: session.user.id,
    userEmail: session.user.email,
    tenantId,
  };
}

/**
 * Turn a caught error into a `NextResponse` when it's a `TenantAdminAuthError`,
 * or return `null` so the caller can re-throw/handle anything else.
 *
 * Usage in a route handler:
 * ```ts
 * try {
 *   const { tenantId } = await requireTenantAdmin(request);
 *   ...
 * } catch (err) {
 *   const res = tenantAdminAuthErrorResponse(err);
 *   if (res) return res;
 *   throw err;
 * }
 * ```
 */
export function tenantAdminAuthErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof TenantAdminAuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return null;
}
