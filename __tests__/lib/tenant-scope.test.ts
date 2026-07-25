import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { getRequiredTenantId, MissingTenantError } from '@/lib/tenant';

function requestWith(opts: { header?: string; query?: string }): NextRequest {
  const url = new URL('http://localhost:3000/api/products');
  if (opts.query) url.searchParams.set('tenant_id', opts.query);
  const headers: Record<string, string> = {};
  if (opts.header) headers['x-tenant-id'] = opts.header;
  return new NextRequest(url, { headers });
}

describe('getRequiredTenantId', () => {
  it('prefers the x-tenant-id header (set by middleware for path-scoped routes)', () => {
    const request = requestWith({ header: 'tenant-from-header', query: 'tenant-from-query' });
    expect(getRequiredTenantId(request)).toBe('tenant-from-header');
  });

  it('falls back to the tenant_id query param when no header is present', () => {
    const request = requestWith({ query: 'tenant-from-query' });
    expect(getRequiredTenantId(request)).toBe('tenant-from-query');
  });

  it('throws MissingTenantError when neither is present', () => {
    const request = requestWith({});
    expect(() => getRequiredTenantId(request)).toThrow(MissingTenantError);
  });
});
