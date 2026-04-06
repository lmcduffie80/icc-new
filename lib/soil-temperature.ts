/**
 * Soil temperature analysis utilities for crop planning.
 * Uses Open-Meteo API (free, no API key required) for soil temperature data.
 */

export interface SoilTemperatureData {
  /** Current soil temperature at 6cm depth (seed zone), in °F */
  current_f: number;
  /** 7-day daily forecast of soil temp at 6cm, in °F */
  forecast_daily_f: number[];
  /** Trend over the next 3 days */
  trend: 'warming' | 'cooling' | 'stable';
  /** Timestamp of the reading */
  timestamp: string;
}

export interface PlantingReadiness {
  status: 'optimal' | 'marginal' | 'too_cold' | 'too_hot';
  message: string;
  /** Minimum soil temp threshold for this crop in °F */
  min_threshold_f: number;
  /** Optimal soil temp range for this crop in °F */
  optimal_range_f: [number, number];
  /** Days until soil is projected to reach minimum threshold (null if already there) */
  days_until_ready: number | null;
}

/** Crop-specific soil temperature thresholds (°F at seed zone depth) */
const CROP_THRESHOLDS: Record<
  string,
  { min: number; optimal: [number, number]; max: number }
> = {
  corn: { min: 50, optimal: [55, 65], max: 95 },
  soybeans: { min: 55, optimal: [60, 70], max: 95 },
  wheat: { min: 34, optimal: [40, 55], max: 85 },
  cotton: { min: 65, optimal: [68, 80], max: 100 },
  peanuts: { min: 65, optimal: [68, 80], max: 100 },
};

/** Convert Celsius to Fahrenheit */
export function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

/**
 * Fetch soil temperature data from Open-Meteo for a given lat/lng.
 * Uses the `soil_temperature_6cm` variable which approximates seed zone depth.
 */
export async function fetchSoilTemperature(
  latitude: number,
  longitude: number
): Promise<SoilTemperatureData> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', latitude.toFixed(4));
  url.searchParams.set('longitude', longitude.toFixed(4));
  url.searchParams.set('hourly', 'soil_temperature_6cm');
  url.searchParams.set('temperature_unit', 'celsius');
  url.searchParams.set('forecast_days', '8');
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url.toString(), {
    next: { revalidate: 3600 }, // cache for 1 hour
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`Open-Meteo API error: ${res.status} ${res.statusText}${errorBody ? ` — ${errorBody}` : ''}`);
  }

  const data = await res.json();

  // Current soil temp: use the most recent hourly reading
  const hourlyTemps: number[] = data.hourly?.soil_temperature_6cm ?? [];
  const currentTempC = hourlyTemps[0] ?? 10;
  const currentTempF = celsiusToFahrenheit(currentTempC);

  // Derive daily max from hourly data: group 24 readings per day, take the max
  const forecastF: number[] = [];
  for (let day = 0; day < 7; day++) {
    const slice = hourlyTemps.slice(day * 24, (day + 1) * 24).filter((t) => t != null);
    if (slice.length > 0) {
      const maxC = Math.max(...slice);
      forecastF.push(celsiusToFahrenheit(maxC));
    }
  }

  // Determine trend from next 3 days vs today
  const trend = determineTrend(currentTempC, hourlyTemps);

  return {
    current_f: currentTempF,
    forecast_daily_f: forecastF,
    trend,
    timestamp: new Date().toISOString(),
  };
}

function determineTrend(
  currentC: number,
  hourlyTemps: number[]
): 'warming' | 'cooling' | 'stable' {
  // Compare average of next 24h vs next 48-72h
  const next24 = hourlyTemps.slice(0, 24);
  const next48to72 = hourlyTemps.slice(48, 72);

  if (next24.length === 0 || next48to72.length === 0) return 'stable';

  const avg24 = next24.reduce((a, b) => a + b, 0) / next24.length;
  const avg72 = next48to72.reduce((a, b) => a + b, 0) / next48to72.length;
  const delta = avg72 - avg24;

  if (delta > 1.5) return 'warming';
  if (delta < -1.5) return 'cooling';
  return 'stable';
}

/**
 * Assess planting readiness for a given crop based on current soil temperature.
 */
