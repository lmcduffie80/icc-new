import type { Metadata } from 'next';
import { SoilIntelligenceClient } from './soil-intelligence-client';
import {
  fetchSoilMoistureForStates,
  CORN_BELT_FIPS,
  CONTINENTAL_FIPS,
  FIPS_STATE,
  type SoilMoisture,
  type MoistureCondition,
} from '@/lib/smap';

export const metadata: Metadata = {
  title: 'Field Soil Intelligence | Innovative Crop Care',
  description:
    'Free real-time soil moisture and temperature data for every US farmer — powered by NASA SMAP satellite. No login or subscription required.',
  openGraph: {
    title: 'Field Soil Intelligence | Innovative Crop Care',
    description:
      'Real-time NASA SMAP soil moisture + Open-Meteo soil temperature for any US location. 100% free.',
  },
};

// Revalidate every 4 hours — SMAP data is daily, Open-Meteo is near real-time
export const revalidate = 14400;

/** State name lookup (full names for drought alert display) */
const STATE_NAMES: Record<string, string> = {
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', MN: 'Minnesota',
  MO: 'Missouri', NE: 'Nebraska', ND: 'North Dakota', OH: 'Ohio',
  SD: 'South Dakota', WI: 'Wisconsin',
};

export default async function SoilIntelligencePage() {
  // ── 1. Pre-fetch all continental US states for the moisture map ────────────
  //    Results are cached by Next.js ISR (revalidate = 14400s = 4h).
  //    The SMAP lib also has its own in-memory cache so subsequent renders
  //    within the same worker are instant.
  let initialMoistureMap: Record<string, SoilMoisture> = {};

  try {
    const byFips = await fetchSoilMoistureForStates(
      // Fetch all 48 continental states — this runs at build/revalidation time (ISR),
      // so users never wait for it. Results are also cached in-memory for 1 hour
      // within the same serverless worker. SMAP calls run in parallel (~3–5 s total).
      CONTINENTAL_FIPS
    );

    for (const [fips, data] of Object.entries(byFips)) {
      const abbr = FIPS_STATE[fips];
      if (abbr) initialMoistureMap[abbr] = data;
    }
  } catch {
    // If SMAP is down, the page still renders — the map will just show no data
    initialMoistureMap = {};
  }

  // ── 2. Compute drought / dryness alerts for Corn Belt states ───────────────
  const droughtAlerts = Object.entries(initialMoistureMap)
    .filter(([abbr, m]) =>
      CORN_BELT_FIPS.includes(m.fips) &&
      (m.condition === 'drought' || m.condition === 'dry') &&
      abbr in STATE_NAMES
    )
    .map(([abbr, m]) => ({
      state_abbr: abbr,
      state_name: STATE_NAMES[abbr] ?? abbr,
      mean: m.mean,
      condition: m.condition as MoistureCondition,
    }))
    .sort((a, b) => a.mean - b.mean); // Most severe first

  return (
    <SoilIntelligenceClient
      initialMoistureMap={initialMoistureMap}
      droughtAlerts={droughtAlerts}
    />
  );
}
