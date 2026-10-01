/**
 * Crop Type Classifier
 *
 * Identifies the crop growing in a field using three complementary approaches:
 *
 *  1. NDVI Time-Series (Sentinel Hub) — phenological signature analysis over 12 months.
 *     Different crops have characteristic NDVI growth curves (timing of green-up, peak,
 *     and senescence) that Claude interprets to classify the crop type.
 *
 *  2. Satellite Vision (Sentinel Hub) — Claude Vision on a false-color Sentinel-2 image.
 *     NIR/Red/Green false-color makes crop types visually distinguishable.
 *
 *  3. Agromonitoring NDVI History — same time-series approach but using the
 *     Agromonitoring API (Landsat-8 / Sentinel-2 composite). Only runs when the
 *     field has a registered Agromonitoring polygon (agro_poly_id).
 *
 * The orchestrator runs all available methods in parallel, then aggregates the results
 * using a confidence-weighted vote.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  getVegetationStats,
  generateFieldImage,
  searchScenes,
  isSentinelHubConfigured,
  type VegetationStats,
} from './sentinel-hub';
import {
  getVegetationHistory,
  isAgromonitoringConfigured,
  type AgroNdviHistory,
} from './agromonitoring';

// ─── Types ────────────────────────────────────────────────────────────────────

export const KNOWN_CROPS = [
  'corn',
  'soybeans',
  'wheat',
  'cotton',
  'rice',
  'sorghum',
  'sunflower',
  'canola',
  'peanuts',
  'sugarcane',
  'alfalfa',
  'barley',
  'oats',
  'rye',
  'tobacco',
  'potatoes',
  'vegetables',
] as const;

export type KnownCrop = (typeof KNOWN_CROPS)[number];

export interface CropClassificationResult {
  cropType: string | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  source: 'ndvi-timeseries' | 'satellite-vision' | 'agromonitoring';
}

export interface CropClassificationReport {
  /** Best crop type suggestion aggregated from all methods */
  suggested: string | null;
  /** Aggregate confidence level */
  confidence: 'high' | 'medium' | 'low';
  /** Individual results per method */
  signals: {
    ndviTimeSeries?: CropClassificationResult;
    satelliteVision?: CropClassificationResult;
    agromonitoring?: CropClassificationResult;
  };
  /** Human-readable summary of all signals */
  summary: string;
  /** Errors from methods that failed (non-fatal) */
  errors: Record<string, string>;
}

// ─── Shared AI helpers ────────────────────────────────────────────────────────

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
  return new Anthropic({ apiKey });
}

/**
 * Parse the AI model's JSON response into a structured classification result.
 * Handles cases where the model wraps JSON in markdown fences or adds extra text.
 */
export function parseAICropResponse(text: string): {
  cropType: string | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
} {
  try {
    let cleaned = text.trim();
    // Strip markdown code fences if present
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    // Find JSON object within the text
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1)) as {
        cropType?: string | null;
        confidence?: string;
        reasoning?: string;
      };
      const confidence = ['high', 'medium', 'low'].includes(parsed.confidence ?? '')
        ? (parsed.confidence as 'high' | 'medium' | 'low')
        : 'low';
      return {
        cropType: typeof parsed.cropType === 'string' ? parsed.cropType.toLowerCase() : null,
        confidence,
        reasoning: parsed.reasoning ?? 'No reasoning provided',
      };
    }
  } catch {
    // Fall through to fallback
  }

  return {
    cropType: null,
    confidence: 'low',
    reasoning: text.slice(0, 400),
  };
}

const CROP_PHENOLOGY_REFERENCE = `Phenological NDVI signatures for reference:
- Corn: Rapid green-up May-June, peak NDVI 0.75–0.85 in July-August, sharp senescence September
- Soybeans: Slower green-up June, peak NDVI 0.65–0.80 in August, gradual decline October
- Winter Wheat: Green through fall/winter, peak NDVI April-May, harvest June-July (may show dual-season pattern)
- Cotton: Slow green-up May-June, long plateau 0.50–0.70 through summer, October decline
- Rice: High NDWI early season (flooded fields), NDVI peak July-August
- Sorghum: Similar to corn but 2–3 weeks later, slightly lower peak NDVI (~0.65–0.75)
- Alfalfa/Hay: Multiple cuts per season producing oscillating NDVI pattern
- Sugarcane: Very long growing cycle (10–18 months), high NDVI plateau`;

