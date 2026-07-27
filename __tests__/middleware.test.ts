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

  it('does not bypass a tenant slug that merely starts with a bypass prefix (e.g. "apitools")', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false } as Response);
    global.fetch = fetchMock;
    const request = new NextRequest(new URL('http://localhost:3000/apitools/shop'));
    const response = await middleware(request);

    // Proceeding to tenant resolution (rather than being bypassed outright)
    // means fetch was actually called for the "apitools" slug...
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: 'http://localhost:3000/api/internal/tenant/apitools' }),
      expect.anything()
    );
    // ...and, since resolution fails, it falls back to the default tenant
    // redirect rather than being treated as an API route (no redirect at all).
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/icc/apitools/shop');
  });

  it('does not redirect when the default tenant itself fails to resolve (avoids a redirect loop)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
    const request = new NextRequest(new URL('http://localhost:3000/icc/whatever'));
    const response = await middleware(request);
    expect(response.headers.get('location')).toBeNull();
  });

  it('preserves the query string when redirecting an unresolved slug to the default tenant', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
    const request = new NextRequest(new URL('http://localhost:3000/shop?category=herbicides'));
    const response = await middleware(request);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/icc/shop?category=herbicides'
    );
  });

  it('preserves the query string when redirecting the bare root path to the default tenant', async () => {
    const request = new NextRequest(new URL('http://localhost:3000/?ref=email-campaign'));
    const response = await middleware(request);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/icc?ref=email-campaign');
  });

  it('does not redirect root-level static assets from /public (e.g. images)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false } as Response);
    global.fetch = fetchMock;
    const request = new NextRequest(new URL('http://localhost:3000/hero-corn-field.jpg'));
    const response = await middleware(request);
    expect(response.headers.get('location')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not redirect nested static assets from /public (e.g. /states/GA.svg)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false } as Response);
    global.fetch = fetchMock;
    const request = new NextRequest(new URL('http://localhost:3000/states/GA.svg'));
    const response = await middleware(request);
    expect(response.headers.get('location')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
