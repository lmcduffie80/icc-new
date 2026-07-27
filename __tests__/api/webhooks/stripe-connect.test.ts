import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockRequest } from '../helpers/request-helpers';

const { mockConstructEvent, mockQuery, mockQueryOne } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  },
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

import { POST } from '@/app/api/webhooks/stripe-connect/route';

function makeRequest(signature: string | null = 'sig_test_123') {
  return createMockRequest('/api/webhooks/stripe-connect', {
    method: 'POST',
    body: { raw: 'irrelevant-since-constructEvent-is-mocked' },
    headers: signature ? { 'stripe-signature': signature } : {},
  });
}

function makeAccountUpdatedEvent(overrides: {
  id?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
} = {}) {
  return {
    id: 'evt_test_123',
    type: 'account.updated',
    data: {
      object: {
        id: 'acct_test_123',
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        ...overrides,
      },
    },
  };
}

describe('POST /api/webhooks/stripe-connect', () => {
  const originalSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_test_secret';
    mockQueryOne.mockResolvedValue(null); // no existing webhook event / tenant by default
    mockQuery.mockResolvedValue([]);
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    } else {
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET = originalSecret;
    }
  });

  it('returns 400 and makes no DB calls when the stripe-signature header is missing', async () => {
    const request = makeRequest(null);

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Missing signature' });
    expect(mockConstructEvent).not.toHaveBeenCalled();
    expect(mockQueryOne).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 400 and makes no DB calls when STRIPE_CONNECT_WEBHOOK_SECRET is not configured', async () => {
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    const request = makeRequest();

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(mockConstructEvent).not.toHaveBeenCalled();
    expect(mockQueryOne).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 400 and makes no DB calls when signature verification fails', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });
    const request = makeRequest('bad-signature');

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Invalid signature' });
    expect(mockQueryOne).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 200 without reprocessing when the event was already recorded (duplicate)', async () => {
    const event = makeAccountUpdatedEvent();
    mockConstructEvent.mockReturnValue(event);
    mockQueryOne.mockResolvedValueOnce({
      id: 'row-1',
      event_id: event.id,
      event_type: event.type,
      status: 'processed',
      processed_at: new Date().toISOString(),
    });

    const request = makeRequest();
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true, duplicate: true });
    // Only the idempotency lookup should have run — no tenant lookup/update.
    expect(mockQueryOne).toHaveBeenCalledTimes(1);
    expect(mockQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE tenants'),
      expect.anything()
    );
  });

  it('updates the matching tenant with mapped values and marks the event processed for a known account', async () => {
    const event = makeAccountUpdatedEvent({
      id: 'acct_known_123',
      charges_enabled: true,
      payouts_enabled: false,
      details_submitted: true,
    });
    mockConstructEvent.mockReturnValue(event);
    mockQueryOne
      .mockResolvedValueOnce(null) // not a duplicate event
      .mockResolvedValueOnce({ id: 'tenant-42' }); // tenant lookup by connect account id

    const request = makeRequest();
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true });

    expect(mockQueryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM tenants'),
      ['acct_known_123']
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE tenants'),
      [true, false, true, 'tenant-42']
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stripe_webhook_events'),
      [event.id, 'account.updated', 'processed', null]
    );
  });

  it('returns 200 and marks the event processed (not failed) when no tenant matches the account', async () => {
    const event = makeAccountUpdatedEvent({ id: 'acct_unlinked_999' });
    mockConstructEvent.mockReturnValue(event);
    mockQueryOne
      .mockResolvedValueOnce(null) // not a duplicate event
      .mockResolvedValueOnce(null); // no tenant found for this account
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const request = makeRequest();
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(mockQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE tenants'),
      expect.anything()
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stripe_webhook_events'),
      [event.id, 'account.updated', 'processed', null]
    );
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it('returns 200 and marks unrelated/unhandled event types as processed without touching tenants', async () => {
    const event = {
      id: 'evt_capability_1',
      type: 'capability.updated',
      data: { object: { id: 'cap_123' } },
    };
    mockConstructEvent.mockReturnValue(event);
    mockQueryOne.mockResolvedValueOnce(null); // not a duplicate

    const request = makeRequest();
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(mockQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE tenants'),
      expect.anything()
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stripe_webhook_events'),
      [event.id, 'capability.updated', 'processed', null]
    );
  });

  it('marks the event failed with the error message but still returns 200 when a DB error occurs during processing', async () => {
    const event = makeAccountUpdatedEvent({ id: 'acct_dberror_1' });
    mockConstructEvent.mockReturnValue(event);
    mockQueryOne
      .mockResolvedValueOnce(null) // not a duplicate event
      .mockRejectedValueOnce(new Error('connection terminated unexpectedly')); // tenant lookup blows up
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = makeRequest();
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true, error: 'Processing failed but acknowledged' });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stripe_webhook_events'),
      [event.id, 'account.updated', 'failed', 'connection terminated unexpectedly']
    );

    consoleErrorSpy.mockRestore();
  });
});
