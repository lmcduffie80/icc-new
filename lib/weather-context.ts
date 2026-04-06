/**
 * Weather context utilities for crop planning.
 * Fetches spray window data and growing degree day calculations from Open-Meteo.
 */

export interface SprayWindow {
  /** ISO date string for the start of this window */
  date: string;
  /** Human-readable label e.g. "Mon Apr 7 – Morning" */
  label: string;
  conditions: 'excellent' | 'good' | 'marginal' | 'poor';
  /** Average temperature during the window (°F) */
  avg_temp_f: number;
  /** Average relative humidity (%) */
  avg_humidity: number;
  /** Max wind speed during the window (mph) */
  max_wind_mph: number;
  /** Total precipitation during the window (inches) */
  total_precip_in: number;
}

export interface WeatherContext {
  /** Best spray windows in the next 7 days (conditions !== 'poor') */
  spray_windows: SprayWindow[];
  /** Growing degree days accumulated since Jan 1 of current year (base 50°F for corn) */
  gdd_accumulated: number;
  /** Projected GDD for next 7 days */
  gdd_projected_7d: number;
  /** 7-day precipitation total (inches) */
  precip_7d_in: number;
  /** Summary string for AI context */
  summary: string;
}

/** Convert m/s to mph */
function msToMph(ms: number): number {
  return Math.round(ms * 2.237 * 10) / 10;
}

/** Convert mm to inches */
function mmToInches(mm: number): number {
  return Math.round((mm / 25.4) * 100) / 100;
}

/** Convert Celsius to Fahrenheit */
function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

/**
 * Calculate growing degree days (base 50°F) from daily max/min temps in Celsius.
 */
function calcGDD(maxC: number, minC: number, baseF = 50): number {
  const maxF = cToF(maxC);
  const minF = cToF(minC);
  const avg = (Math.min(maxF, 86) + Math.max(minF, baseF)) / 2;
  return Math.max(0, avg - baseF);
}

/**
 * Fetch weather context from Open-Meteo for spray window and GDD analysis.
 */
export async function fetchWeatherContext(
  latitude: number,
  longitude: number
): Promise<WeatherContext> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', latitude.toFixed(4));
  url.searchParams.set('longitude', longitude.toFixed(4));
  url.searchParams.set(
    'hourly',
    'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation'
  );
  url.searchParams.set(
    'daily',
    'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max'
  );
  url.searchParams.set('temperature_unit', 'celsius');
  url.searchParams.set('wind_speed_unit', 'ms');
  url.searchParams.set('precipitation_unit', 'mm');
  url.searchParams.set('forecast_days', '8');
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url.toString(), {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`Open-Meteo weather API error: ${res.status}`);
  }

  const data = await res.json();

  const hourlyTime: string[] = data.hourly?.time ?? [];
  const hourlyTemp: number[] = data.hourly?.temperature_2m ?? [];
  const hourlyHumidity: number[] = data.hourly?.relative_humidity_2m ?? [];
  const hourlyWind: number[] = data.hourly?.wind_speed_10m ?? [];
  const hourlyPrecip: number[] = data.hourly?.precipitation ?? [];

  const dailyMax: number[] = data.daily?.temperature_2m_max ?? [];
  const dailyMin: number[] = data.daily?.temperature_2m_min ?? [];
  const dailyPrecip: number[] = data.daily?.precipitation_sum ?? [];

  // Identify spray windows (evaluate 6-hour blocks)
  const sprayWindows = identifySprayWindows(
    hourlyTime,
    hourlyTemp,
    hourlyHumidity,
    hourlyWind,
    hourlyPrecip
  );

  // GDD calculations (base 50°F for corn/soybeans)
  const gddProjected = dailyMax
    .slice(0, 7)
    .reduce((sum, max, i) => sum + calcGDD(max, dailyMin[i] ?? max - 10), 0);

  // 7-day precipitation total
  const precip7d = mmToInches(
    dailyPrecip.slice(0, 7).reduce((a, b) => a + (b ?? 0), 0)
  );

  const goodWindows = sprayWindows.filter((w) => w.conditions !== 'poor');

  const summary = buildWeatherSummary(goodWindows, gddProjected, precip7d);

  return {
    spray_windows: goodWindows.slice(0, 6),
    gdd_accumulated: 0, // Would require historical data — set to 0 for now
    gdd_projected_7d: Math.round(gddProjected),
    precip_7d_in: precip7d,
    summary,
  };
}

