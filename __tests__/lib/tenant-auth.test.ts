import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createMockSession } from '../api/helpers/auth-mock';

const { mockQueryOne, mockGetSession } = vi.hoisted(() => ({
  mockQueryOne: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  queryOne: mockQueryOne,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

import {
  requireTenantAdmin,
  TenantAdminAuthError,
  tenantAdminAuthErrorResponse,
} from '@/lib/tenant-auth';

function requestWithTenant(tenantId: string): NextRequest {
  const url = new URL('http://localhost:3000/api/tenant/stripe/onboard');
  return new NextRequest(url, { headers: { 'x-tenant-id': tenantId } });
}

function requestWithoutTenant(): NextRequest {
  const url = new URL('http://localhost:3000/api/tenant/stripe/onboard');
  return new NextRequest(url);
}

describe('requireTenantAdmin', () => {
  beforeEach(() => {
    mockQueryOne.mockReset();
    mockGetSession.mockReset();
  });

  it('throws a 401 TenantAdminAuthError when there is no session', async () => {
    mockGetSession.mockResolvedValue(null);

    const request = requestWithTenant('tenant-a');

    await expect(requireTenantAdmin(request)).rejects.toMatchObject({
      name: 'TenantAdminAuthError',
      status: 401,
    });
  });

  it('throws a 401 TenantAdminAuthError when the session has no user', async () => {
    mockGetSession.mockResolvedValue({ user: null });

    const request = requestWithTenant('tenant-a');

    await expect(requireTenantAdmin(request)).rejects.toThrow(TenantAdminAuthError);
    await expect(requireTenantAdmin(request)).rejects.toMatchObject({ status: 401 });
  });

  it('throws a 400 TenantAdminAuthError when the tenant cannot be resolved, without leaking MissingTenantError', async () => {
    mockGetSession.mockResolvedValue(
      createMockSession({ id: 'user-1', email: 'user1@example.com' })
    );

    const request = requestWithoutTenant();

    let caught: unknown;
    try {
      await requireTenantAdmin(request);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(TenantAdminAuthError);
    expect((caught as TenantAdminAuthError).status).toBe(400);
    expect((caught as TenantAdminAuthError).name).not.toBe('MissingTenantError');
  });

  it('throws a 403 TenantAdminAuthError when no membership row exists for the user/tenant pair', async () => {
    mockGetSession.mockResolvedValue(
      createMockSession({ id: 'user-1', email: 'user1@example.com' })
    );
    mockQueryOne.mockResolvedValue(null);

    const request = requestWithTenant('tenant-a');

    await expect(requireTenantAdmin(request)).rejects.toMatchObject({
      name: 'TenantAdminAuthError',
      status: 403,
    });
  });

  it('throws a 403 TenantAdminAuthError when membership exists but role is customer', async () => {
    mockGetSession.mockResolvedValue(
      createMockSession({ id: 'user-1', email: 'user1@example.com' })
    );
    mockQueryOne.mockResolvedValue({ role: 'customer' });

    const request = requestWithTenant('tenant-a');

    await expect(requireTenantAdmin(request)).rejects.toMatchObject({
      name: 'TenantAdminAuthError',
      status: 403,
    });
  });

  it('resolves with the tenant admin context when membership role is tenant_admin', async () => {
    mockGetSession.mockResolvedValue(
      createMockSession({ id: 'user-1', email: 'user1@example.com' })
    );
    mockQueryOne.mockResolvedValue({ role: 'tenant_admin' });

    const request = requestWithTenant('tenant-a');

    const result = await requireTenantAdmin(request);

    expect(result).toEqual({
      userId: 'user-1',
      userEmail: 'user1@example.com',
      tenantId: 'tenant-a',
    });
  });

  it('scopes the membership lookup by both user_id and tenant_id, not user_id alone', async () => {
    mockGetSession.mockResolvedValue(
      createMockSession({ id: 'user-1', email: 'user1@example.com' })
    );
    mockQueryOne.mockResolvedValue({ role: 'tenant_admin' });

    const request = requestWithTenant('tenant-a');
    await requireTenantAdmin(request);

    expect(mockQueryOne).toHaveBeenCalledTimes(1);
    const [, params] = mockQueryOne.mock.calls[0];
    expect(params).toContain('user-1');
    expect(params).toContain('tenant-a');
  });

  it('does not treat a tenant_admin of tenant A as an admin of tenant B', async () => {
    mockGetSession.mockResolvedValue(
      createMockSession({ id: 'user-1', email: 'user1@example.com' })
    );
    // Simulate the DB correctly finding no row scoped to tenant-b for this user.
    mockQueryOne.mockResolvedValue(null);

    const request = requestWithTenant('tenant-b');

    await expect(requireTenantAdmin(request)).rejects.toMatchObject({ status: 403 });

    const [, params] = mockQueryOne.mock.calls[0];
    expect(params).toContain('tenant-b');
    expect(params).not.toContain('tenant-a');
  });
});

describe('tenantAdminAuthErrorResponse', () => {
  it('converts a TenantAdminAuthError into a NextResponse with matching status and message', async () => {
    const err = new TenantAdminAuthError(403, 'Forbidden');
    const res = tenantAdminAuthErrorResponse(err);

    expect(res).not.toBeNull();
    expect(res).toBeInstanceOf(NextResponse);
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body).toEqual({ error: 'Forbidden' });
  });

  it('returns null for errors that are not a TenantAdminAuthError', () => {
    const res = tenantAdminAuthErrorResponse(new Error('some other error'));
    expect(res).toBeNull();
  });
});
