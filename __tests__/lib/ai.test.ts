import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

import { generateAcrePackProgram } from '@/lib/ai';
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
    name: 'Fungicide X',
    category: 'Fungicides',
    price: '120.00',
    unit_of_measure: 'gallon',
    active_ingredients: 'Azoxystrobin 22.9%',
    application_rate_range: '6-9 fl oz per acre',
    container_sizes: '2.5 gallon jug',
    package_type: 'Jug',
    lbs_per_gallon: null,
    epa_registration_number: '100-1234',
    epa_signal_word: 'CAUTION',
    features: null,
    specifications: null,
  },
];

describe('generateAcrePackProgram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key-123';
  });

  it('should throw when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(generateAcrePackProgram('corn', MOCK_PRODUCTS)).rejects.toThrow(
      'ANTHROPIC_API_KEY is not configured'
    );
  });

  it('should return a valid draft program from Claude response', async () => {
    const mockResponse = {
      passes: [
        {
          name: 'Pre-Emerge Herbicide',
          timing_label: 'Spring, before planting',
          category: 'Herbicides',
          description: 'Weed control before planting',
          is_required: true,
          sort_order: 1,
          products: [
            {
              product_id: 'prod-1',
              product_name: 'Glyphosate 41%',
              is_recommended: true,
              default_rate_per_acre: 32,
              min_rate: 22,
              max_rate: 44,
              rate_unit: 'fl oz',
              unit_size: 265,
              unit_size_unit: 'gal',
              lbs_per_gallon: 10,
              reasoning: 'Standard burndown rate',
            },
          ],
        },
        {
          name: 'Foliar Fungicide',
          timing_label: 'VT/R1 stage',
          category: 'Fungicides',
          description: 'Disease protection',
          is_required: false,
          sort_order: 2,
          products: [
            {
              product_id: 'prod-2',
              product_name: 'Fungicide X',
              is_recommended: true,
              default_rate_per_acre: 6,
              min_rate: 6,
              max_rate: 9,
              rate_unit: 'fl oz',
              unit_size: 2.5,
              unit_size_unit: 'gal',
              lbs_per_gallon: null,
              reasoning: 'Standard fungicide rate',
            },
          ],
        },
      ],
      summary: 'Two-pass corn program with burndown and fungicide.',
    };

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(mockResponse) }],
    });

    const result = await generateAcrePackProgram('corn', MOCK_PRODUCTS);

    expect(result.passes).toHaveLength(2);
    expect(result.passes[0].name).toBe('Pre-Emerge Herbicide');
    expect(result.passes[0].products[0].product_id).toBe('prod-1');
    expect(result.passes[1].products[0].product_id).toBe('prod-2');
    expect(result.summary).toContain('corn program');
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it('should handle markdown code fences in Claude response', async () => {
    const responseObj = {
      passes: [
        {
          name: 'Herbicide Pass',
          timing_label: 'Pre-plant',
          category: 'Herbicides',
          description: 'Test',
          is_required: true,
          sort_order: 1,
          products: [
            {
              product_id: 'prod-1',
              product_name: 'Glyphosate 41%',
              is_recommended: true,
              default_rate_per_acre: 32,
              min_rate: 22,
              max_rate: 44,
              rate_unit: 'fl oz',
              unit_size: 265,
              unit_size_unit: 'gal',
              lbs_per_gallon: 10,
              reasoning: 'Test',
            },
          ],
        },
      ],
      summary: 'Test program',
    };

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '```json\n' + JSON.stringify(responseObj) + '\n```' }],
    });

    const result = await generateAcrePackProgram('soybeans', MOCK_PRODUCTS);
    expect(result.passes).toHaveLength(1);
    expect(result.summary).toBe('Test program');
  });

  it('should throw when Claude references an unknown product_id', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            passes: [
              {
                name: 'Test',
                timing_label: 'Test',
                category: 'Herbicides',
                description: 'Test',
                is_required: true,
                sort_order: 1,
                products: [
                  {
                    product_id: 'DOES-NOT-EXIST',
                    product_name: 'Fake',
                    is_recommended: true,
                    default_rate_per_acre: 1,
                    min_rate: 1,
                    max_rate: 1,
                    rate_unit: 'fl oz',
                    unit_size: 1,
                    unit_size_unit: 'gal',
                    lbs_per_gallon: null,
                    reasoning: 'Test',
                  },
                ],
              },
            ],
            summary: 'Test',
          }),
        },
      ],
    });

    await expect(generateAcrePackProgram('corn', MOCK_PRODUCTS)).rejects.toThrow(
      'AI referenced unknown product_id: DOES-NOT-EXIST'
    );
  });

  it('should throw when Claude returns no text blocks', async () => {
    mockCreate.mockResolvedValue({
      content: [],
    });

    await expect(generateAcrePackProgram('wheat', MOCK_PRODUCTS)).rejects.toThrow(
      'No text response from AI'
    );
  });

  it('should throw when Claude returns invalid JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json at all' }],
    });

    await expect(generateAcrePackProgram('cotton', MOCK_PRODUCTS)).rejects.toThrow();
  });
});
