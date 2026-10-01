import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoist mock functions so they're available inside vi.mock factories ─────────
const {
  mockMessagesCreate,
  mockGetVegetationStats,
  mockGenerateFieldImage,
  mockSearchScenes,
  mockIsSentinelHubConfigured,
  mockGetVegetationHistory,
  mockIsAgromonitoringConfigured,
} = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
  mockGetVegetationStats: vi.fn(),
  mockGenerateFieldImage: vi.fn(),
  mockSearchScenes: vi.fn(),
  mockIsSentinelHubConfigured: vi.fn(),
  mockGetVegetationHistory: vi.fn(),
  mockIsAgromonitoringConfigured: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockMessagesCreate };
  },
}));

vi.mock('@/lib/sentinel-hub', () => ({
  isSentinelHubConfigured: mockIsSentinelHubConfigured,
  getVegetationStats: mockGetVegetationStats,
  generateFieldImage: mockGenerateFieldImage,
  searchScenes: mockSearchScenes,
}));

vi.mock('@/lib/agromonitoring', () => ({
  isAgromonitoringConfigured: mockIsAgromonitoringConfigured,
  getVegetationHistory: mockGetVegetationHistory,
}));

// ── Import after mocks ────────────────────────────────────────────────────────
import {
  parseAICropResponse,
  aggregateClassificationResults,
  classifyFromNdviTimeSeries,
  classifyFromSatelliteImage,
  classifyFromAgromonitoring,
  classifyCropType,
  type CropClassificationResult,
} from '@/lib/crop-classifier';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_GEOMETRY = { type: 'Polygon', coordinates: [[[-83.5, 31.4], [-83.4, 31.4], [-83.4, 31.5], [-83.5, 31.5], [-83.5, 31.4]]] };

const MOCK_STATS = [
  { date: '2026-04-01', ndvi: { mean: 0.15, min: 0.05, max: 0.25 }, ndwi: { mean: -0.2, min: -0.4, max: 0.0 } },
  { date: '2026-05-01', ndvi: { mean: 0.35, min: 0.2, max: 0.5 }, ndwi: { mean: -0.15, min: -0.3, max: 0.0 } },
  { date: '2026-06-01', ndvi: { mean: 0.65, min: 0.5, max: 0.8 }, ndwi: { mean: -0.1, min: -0.2, max: 0.05 } },
  { date: '2026-07-01', ndvi: { mean: 0.82, min: 0.7, max: 0.92 }, ndwi: { mean: 0.05, min: -0.1, max: 0.2 } },
  { date: '2026-08-01', ndvi: { mean: 0.78, min: 0.6, max: 0.88 }, ndwi: { mean: 0.02, min: -0.1, max: 0.15 } },
  { date: '2026-09-01', ndvi: { mean: 0.45, min: 0.3, max: 0.6 }, ndwi: null },
];

const MOCK_SCENES = [
  { id: 'scene-1', date: '2026-09-10T10:00:00Z', cloudCover: 5 },
  { id: 'scene-2', date: '2026-09-20T10:00:00Z', cloudCover: 15 },
];

const MOCK_AGRO_HISTORY = [
  { dt: 1746057600, source: 1, dc: 10, zoom: 13, data: { ndvi: { mean: 0.18, min: 0.05, max: 0.3, median: 0.18, std: 0.05 } } },
  { dt: 1748736000, source: 1, dc: 5, zoom: 13, data: { ndvi: { mean: 0.60, min: 0.45, max: 0.75, median: 0.60, std: 0.08 } } },
  { dt: 1751414400, source: 1, dc: 0, zoom: 13, data: { ndvi: { mean: 0.83, min: 0.70, max: 0.92, median: 0.83, std: 0.06 } } },
  { dt: 1754092800, source: 1, dc: 8, zoom: 13, data: { ndvi: { mean: 0.50, min: 0.35, max: 0.65, median: 0.50, std: 0.09 } } },
];

const MOCK_CORN_AI_RESPONSE = {
  content: [
    {
      type: 'text',
      text: '{"cropType":"corn","confidence":"high","reasoning":"Rapid NDVI rise in June and July with peak of 0.82 matches corn phenology perfectly."}',
    },
  ],
};

