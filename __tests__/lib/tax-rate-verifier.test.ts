import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

// Import after mock is set up
const { verifyTaxRates } = await import('@/lib/tax-rate-verifier');

describe('verifyTaxRates', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('returns null when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await verifyTaxRates([{ stateCode: 'CA', rate: 0.0725 }]);
    expect(result).toBeNull();
  });

  it('returns empty array when no rates are provided', async () => {
    const result = await verifyTaxRates([]);
    expect(result).toEqual([]);
  });

  it('returns verification results with match verdict', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              stateCode: 'CA',
              suggestedRate: 0.0725,
              verdict: 'match',
              reasoning: 'California applies standard sales tax to pesticides.',
            },
          ]),
        },
      ],
    });

    const result = await verifyTaxRates([{ stateCode: 'CA', rate: 0.0725 }]);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].stateCode).toBe('CA');
    expect(result![0].configuredRate).toBe(0.0725);
    expect(result![0].suggestedRate).toBe(0.0725);
    expect(result![0].verdict).toBe('match');
    expect(result![0].reasoning).toContain('California');
  });

  it('returns mismatch verdict when rates differ', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              stateCode: 'TX',
              suggestedRate: 0,
              verdict: 'mismatch',
              reasoning: 'Texas exempts pesticides sold to farmers from sales tax.',
            },
          ]),
        },
      ],
    });

    const result = await verifyTaxRates([{ stateCode: 'TX', rate: 0.0625 }]);

    expect(result).not.toBeNull();
    expect(result![0].verdict).toBe('mismatch');
    expect(result![0].configuredRate).toBe(0.0625);
    expect(result![0].suggestedRate).toBe(0);
  });

  it('returns null when Claude returns invalid JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json' }],
    });

    const result = await verifyTaxRates([{ stateCode: 'CA', rate: 0.0725 }]);
    expect(result).toBeNull();
  });

  it('returns null when Claude API throws', async () => {
    mockCreate.mockRejectedValue(new Error('API error'));

    const result = await verifyTaxRates([{ stateCode: 'CA', rate: 0.0725 }]);
    expect(result).toBeNull();
  });

  it('normalizes unknown verdict values to "unknown"', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              stateCode: 'NY',
              suggestedRate: 0.04,
              verdict: 'uncertain',
              reasoning: 'New York has complex exemption rules.',
            },
          ]),
        },
      ],
    });

    const result = await verifyTaxRates([{ stateCode: 'NY', rate: 0.04 }]);
    expect(result).not.toBeNull();
    expect(result![0].verdict).toBe('unknown');
  });
});