export function assessPlantingReadiness(
  soilTempF: number,
  cropType: string,
  forecastF: number[]
): PlantingReadiness {
  const thresholds = CROP_THRESHOLDS[cropType.toLowerCase()] ?? CROP_THRESHOLDS.corn;

  let status: PlantingReadiness['status'];
  let message: string;

  if (soilTempF < thresholds.min) {
    status = 'too_cold';
    message = `Soil temperature (${soilTempF}°F) is below the minimum ${thresholds.min}°F needed for ${cropType}. Risk of poor germination and seedling disease.`;
  } else if (soilTempF > thresholds.max) {
    status = 'too_hot';
    message = `Soil temperature (${soilTempF}°F) exceeds the safe maximum of ${thresholds.max}°F for ${cropType}. Consider delaying planting.`;
  } else if (
    soilTempF >= thresholds.optimal[0] &&
    soilTempF <= thresholds.optimal[1]
  ) {
    status = 'optimal';
    message = `Soil temperature (${soilTempF}°F) is in the optimal range (${thresholds.optimal[0]}–${thresholds.optimal[1]}°F) for ${cropType}. Excellent planting conditions.`;
  } else {
    status = 'marginal';
    const direction =
      soilTempF < thresholds.optimal[0] ? 'below' : 'above';
    message = `Soil temperature (${soilTempF}°F) is ${direction} the optimal range (${thresholds.optimal[0]}–${thresholds.optimal[1]}°F) for ${cropType}. Planting is possible but not ideal.`;
  }

  // Project days until minimum threshold is reached (for too_cold case)
  let days_until_ready: number | null = null;
  if (status === 'too_cold' && forecastF.length > 0) {
    const dayIdx = forecastF.findIndex((t) => t >= thresholds.min);
    days_until_ready = dayIdx >= 0 ? dayIdx + 1 : null;
  }

  return {
    status,
    message,
    min_threshold_f: thresholds.min,
    optimal_range_f: thresholds.optimal,
    days_until_ready,
  };
}

/**
 * Build a concise soil temperature context string for the AI prompt.
 */
export function buildSoilTempContext(
  soilTemp: SoilTemperatureData,
  readiness: PlantingReadiness,
  cropType: string
): string {
  const trendLabel =
    soilTemp.trend === 'warming'
      ? 'warming trend'
      : soilTemp.trend === 'cooling'
      ? 'cooling trend'
      : 'stable temperatures';

  const forecastSummary =
    soilTemp.forecast_daily_f.length > 0
      ? `7-day forecast highs: ${soilTemp.forecast_daily_f.map((t) => `${t}°F`).join(', ')}`
      : '';

  return `## Current Soil Temperature Conditions
Crop: ${cropType}
Current soil temperature (seed zone): ${soilTemp.current_f}°F (${trendLabel})
Planting readiness: ${readiness.status.replace('_', ' ').toUpperCase()}
Assessment: ${readiness.message}
${forecastSummary ? forecastSummary + '\n' : ''}
Optimal planting range for ${cropType}: ${readiness.optimal_range_f[0]}–${readiness.optimal_range_f[1]}°F
${readiness.days_until_ready !== null ? `Projected days until soil reaches minimum threshold: ${readiness.days_until_ready} days` : ''}

Agronomic implications:
${buildAgronomicImplications(soilTemp.current_f, readiness, cropType)}`;
}

function buildAgronomicImplications(
  currentF: number,
  readiness: PlantingReadiness,
  cropType: string
): string {
  const implications: string[] = [];

  if (readiness.status === 'too_cold') {
    implications.push(
      `- Soil fungicide seed treatments are especially important at sub-optimal temperatures`
    );
    implications.push(
      `- Pre-emerge herbicides will have slower activation — ensure adequate soil moisture`
    );
    implications.push(
      `- Consider delaying pre-emerge application until soil warms to improve efficacy`
    );
  } else if (readiness.status === 'optimal') {
    implications.push(
      `- Ideal conditions for pre-emerge herbicide activation and incorporation`
    );
    implications.push(
      `- Rapid germination expected — time post-emerge applications to V2-V4 growth stage`
    );
    if (cropType === 'corn' || cropType === 'soybeans') {
      implications.push(
        `- Excellent conditions for early-season weed control programs`
      );
    }
  } else if (readiness.status === 'marginal') {
    if (currentF < readiness.optimal_range_f[0]) {
      implications.push(
        `- Slower germination may extend pre-emerge herbicide window`
      );
      implications.push(
        `- Monitor for seedling diseases — fungicide seed treatments recommended`
      );
    } else {
      implications.push(
        `- Hot soil may stress seedlings — ensure adequate moisture`
      );
      implications.push(
        `- Post-emerge herbicides: apply in early morning to avoid heat stress`
      );
    }
  }

  return implications.join('\n');
}