const CROP_LIST_STR = KNOWN_CROPS.join(', ');

// ─── Approach 1: NDVI Time-Series (Sentinel Hub) ──────────────────────────────

function formatSentinelStats(stats: VegetationStats[]): string {
  const rows = stats
    .filter((s) => s.ndvi !== null)
    .map((s) => {
      const date = new Date(s.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: '2-digit',
      });
      const ndvi = s.ndvi!.mean.toFixed(3);
      const ndwi = s.ndwi ? s.ndwi.mean.toFixed(3) : 'N/A';
      return `${date}: NDVI=${ndvi}, NDWI=${ndwi}`;
    });
  return rows.length > 0 ? rows.join('\n') : 'No valid observations found.';
}

/**
 * Classify crop type using NDVI/NDWI time-series from Sentinel Hub.
 * Requests 12 months of 10-day aggregated statistics and asks Claude
 * to interpret the phenological growth curve.
 */
export async function classifyFromNdviTimeSeries(
  geometry: { type: string; coordinates: unknown }
): Promise<CropClassificationResult> {
  if (!isSentinelHubConfigured()) {
    throw new Error('Sentinel Hub is not configured (missing COPERNICUS_* env vars)');
  }

  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  const stats = await getVegetationStats(geometry, oneYearAgo, now);
  if (stats.length < 3) {
    throw new Error(
      `Insufficient NDVI data for crop classification (${stats.length} observations, need ≥ 3)`
    );
  }

  const timeSeries = formatSentinelStats(stats);
  const client = getAnthropicClient();

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `You are an expert agronomist specializing in crop identification from satellite vegetation indices.

Analyze the NDVI (Normalized Difference Vegetation Index) and NDWI (Normalized Difference Water Index) time series below from a farm field. Use the phenological patterns — timing of green-up, peak NDVI value, senescence timing, seasonal double-peaks, or oscillation patterns — to identify the most likely crop type.

NDVI/NDWI Time Series (10-day intervals, Sentinel-2 satellite):
${timeSeries}

${CROP_PHENOLOGY_REFERENCE}

Respond ONLY with a JSON object matching this exact schema (no markdown, no extra text):
{
  "cropType": "corn",
  "confidence": "high",
  "reasoning": "Brief agronomic explanation of the phenological pattern that led to this identification"
}

cropType must be one of: ${CROP_LIST_STR}, or null if the pattern is unclear.
confidence must be "high", "medium", or "low".`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from AI model');
  }

  return { ...parseAICropResponse(textBlock.text), source: 'ndvi-timeseries' };
}

// ─── Approach 2: Satellite Vision (Sentinel Hub) ──────────────────────────────

/**
 * Classify crop type using Claude Vision on a Sentinel-2 false-color image.
 * False-color (NIR/Red/Green) makes crop types significantly more distinguishable
 * than true-color imagery — healthy dense vegetation appears bright red/pink.
 */