// ─── parseAICropResponse ──────────────────────────────────────────────────────

describe('parseAICropResponse', () => {
  it('parses clean JSON response', () => {
    const result = parseAICropResponse('{"cropType":"corn","confidence":"high","reasoning":"Classic corn phenology"}');
    expect(result.cropType).toBe('corn');
    expect(result.confidence).toBe('high');
    expect(result.reasoning).toBe('Classic corn phenology');
  });

  it('parses JSON wrapped in markdown fences', () => {
    const result = parseAICropResponse('```json\n{"cropType":"soybeans","confidence":"medium","reasoning":"Late-season peak"}\n```');
    expect(result.cropType).toBe('soybeans');
    expect(result.confidence).toBe('medium');
  });

  it('parses JSON with surrounding text', () => {
    const result = parseAICropResponse('Based on the analysis: {"cropType":"wheat","confidence":"low","reasoning":"Winter pattern"} — that\'s my assessment.');
    expect(result.cropType).toBe('wheat');
    expect(result.confidence).toBe('low');
  });

  it('lowercases cropType', () => {
    const result = parseAICropResponse('{"cropType":"CORN","confidence":"high","reasoning":"test"}');
    expect(result.cropType).toBe('corn');
  });

  it('returns null cropType for invalid JSON', () => {
    const result = parseAICropResponse('This is not JSON at all');
    expect(result.cropType).toBeNull();
    expect(result.confidence).toBe('low');
  });

  it('handles null cropType in response', () => {
    const result = parseAICropResponse('{"cropType":null,"confidence":"low","reasoning":"unclear"}');
    expect(result.cropType).toBeNull();
  });

  it('defaults to low confidence for unrecognized confidence value', () => {
    const result = parseAICropResponse('{"cropType":"corn","confidence":"very-high","reasoning":"test"}');
    expect(result.confidence).toBe('low');
  });
});

// ─── aggregateClassificationResults ──────────────────────────────────────────

describe('aggregateClassificationResults', () => {
  it('returns null/low when given empty array', () => {
    const result = aggregateClassificationResults([]);
    expect(result.suggested).toBeNull();
    expect(result.confidence).toBe('low');
  });

  it('returns null/low when all results have null cropType', () => {
    const results: CropClassificationResult[] = [
      { cropType: null, confidence: 'low', reasoning: 'unclear', source: 'ndvi-timeseries' },
    ];
    const result = aggregateClassificationResults(results);
    expect(result.suggested).toBeNull();
    expect(result.confidence).toBe('low');
  });

  it('returns single result as low confidence when only one method succeeds', () => {
    const results: CropClassificationResult[] = [
      { cropType: 'corn', confidence: 'low', reasoning: 'maybe corn', source: 'ndvi-timeseries' },
    ];
    const result = aggregateClassificationResults(results);
    expect(result.suggested).toBe('corn');
    expect(result.confidence).toBe('low');
  });

  it('upgrades to medium when single high-confidence result', () => {
    const results: CropClassificationResult[] = [
      { cropType: 'corn', confidence: 'high', reasoning: 'classic corn', source: 'satellite-vision' },
    ];
    const result = aggregateClassificationResults(results);
    expect(result.suggested).toBe('corn');
    expect(result.confidence).toBe('medium');
  });

  it('returns high confidence when 2+ methods agree with one high', () => {
    const results: CropClassificationResult[] = [
      { cropType: 'corn', confidence: 'high', reasoning: 'ndvi pattern', source: 'ndvi-timeseries' },
      { cropType: 'corn', confidence: 'medium', reasoning: 'visual', source: 'satellite-vision' },
    ];
    const result = aggregateClassificationResults(results);
    expect(result.suggested).toBe('corn');
    expect(result.confidence).toBe('high');
  });

  it('picks the winner with most votes when methods disagree', () => {
    const results: CropClassificationResult[] = [
      { cropType: 'corn', confidence: 'high', reasoning: 'r1', source: 'ndvi-timeseries' },
      { cropType: 'corn', confidence: 'medium', reasoning: 'r2', source: 'agromonitoring' },
      { cropType: 'soybeans', confidence: 'low', reasoning: 'r3', source: 'satellite-vision' },
    ];
    const result = aggregateClassificationResults(results);
    expect(result.suggested).toBe('corn');
    expect(result.confidence).toBe('high');
  });

  it('uses weighted scoring to break ties (high-conf beats more low-conf votes)', () => {
    const results: CropClassificationResult[] = [
      { cropType: 'corn', confidence: 'high', reasoning: 'r1', source: 'ndvi-timeseries' },
      { cropType: 'soybeans', confidence: 'low', reasoning: 'r2', source: 'satellite-vision' },
      { cropType: 'soybeans', confidence: 'low', reasoning: 'r3', source: 'agromonitoring' },
    ];
    // corn: weight 3, soybeans: weight 1+1=2 → corn wins
    const result = aggregateClassificationResults(results);
    expect(result.suggested).toBe('corn');
  });
});

