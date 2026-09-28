import type { Metadata } from 'next';
import { SoilIntelligenceClient } from './soil-intelligence-client';

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

export default function SoilIntelligencePage() {
  // The SMAP national moisture map is fetched entirely client-side via
  // /api/crop/soil-moisture-map (4-hour server cache). Blocking the page
  // render on 48 parallel SMAP requests caused a 10+ second navigation
  // delay — the client-side fetch is fast because it hits the cache.
  return (
    <SoilIntelligenceClient
      initialMoistureMap={{}}
      droughtAlerts={[]}
    />
  );
}
