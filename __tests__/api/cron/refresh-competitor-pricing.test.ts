import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/cron/refresh-competitor-pricing/route';
import { createMockRequest } from '../helpers/request-helpers';

const { mockRefresh } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
}));

vi.mock('@/lib/competitor-refresh', () => ({
  refreshCompetitorPricing: mockRefresh,
}));

vi.mock('@/lib/security-logger', () => ({
  securityLogger: {
    logEvent: vi.fn(),
    logError: vi.fn(),
  },
}));

describe('POST /api/cron/refresh-competitor-pricing', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    mockRefresh.mockReset();
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it('returns 401 when Authorization header is missing', async () => {
    const request = createMockRequest('/api/cron/refresh-competitor-pricing', {
      method: 'POST',
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('returns 401 with incorrect cron secret', async () => {
    const request = createMockRequest('/api/cron/refresh-competitor-pricing', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('runs the refresh when the correct cron secret is supplied', async () => {
    mockRefresh.mockResolvedValueOnce({
      ingredientsProcessed: 2,
      competitorsProcessed: 3,
      listingsUpserted: 5,
      notFound: 1,
      failed: 0,
      durationMs: 1234,
    });

    const request = createMockRequest('/api/cron/refresh-competitor-pricing', {
      method: 'POST',
      headers: { authorization: 'Bearer test-cron-secret' },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.summary.listingsUpserted).toBe(5);
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it('returns 500 when the refresh throws', async () => {
    mockRefresh.mockRejectedValueOnce(new Error('boom'));
    const request = createMockRequest('/api/cron/refresh-competitor-pricing', {
      method: 'POST',
      headers: { authorization: 'Bearer test-cron-secret' },
    });
    const response = await POST(request);
    expect(response.status).toBe(500);
  });
});