// ─── classifyFromNdviTimeSeries ───────────────────────────────────────────────

describe('classifyFromNdviTimeSeries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockIsSentinelHubConfigured.mockReturnValue(true);
  });

  it('returns classified crop type from AI response', async () => {
    mockGetVegetationStats.mockResolvedValue(MOCK_STATS);
    mockMessagesCreate.mockResolvedValue(MOCK_CORN_AI_RESPONSE);

    const result = await classifyFromNdviTimeSeries(MOCK_GEOMETRY);

    expect(result.cropType).toBe('corn');
    expect(result.confidence).toBe('high');
    expect(result.source).toBe('ndvi-timeseries');
    expect(mockGetVegetationStats).toHaveBeenCalledWith(
      MOCK_GEOMETRY,
      expect.any(Date),
      expect.any(Date)
    );
  });

  it('throws when Sentinel Hub is not configured', async () => {
    mockIsSentinelHubConfigured.mockReturnValue(false);
    await expect(classifyFromNdviTimeSeries(MOCK_GEOMETRY)).rejects.toThrow(
      'Sentinel Hub is not configured'
    );
  });

  it('throws when fewer than 3 observations are available', async () => {
    mockGetVegetationStats.mockResolvedValue(MOCK_STATS.slice(0, 2));
    await expect(classifyFromNdviTimeSeries(MOCK_GEOMETRY)).rejects.toThrow(
      'Insufficient NDVI data'
    );
  });

  it('throws when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockGetVegetationStats.mockResolvedValue(MOCK_STATS);
    await expect(classifyFromNdviTimeSeries(MOCK_GEOMETRY)).rejects.toThrow(
      'ANTHROPIC_API_KEY is not configured'
    );
  });

  it('requests 12 months of data (start ≈ 365 days ago)', async () => {
    mockGetVegetationStats.mockResolvedValue(MOCK_STATS);
    mockMessagesCreate.mockResolvedValue(MOCK_CORN_AI_RESPONSE);

    const before = Date.now();
    await classifyFromNdviTimeSeries(MOCK_GEOMETRY);
    const after = Date.now();

    const callArgs = mockGetVegetationStats.mock.calls[0];
    const fromDate: Date = callArgs[1];
    const toDate: Date = callArgs[2];

    const expectedFrom = before - 365 * 24 * 60 * 60 * 1000;
    expect(fromDate.getTime()).toBeGreaterThanOrEqual(expectedFrom - 1000);
    expect(fromDate.getTime()).toBeLessThanOrEqual(after - 364 * 24 * 60 * 60 * 1000);
    expect(toDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(toDate.getTime()).toBeLessThanOrEqual(after + 1000);
  });
});

// ─── classifyFromSatelliteImage ───────────────────────────────────────────────