export async function classifyFromSatelliteImage(
  geometry: { type: string; coordinates: unknown }
): Promise<CropClassificationResult> {
  if (!isSentinelHubConfigured()) {
    throw new Error('Sentinel Hub is not configured (missing COPERNICUS_* env vars)');
  }

  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Find scenes with low cloud cover — prefer clearest image for best visual classification
  const scenes = await searchScenes(geometry, ninetyDaysAgo, now, 30);
  if (scenes.length === 0) {
    throw new Error(
      'No clear satellite scenes found (cloud cover > 30%) in the last 90 days'
    );
  }

  // Sort by cloud cover ascending to get the clearest scene
  const bestScene = [...scenes].sort((a, b) => a.cloudCover - b.cloudCover)[0];
  const sceneDate = new Date(bestScene.date);

  // Generate false-color image (NIR=red, Red=green, Green=blue)
  // This band combination maximizes contrast between different crop types
  const imageBuffer = await generateFieldImage(geometry, sceneDate, 'false-color', 512);
  const base64 = imageBuffer.toString('base64');

  const client = getAnthropicClient();

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64,
            },
          },
          {
            type: 'text',
            text: `This is a Sentinel-2 false-color satellite image of an agricultural field.
Band combination: NIR (Near-Infrared) → red channel, Red → green channel, Green → blue channel.

Visual interpretation guide for false-color imagery:
- Bright red/pink = dense healthy vegetation (corn, soybeans, wheat at peak growth)
- Dark red/maroon = moderate vegetation density or slightly stressed crop
- Light pink/orange = sparse or early-stage crop
- Green/yellow-green = bare soil or crop residue
- Blue/cyan = water, flooded areas, or rice paddies
- Uniform texture = row crop in active growth
- Irregular patches = mixed cover or field edges

Image date: ${sceneDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
Cloud cover on this scene: ${bestScene.cloudCover}%

Based on the field's color, texture, uniformity, row structure, and visible crop stage, identify the most likely crop type.
Possible crops: ${CROP_LIST_STR}

Respond ONLY with a JSON object (no markdown, no extra text):
{
  "cropType": "corn",
  "confidence": "high",
  "reasoning": "Brief description of the visual features that support this identification"
}

cropType must be one of the listed crops, or null if the image is too ambiguous.
confidence must be "high", "medium", or "low".`,
          },
        ],
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from AI model');
  }

  return { ...parseAICropResponse(textBlock.text), source: 'satellite-vision' };
}

// ─── Approach 3: Agromonitoring NDVI History ──────────────────────────────────

function formatAgroHistory(history: AgroNdviHistory[]): string {
  return history
    .filter((h) => h.data?.ndvi?.mean !== undefined)
    .map((h) => {
      const date = new Date(h.dt * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: '2-digit',
      });
      const ndvi = h.data.ndvi.mean.toFixed(3);
      const cloud = h.dc.toFixed(0);
      return `${date}: NDVI=${ndvi} (cloud ${cloud}%)`;
    })
    .join('\n');
}

/**
 * Classify crop type using the Agromonitoring NDVI history API.
 * Agromonitoring composites Landsat-8 and Sentinel-2 imagery, providing
 * an independent NDVI time series that corroborates the Sentinel Hub analysis.
 *
 * Requires the field to have a registered Agromonitoring polygon (agro_poly_id).
 */
export async function classifyFromAgromonitoring(
  agroPolyId: string
): Promise<CropClassificationResult> {
  if (!isAgromonitoringConfigured()) {
    throw new Error('Agromonitoring is not configured (missing AGROMONITORING_API_KEY env var)');
  }

  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  const history = await getVegetationHistory(agroPolyId, oneYearAgo, now);
  if (history.length < 3) {
    throw new Error(
      `Insufficient Agromonitoring NDVI history (${history.length} observations, need ≥ 3)`
    );
  }

  const timeSeries = formatAgroHistory(history);
  const client = getAnthropicClient();

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `You are an expert agronomist specializing in crop identification from satellite vegetation indices.

Analyze this NDVI time series from the Agromonitoring API (Landsat-8 / Sentinel-2 composite) and identify the most likely crop type based on the phenological growth pattern.

NDVI Time Series:
${timeSeries}

${CROP_PHENOLOGY_REFERENCE}

Respond ONLY with a JSON object matching this exact schema (no markdown, no extra text):
{
  "cropType": "corn",
  "confidence": "high",
  "reasoning": "Brief agronomic explanation of the phenological pattern that led to this identification"
}

cropType must be one of: ${CROP_LIST_STR}, or null if the pattern is unclear.
confidence must be "high", "medium", or "low".`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from AI model');
  }

  return { ...parseAICropResponse(textBlock.text), source: 'agromonitoring' };
}

// ─── Aggregator ───────────────────────────────────────────────────────────────

/**
 * Aggregate results from multiple classification methods using a confidence-
 * weighted vote. High-confidence votes count more than low-confidence ones.
 */
