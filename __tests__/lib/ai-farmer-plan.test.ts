import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

import { generateFarmerPlan } from '@/lib/ai';
import type { ProductForAI } from '@/lib/ai';

const MOCK_PRODUCTS: ProductForAI[] = [
  {
    id: 'prod-1',
    name: 'Glyphosate 41%',
    category: 'Herbicides',
    price: '3975.00',
    unit_of_measure: 'tote',
    active_ingredients: 'Glyphosate 41%',
    application_rate_range: '22-32 fl oz per acre',
    container_sizes: '265 gallon tote',
    package_type: 'Tote',
    lbs_per_gallon: '10',
    epa_registration_number: '524-549',
    epa_signal_word: 'CAUTION',
    features: ['Broad-spectrum weed control'],
    specifications: { 'Application Rate': '22-32 fl oz per acre' },
  },
  {
    id: 'prod-2',
    name: 'Pre-Emerge Herbicide',
    category: 'Herbicides',
    price: '120.00',
    unit_of_measure: 'gallon',
    active_ingredients: 'Metolachlor 84%',
    application_rate_range: '1.5-2.5 pt per acre',
    container_sizes: '2.5 gallon jug',
    package_type: 'Jug',
    lbs_per_gallon: null,
    epa_registration_number: '100-999',
    epa_signal_word: 'CAUTION',
    features: null,
    specifications: null,
  },
];

const VALID_DRAFT = {
  passes: [
    {
      name: 'Pre-Emergent Herbicide',
      category: 'Pre-Emergent',
      timing_label: 'At planting',
      sort_order: 1,
      products: [
        {
          product_id: 'prod-2',
          product_name: 'Pre-Emerge Herbicide',
          is_recommended: true,
          rate_per_acre: 2.0,
          rate_unit: 'pt',
          unit_size: 2.5,
          unit_size_unit: 'gal',
          lbs_per_gallon: null,
          reasoning: 'Effective residual control for waterhemp',
        },
      ],
    },
  ],
  summary: 'Waterhemp control program for corn',
  weed_management_notes: 'Use multiple modes of action to prevent resistance.',
};

describe('generateFarmerPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key-123';
  });

  it('should throw when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      generateFarmerPlan('corn', ['Waterhemp'], 'moderate', MOCK_PRODUCTS)
    ).rejects.toThrow('ANTHROPIC_API_KEY is not configured');
  });

  it('should return a valid FarmerDraftPlan from Claude response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(VALID_DRAFT) }],
    });

    const result = await generateFarmerPlan('corn', ['Waterhemp'], 'moderate', MOCK_PRODUCTS);
    expect(result.passes).toHaveLength(1);
    expect(result.passes[0].category).toBe('Pre-Emergent');
    expect(result.summary).toBe('Waterhemp control program for corn');
    expect(result.weed_management_notes).toBeTruthy();
  });

  it('should strip markdown code fences from response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '```json\n' + JSON.stringify(VALID_DRAFT) + '\n```' }],
    });

    const result = await generateFarmerPlan('corn', ['Waterhemp'], 'heavy', MOCK_PRODUCTS);
    expect(result.passes).toHaveLength(1);
  });

  it('should throw when AI references an unknown product_id', async () => {
    const badDraft = {
      ...VALID_DRAFT,
      passes: [
        {
          ...VALID_DRAFT.passes[0],
          products: [
            { ...VALID_DRAFT.passes[0].products[0], product_id: 'nonexistent-id' },
          ],
        },
      ],
    };

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(badDraft) }],
    });

    await expect(
      generateFarmerPlan('corn', ['Waterhemp'], 'moderate', MOCK_PRODUCTS)
    ).rejects.toThrow('unknown product_id');
  });

  it('should throw when AI returns empty content', async () => {
    mockCreate.mockResolvedValue({ content: [] });

    await expect(
      generateFarmerPlan('corn', ['Waterhemp'], 'light', MOCK_PRODUCTS)
    ).rejects.toThrow('No text response from AI');
  });

  it('should throw when AI returns invalid JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json' }],
    });

    await expect(
      generateFarmerPlan('corn', ['Waterhemp'], 'moderate', MOCK_PRODUCTS)
    ).rejects.toThrow();
  });

  it('should throw when AI response is missing passes array', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ summary: 'test' }) }],
    });

    await expect(
      generateFarmerPlan('corn', ['Waterhemp'], 'moderate', MOCK_PRODUCTS)
    ).rejects.toThrow('AI response missing passes array');
  });
});
