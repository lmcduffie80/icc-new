import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

describe('middleware — default tenant redirect', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('redirects the bare root path to the default tenant', async () => {
    const request = new NextRequest(new URL('http://localhost:3000/'));
    const response = await middleware(request);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/icc');
  });

  it('redirects an unresolved slug to the default tenant, preserving the path', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
    const request = new NextRequest(new URL('http://localhost:3000/shop'));
    const response = await middleware(request);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/icc/shop');
  });

  it('does not redirect API routes', async () => {
    const request = new NextRequest(new URL('http://localhost:3000/api/products'));
    const response = await middleware(request);
    expect(response.headers.get('location')).toBeNull();
  });

  it('passes through a resolved tenant slug with tenant headers set', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'tenant_icc_default',
        slug: 'icc',
        currency: 'USD',
        country: 'US',
        subscription_status: 'active',
      }),
    } as Response);
    const request = new NextRequest(new URL('http://localhost:3000/icc/shop'));
    const response = await middleware(request);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-request-x-tenant-id')).toBe('tenant_icc_default');
  });
});