export function aggregateClassificationResults(results: CropClassificationResult[]): {
  suggested: string | null;
  confidence: 'high' | 'medium' | 'low';
} {
  if (results.length === 0) return { suggested: null, confidence: 'low' };

  const confWeight = { high: 3, medium: 2, low: 1 };

  // Tally weighted votes per crop type
  const votes = new Map<string, { weightedScore: number; highCount: number; totalCount: number }>();
  for (const r of results) {
    if (!r.cropType) continue;
    const existing = votes.get(r.cropType) ?? { weightedScore: 0, highCount: 0, totalCount: 0 };
    votes.set(r.cropType, {
      weightedScore: existing.weightedScore + confWeight[r.confidence],
      highCount: existing.highCount + (r.confidence === 'high' ? 1 : 0),
      totalCount: existing.totalCount + 1,
    });
  }

  if (votes.size === 0) return { suggested: null, confidence: 'low' };

  // Pick the winner by highest weighted score
  let winner = '';
  let highestScore = 0;
  for (const [crop, { weightedScore }] of votes) {
    if (weightedScore > highestScore) {
      highestScore = weightedScore;
      winner = crop;
    }
  }

  const winnerStats = votes.get(winner)!;

  // Determine aggregate confidence:
  // High  → 2+ methods agree AND at least one is high-confidence
  // Medium → 2+ methods agree OR 1 method is high-confidence
  // Low   → only 1 method, low-confidence
  let confidence: 'high' | 'medium' | 'low';
  if (winnerStats.totalCount >= 2 && winnerStats.highCount >= 1) {
    confidence = 'high';
  } else if (winnerStats.totalCount >= 2 || winnerStats.highCount >= 1) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return { suggested: winner || null, confidence };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Run all available crop classification methods in parallel and return
 * an aggregated report. Each method fails gracefully — the report always
 * returns, even if individual methods error out.
 *
 * @param geometry    GeoJSON geometry of the field (Polygon or MultiPolygon)
 * @param agroPolyId  Agromonitoring polygon ID (optional — enables Approach 3)
 */
export async function classifyCropType(
  geometry: { type: string; coordinates: unknown },
  agroPolyId?: string | null
): Promise<CropClassificationReport> {
  const errors: Record<string, string> = {};
  const signals: CropClassificationReport['signals'] = {};

  // Run all methods in parallel; failures are non-fatal
  const [ndviResult, visionResult, agroResult] = await Promise.allSettled([
    classifyFromNdviTimeSeries(geometry),
    classifyFromSatelliteImage(geometry),
    agroPolyId
      ? classifyFromAgromonitoring(agroPolyId)
      : Promise.reject(new Error('No Agromonitoring polygon ID for this field')),
  ]);

  if (ndviResult.status === 'fulfilled') {
    signals.ndviTimeSeries = ndviResult.value;
  } else {
    errors.ndviTimeSeries =
      ndviResult.reason instanceof Error ? ndviResult.reason.message : 'Unknown error';
  }

  if (visionResult.status === 'fulfilled') {
    signals.satelliteVision = visionResult.value;
  } else {
    errors.satelliteVision =
      visionResult.reason instanceof Error ? visionResult.reason.message : 'Unknown error';
  }

  if (agroResult.status === 'fulfilled') {
    signals.agromonitoring = agroResult.value;
  } else {
    errors.agromonitoring =
      agroResult.reason instanceof Error ? agroResult.reason.message : 'Unknown error';
  }

  const successfulResults = Object.values(signals).filter(Boolean) as CropClassificationResult[];
  const { suggested, confidence } = aggregateClassificationResults(successfulResults);

  // Build human-readable summary
  const methodLabels: Record<string, string> = {
    ndviTimeSeries: 'NDVI time-series',
    satelliteVision: 'satellite vision',
    agromonitoring: 'Agromonitoring history',
  };

  let summary: string;
  if (successfulResults.length === 0) {
    summary =
      'No classification methods produced a result. Verify Sentinel Hub and Agromonitoring API configuration.';
  } else if (!suggested) {
    const usedMethods = Object.keys(signals)
      .map((k) => methodLabels[k])
      .join(', ');
    summary = `${successfulResults.length} method(s) ran (${usedMethods}) but could not agree on a crop type. The field may be fallow, recently planted, or covered by clouds.`;
  } else {
    const agreements = successfulResults.filter((r) => r.cropType === suggested).length;
    const usedMethods = Object.keys(signals)
      .map((k) => methodLabels[k])
      .join(', ');
    summary =
      `${agreements} of ${successfulResults.length} method(s) identified this field as **${suggested}** ` +
      `(${confidence} confidence). Methods used: ${usedMethods}.`;
  }

  return { suggested, confidence, signals, summary, errors };
}