describe('classifyFromSatelliteImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockIsSentinelHubConfigured.mockReturnValue(true);
  });

  it('classifies crop from false-color image', async () => {
    mockSearchScenes.mockResolvedValue(MOCK_SCENES);
    mockGenerateFieldImage.mockResolvedValue(Buffer.from('fake-png-data'));
    mockMessagesCreate.mockResolvedValue(MOCK_CORN_AI_RESPONSE);

    const result = await classifyFromSatelliteImage(MOCK_GEOMETRY);

    expect(result.cropType).toBe('corn');
    expect(result.source).toBe('satellite-vision');
    // Should pick the clearest scene (lowest cloud cover = scene-1 at 5%)
    const imageCallArgs = mockGenerateFieldImage.mock.calls[0];
    expect(imageCallArgs[2]).toBe('false-color');
    expect(imageCallArgs[3]).toBe(512);
  });

  it('selects scene with lowest cloud cover', async () => {
    const scenes = [
      { id: 'cloudy', date: '2026-09-15T10:00:00Z', cloudCover: 25 },
      { id: 'clear', date: '2026-09-10T10:00:00Z', cloudCover: 3 },
    ];
    mockSearchScenes.mockResolvedValue(scenes);
    mockGenerateFieldImage.mockResolvedValue(Buffer.from('png'));
    mockMessagesCreate.mockResolvedValue(MOCK_CORN_AI_RESPONSE);

    await classifyFromSatelliteImage(MOCK_GEOMETRY);

    // The date passed to generateFieldImage should match the clear (3% cloud) scene
    const date: Date = mockGenerateFieldImage.mock.calls[0][1];
    expect(date.toISOString()).toContain('2026-09-10');
  });

  it('throws when Sentinel Hub is not configured', async () => {
    mockIsSentinelHubConfigured.mockReturnValue(false);
    await expect(classifyFromSatelliteImage(MOCK_GEOMETRY)).rejects.toThrow(
      'Sentinel Hub is not configured'
    );
  });

  it('throws when no clear scenes are available', async () => {
    mockSearchScenes.mockResolvedValue([]);
    await expect(classifyFromSatelliteImage(MOCK_GEOMETRY)).rejects.toThrow(
      'No clear satellite scenes found'
    );
  });

  it('passes image as base64 to Anthropic', async () => {
    const fakeImageData = Buffer.from('fake-image-bytes');
    mockSearchScenes.mockResolvedValue(MOCK_SCENES);
    mockGenerateFieldImage.mockResolvedValue(fakeImageData);
    mockMessagesCreate.mockResolvedValue(MOCK_CORN_AI_RESPONSE);

    await classifyFromSatelliteImage(MOCK_GEOMETRY);

    const messages = mockMessagesCreate.mock.calls[0][0].messages;
    const imageBlock = messages[0].content[0];
    expect(imageBlock.type).toBe('image');
    expect(imageBlock.source.type).toBe('base64');
    expect(imageBlock.source.data).toBe(fakeImageData.toString('base64'));
    expect(imageBlock.source.media_type).toBe('image/png');
  });
});

// ─── classifyFromAgromonitoring ───────────────────────────────────────────────

describe('classifyFromAgromonitoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockIsAgromonitoringConfigured.mockReturnValue(true);
  });

  it('classifies crop from Agromonitoring NDVI history', async () => {
    mockGetVegetationHistory.mockResolvedValue(MOCK_AGRO_HISTORY);
    mockMessagesCreate.mockResolvedValue(MOCK_CORN_AI_RESPONSE);

    const result = await classifyFromAgromonitoring('agro-poly-123');

    expect(result.cropType).toBe('corn');
    expect(result.source).toBe('agromonitoring');
    expect(mockGetVegetationHistory).toHaveBeenCalledWith(
      'agro-poly-123',
      expect.any(Date),
      expect.any(Date)
    );
  });

  it('throws when Agromonitoring is not configured', async () => {
    mockIsAgromonitoringConfigured.mockReturnValue(false);
    await expect(classifyFromAgromonitoring('poly-id')).rejects.toThrow(
      'Agromonitoring is not configured'
    );
  });

  it('throws when fewer than 3 observations are available', async () => {
    mockGetVegetationHistory.mockResolvedValue(MOCK_AGRO_HISTORY.slice(0, 2));
    await expect(classifyFromAgromonitoring('poly-id')).rejects.toThrow(
      'Insufficient Agromonitoring NDVI history'
    );
  });
});

// ─── classifyCropType (orchestrator) ─────────────────────────────────────────

