import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/tax/calculate/route';

// Mock dependencies
vi.mock('@/lib/rate-limit', () => ({
  rateLimiters: {
    lenient: { limit: 10, windowMs: 60000 },
  },
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  createRateLimitResponse: vi.fn(),
}));

vi.mock('@/lib/tax', () => ({
  calculateTax: vi.fn(),
  getTaxRateForState: vi.fn(),
}));

import { calculateTax, getTaxRateForState } from '@/lib/tax';

describe('/api/tax/calculate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should calculate tax for California', async () => {
    (calculateTax as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(2.1);
    (getTaxRateForState as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(0.021);

    const request = new NextRequest('http://localhost:3000/api/tax/calculate', {
      method: 'POST',
      body: JSON.stringify({
        subtotal: 100,
        state: 'CA',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.tax).toBe(2.1);
    expect(data.rate).toBe(0.021);
    expect(data.state).toBe('CA');
  });

  it('should return 0% tax for unconfigured state', async () => {
    (calculateTax as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (getTaxRateForState as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const request = new NextRequest('http://localhost:3000/api/tax/calculate', {
      method: 'POST',
      body: JSON.stringify({
        subtotal: 100,
        state: 'OR',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.tax).toBe(0);
    expect(data.rate).toBe(0);
    expect(data.state).toBe('OR');
  });

  it('should reject invalid state code', async () => {
    const request = new NextRequest('http://localhost:3000/api/tax/calculate', {
      method: 'POST',
      body: JSON.stringify({
        subtotal: 100,
        state: 'INVALID',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('should reject negative subtotal', async () => {
    const request = new NextRequest('http://localhost:3000/api/tax/calculate', {
      method: 'POST',
      body: JSON.stringify({
        subtotal: -100,
        state: 'CA',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('should reject missing fields', async () => {
    const request = new NextRequest('http://localhost:3000/api/tax/calculate', {
      method: 'POST',
      body: JSON.stringify({
        subtotal: 100,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('should handle server errors gracefully', async () => {
    (calculateTax as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Database error'));

    const request = new NextRequest('http://localhost:3000/api/tax/calculate', {
      method: 'POST',
      body: JSON.stringify({
        subtotal: 100,
        state: 'CA',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to calculate tax');
  });
});