function identifySprayWindows(
  times: string[],
  temps: number[],
  humidity: number[],
  wind: number[],
  precip: number[]
): SprayWindow[] {
  const windows: SprayWindow[] = [];

  // Evaluate 6-hour blocks (morning: 6-12, afternoon: 12-18, evening: 18-24)
  for (let i = 0; i < Math.min(times.length - 6, 168); i += 6) {
    const windowTemps = temps.slice(i, i + 6).filter((v) => v != null);
    const windowHumidity = humidity.slice(i, i + 6).filter((v) => v != null);
    const windowWind = wind.slice(i, i + 6).filter((v) => v != null);
    const windowPrecip = precip.slice(i, i + 6).filter((v) => v != null);

    if (windowTemps.length === 0) continue;

    const avgTempC = windowTemps.reduce((a, b) => a + b, 0) / windowTemps.length;
    const avgTempF = cToF(avgTempC);
    const avgHumidity =
      windowHumidity.reduce((a, b) => a + b, 0) / windowHumidity.length;
    const maxWindMs = Math.max(...windowWind, 0);
    const maxWindMph = msToMph(maxWindMs);
    const totalPrecipMm = windowPrecip.reduce((a, b) => a + b, 0);
    const totalPrecipIn = mmToInches(totalPrecipMm);

    const conditions = evaluateSprayConditions(
      avgTempF,
      avgHumidity,
      maxWindMph,
      totalPrecipIn
    );

    const timeStr = times[i];
    const date = new Date(timeStr);
    const hour = date.getHours();
    const period =
      hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
    const label = `${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} – ${period}`;

    windows.push({
      date: timeStr,
      label,
      conditions,
      avg_temp_f: avgTempF,
      avg_humidity: Math.round(avgHumidity),
      max_wind_mph: maxWindMph,
      total_precip_in: totalPrecipIn,
    });
  }

  return windows;
}

function evaluateSprayConditions(
  avgTempF: number,
  avgHumidity: number,
  maxWindMph: number,
  totalPrecipIn: number
): SprayWindow['conditions'] {
  // Automatic disqualifiers
  if (totalPrecipIn > 0.1) return 'poor';
  if (maxWindMph > 15) return 'poor';
  if (avgTempF < 45 || avgTempF > 90) return 'poor';
  if (avgHumidity < 20 || avgHumidity > 95) return 'poor';

  // Marginal conditions
  let marginalCount = 0;
  if (maxWindMph > 10) marginalCount++;
  if (avgTempF < 50 || avgTempF > 85) marginalCount++;
  if (avgHumidity < 30 || avgHumidity > 85) marginalCount++;

  if (marginalCount >= 2) return 'marginal';
  if (marginalCount === 1) return 'good';
  return 'excellent';
}

function buildWeatherSummary(
  goodWindows: SprayWindow[],
  gddProjected: number,
  precip7d: number
): string {
  const excellentCount = goodWindows.filter(
    (w) => w.conditions === 'excellent'
  ).length;
  const goodCount = goodWindows.filter((w) => w.conditions === 'good').length;

  const windowSummary =
    excellentCount > 0
      ? `${excellentCount} excellent and ${goodCount} good spray windows identified in the next 7 days`
      : goodCount > 0
      ? `${goodCount} good spray windows identified in the next 7 days`
      : 'Limited spray opportunities in the next 7 days due to weather conditions';

  return `${windowSummary}. Projected GDD accumulation: ${Math.round(gddProjected)} (next 7 days). 7-day precipitation forecast: ${precip7d}" total.`;
}

/**
 * Build a concise weather context string for the AI prompt.
 */
export function buildWeatherContextString(weather: WeatherContext): string {
  if (weather.spray_windows.length === 0) {
    return `## Weather & Spray Window Conditions
Limited spray opportunities in the next 7 days. Recommend monitoring conditions before scheduling applications.
7-day precipitation: ${weather.precip_7d_in}" | Projected GDD: ${weather.gdd_projected_7d}`;
  }

  const windowLines = weather.spray_windows
    .slice(0, 4)
    .map(
      (w) =>
        `  - ${w.label}: ${w.conditions.toUpperCase()} (${w.avg_temp_f}°F, ${w.avg_humidity}% RH, wind ${w.max_wind_mph} mph)`
    )
    .join('\n');

  return `## Weather & Spray Window Conditions
${weather.summary}

Best upcoming spray windows:
${windowLines}

7-day precipitation forecast: ${weather.precip_7d_in}" total
Projected growing degree days (next 7 days): ${weather.gdd_projected_7d} GDD

Spray timing guidance: Schedule pre-emerge applications during excellent/good windows with no rain forecast within 4 hours. Post-emerge herbicides perform best at 65-80°F with 40-70% relative humidity.`;
}