describe('classifyCropType', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockIsSentinelHubConfigured.mockReturnValue(true);
    mockIsAgromonitoringConfigured.mockReturnValue(true);
  });

  it('returns aggregated report when all methods succeed', async () => {
    mockGetVegetationStats.mockResolvedValue(MOCK_STATS);
    mockSearchScenes.mockResolvedValue(MOCK_SCENES);
    mockGenerateFieldImage.mockResolvedValue(Buffer.from('png'));
    mockGetVegetationHistory.mockResolvedValue(MOCK_AGRO_HISTORY);
    mockMessagesCreate.mockResolvedValue(MOCK_CORN_AI_RESPONSE);

    const report = await classifyCropType(MOCK_GEOMETRY, 'agro-poly-123');

    expect(report.suggested).toBe('corn');
    expect(report.confidence).toBe('high');
    expect(report.signals.ndviTimeSeries).toBeDefined();
    expect(report.signals.satelliteVision).toBeDefined();
    expect(report.signals.agromonitoring).toBeDefined();
    expect(Object.keys(report.errors)).toHaveLength(0);
    expect(report.summary).toContain('corn');
  });

  it('skips agromonitoring when no agro_poly_id is provided', async () => {
    mockGetVegetationStats.mockResolvedValue(MOCK_STATS);
    mockSearchScenes.mockResolvedValue(MOCK_SCENES);
    mockGenerateFieldImage.mockResolvedValue(Buffer.from('png'));
    mockMessagesCreate.mockResolvedValue(MOCK_CORN_AI_RESPONSE);

    const report = await classifyCropType(MOCK_GEOMETRY, null);

    expect(report.signals.agromonitoring).toBeUndefined();
    expect(report.errors.agromonitoring).toBeDefined();
    expect(mockGetVegetationHistory).not.toHaveBeenCalled();
  });

  it('captures individual method errors without throwing', async () => {
    // NDVI timeseries fails
    mockGetVegetationStats.mockRejectedValue(new Error('Sentinel Hub timeout'));
    // Vision fails
    mockSearchScenes.mockRejectedValue(new Error('No scenes'));
    // Agromonitoring succeeds
    mockGetVegetationHistory.mockResolvedValue(MOCK_AGRO_HISTORY);
    mockMessagesCreate.mockResolvedValue(MOCK_CORN_AI_RESPONSE);

    const report = await classifyCropType(MOCK_GEOMETRY, 'agro-poly-123');

    expect(report.errors.ndviTimeSeries).toContain('Sentinel Hub timeout');
    expect(report.errors.satelliteVision).toContain('No scenes');
    expect(report.signals.agromonitoring).toBeDefined();
    expect(report.signals.agromonitoring?.cropType).toBe('corn');
    // One method, high confidence → medium aggregate
    expect(report.confidence).toBe('medium');
  });

  it('returns null suggestion when all methods fail', async () => {
    mockGetVegetationStats.mockRejectedValue(new Error('error 1'));
    mockSearchScenes.mockRejectedValue(new Error('error 2'));
    mockGetVegetationHistory.mockRejectedValue(new Error('error 3'));

    const report = await classifyCropType(MOCK_GEOMETRY, 'agro-poly-123');

    expect(report.suggested).toBeNull();
    expect(report.confidence).toBe('low');
    expect(Object.keys(report.errors)).toHaveLength(3);
    expect(report.summary).toContain('No classification methods');
  });

  it('includes summary describing methods used and agreement', async () => {
    mockGetVegetationStats.mockResolvedValue(MOCK_STATS);
    mockSearchScenes.mockResolvedValue(MOCK_SCENES);
    mockGenerateFieldImage.mockResolvedValue(Buffer.from('png'));
    mockGetVegetationHistory.mockResolvedValue(MOCK_AGRO_HISTORY);
    mockMessagesCreate.mockResolvedValue(MOCK_CORN_AI_RESPONSE);

    const report = await classifyCropType(MOCK_GEOMETRY, 'agro-poly-123');

    expect(report.summary).toContain('corn');
    expect(report.summary).toMatch(/\d+ of \d+ method/);
  });
});
