/**
 * Carbon scoring engine for farmer crop plans.
 * Pure function — no DB calls, no server-only imports.
 * Safe to run on both server and client.
 */

export interface CarbonScore {
  total_score: number;
  soil_health: number;
  chemical_impact: number;
  operational_efficiency: number;
  biodiversity: number;
  estimated_credits: number;
  potential_value: number;
  certification_level: 'none' | 'voluntary' | 'verified' | 'premium';
  sustainable_ag: boolean;
  regen_ag: boolean;
  carbon_neutral: boolean;
  recommendations: string[];
  scored_at: string;
}

export interface ScoringProduct {
  product_name: string;
  rate_per_acre: number;
  rate_unit: string;
}

export interface ScoringPass {
  category: string;
  products: ScoringProduct[];
}

// ─── Product footprint data ───────────────────────────────────────────────────
// kg CO2e per unit of product (production) and per application pass.
// biologyImpact: multiplier on soil health (0.7–1.0; lower = more disruptive).
// pollinatorSafety: 0–1; higher = safer.

interface ProductFootprint {
  production: number;
  application: number;
  biologyImpact: number;
  pollinatorSafety: number;
}

const DEFAULT_FOOTPRINT: ProductFootprint = {
  production: 16.0,
  application: 2.0,
  biologyImpact: 0.87,
  pollinatorSafety: 0.85,
};

const PRODUCT_FOOTPRINTS: Record<string, ProductFootprint> = {
  'ICC Glufosinate 280SL':    { production: 12.5, application: 2.1, biologyImpact: 0.85, pollinatorSafety: 0.90 },
  'ICC Azoxystrobin 2SC':     { production: 18.2, application: 1.8, biologyImpact: 0.90, pollinatorSafety: 0.80 },
  'ICC Mesotrione 4SC':       { production: 22.1, application: 1.9, biologyImpact: 0.82, pollinatorSafety: 0.95 },
  'ICC Clethodim 2EC':        { production: 15.7, application: 2.0, biologyImpact: 0.88, pollinatorSafety: 0.90 },
  'ICC Metribuzin 75DF':      { production: 16.8, application: 1.7, biologyImpact: 0.80, pollinatorSafety: 0.85 },
  'ICC Paraquat 3SL':         { production: 14.3, application: 2.2, biologyImpact: 0.75, pollinatorSafety: 0.70 },
  'ICC Propiconazole 3.6EC':  { production: 19.5, application: 1.8, biologyImpact: 0.83, pollinatorSafety: 0.75 },
  'ICC AzoxystrobinProp':     { production: 24.1, application: 1.9, biologyImpact: 0.81, pollinatorSafety: 0.70 },
};

function getFootprint(productName: string): ProductFootprint {
  // Exact match first, then partial match for product name variations
  if (PRODUCT_FOOTPRINTS[productName]) return PRODUCT_FOOTPRINTS[productName];
  const key = Object.keys(PRODUCT_FOOTPRINTS).find((k) =>
    productName.toLowerCase().includes(k.toLowerCase()) ||
    k.toLowerCase().includes(productName.toLowerCase())
  );
  return key ? PRODUCT_FOOTPRINTS[key] : DEFAULT_FOOTPRINT;
}

// ─── Base soil sequestration by crop type (metric tons CO2e/acre/year) ────────
const BASE_SEQUESTRATION: Record<string, number> = {
  corn: 1.2,
  soybeans: 1.8,
  wheat: 1.5,
  cotton: 0.8,
  peanuts: 1.6,
};

// ─── Scoring sub-functions ────────────────────────────────────────────────────

function scoreSoilHealth(passes: ScoringPass[], cropType: string): number {
  const base = BASE_SEQUESTRATION[cropType.toLowerCase()] ?? 1.0;

  // Herbicide passes indicate chemical weed control → reduced tillage
  const herbicidePasses = passes.filter((p) =>
    p.category === 'Pre-Emergent' || p.category === 'Post-Emerge'
  ).length;
  const tillageReduction = Math.min(herbicidePasses, 3) * 0.4;

  // Soil biology multiplier: product of all product biology impacts
  let biologyMultiplier = 1.0;
  for (const pass of passes) {
    for (const product of pass.products) {
      biologyMultiplier *= getFootprint(product.product_name).biologyImpact;
    }
  }
  // Clamp to reasonable range
  biologyMultiplier = Math.max(0.5, Math.min(1.0, biologyMultiplier));

  return (base + tillageReduction) * biologyMultiplier;
}

function scoreChemicalImpact(passes: ScoringPass[]): number {
  let score = 0;

  for (const pass of passes) {
    for (const product of pass.products) {
      const fp = getFootprint(product.product_name);
      // Production emissions penalty (convert kg → metric tons, scale by rate)
      const rateScale = Math.max(0.5, Math.min(2.0, product.rate_per_acre / 16));
      const productionPenalty = (fp.production * rateScale) * 0.001;
      const applicationPenalty = fp.application * 0.001;
      score -= productionPenalty + applicationPenalty;

      // Biology benefit: products that preserve soil biology score positively
      score += (fp.biologyImpact - 0.80) * 0.5;
    }
  }

  // Normalize: typical plan scores around -0.3 to +0.1; shift to a 0-based range
  return score + 0.5;
}

function scoreOperationalEfficiency(passes: ScoringPass[]): number {
  const BASELINE_PASSES = 6;
  const passCount = passes.length;
  const passReduction = Math.max(0, BASELINE_PASSES - passCount);
  let score = passReduction * 0.25;

  // Bonus for multi-product passes (tank mixing)
  for (const pass of passes) {
    if (pass.products.length > 1) {
      score += 0.15;
    }
  }

  return score;
}

function scoreBiodiversity(passes: ScoringPass[]): number {
  if (passes.length === 0) return 0;

  let totalSafety = 0;
  let productCount = 0;

  for (const pass of passes) {
    for (const product of pass.products) {
      totalSafety += getFootprint(product.product_name).pollinatorSafety;
      productCount++;
    }
  }

  if (productCount === 0) return 0;
  const avgSafety = totalSafety / productCount;

  // Scale: 0.7 avg → 0, 1.0 avg → 0.6
  return Math.max(0, (avgSafety - 0.7) * 2.0);
}

// ─── Carbon credit estimation ─────────────────────────────────────────────────

const CARBON_PRICES = { voluntary: 12, verified: 25, premium: 45 } as const;

function estimateCredits(
  totalScore: number,
  totalAcres: number
): { credits: number; value: number; level: CarbonScore['certification_level'] } {
  if (totalScore <= 0) return { credits: 0, value: 0, level: 'none' };

  const credits = Math.round(totalScore * totalAcres * 0.1 * 100) / 100;
  const level: CarbonScore['certification_level'] =
    totalScore >= 3.0 ? 'premium' :
    totalScore >= 2.0 ? 'verified' :
    totalScore >= 1.0 ? 'voluntary' : 'none';

  const pricePerTon = level === 'none' ? 0 : CARBON_PRICES[level];
  const value = Math.round(credits * pricePerTon * 100) / 100;

  return { credits, value, level };
}

// ─── Recommendations ──────────────────────────────────────────────────────────

function buildRecommendations(
  soilHealth: number,
  chemicalImpact: number,
  operationalEfficiency: number,
  biodiversity: number,
  totalScore: number
): string[] {
  const recs: string[] = [];

  if (soilHealth < 1.2) {
    recs.push('Consider cover crops between seasons to increase soil carbon sequestration');
    recs.push('Evaluate reduced or no-till practices to preserve soil organic matter');
  }
  if (chemicalImpact < 0.2) {
    recs.push('Optimize application rates to reduce chemical production emissions');
    recs.push('Tank-mix compatible products to reduce the number of field passes');
  }
  if (operationalEfficiency < 0.4) {
    recs.push('Combine applications where tank-mix compatibility allows to cut field passes');
    recs.push('Precision application technology can reduce per-acre chemical use');
  }
  if (biodiversity < 0.2) {
    recs.push('Time applications to avoid bee foraging periods (early morning or evening)');
    recs.push('Establish pollinator-friendly buffer zones at field edges');
  }
  if (totalScore >= 2.0) {
    recs.push('Excellent carbon performance — consider enrolling in a verified carbon credit program');
    recs.push('Document your practices now to qualify for premium carbon credit certification');
  } else if (totalScore >= 1.0) {
    recs.push('Good carbon performance — eligible for voluntary carbon markets');
  }

  return recs;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Calculate a carbon score for a crop plan.
 * Pure function — safe to call on server or client.
 */
export function calculateCarbonScore(
  passes: ScoringPass[],
  cropType: string,
  totalAcres: number
): CarbonScore {
  const soilHealth = scoreSoilHealth(passes, cropType);
  const chemicalImpact = scoreChemicalImpact(passes);
  const operationalEfficiency = scoreOperationalEfficiency(passes);
  const biodiversity = scoreBiodiversity(passes);

  const totalScore =
    soilHealth * 0.35 +
    chemicalImpact * 0.30 +
    operationalEfficiency * 0.20 +
    biodiversity * 0.15;

  const rounded = (n: number) => Math.round(n * 100) / 100;

  const { credits, value, level } = estimateCredits(totalScore, totalAcres);

  return {
    total_score: rounded(totalScore),
    soil_health: rounded(soilHealth),
    chemical_impact: rounded(chemicalImpact),
    operational_efficiency: rounded(operationalEfficiency),
    biodiversity: rounded(biodiversity),
    estimated_credits: credits,
    potential_value: value,
    certification_level: level,
    sustainable_ag: totalScore >= 1.0,
    regen_ag: totalScore >= 1.5,
    carbon_neutral: totalScore >= 2.5,
    recommendations: buildRecommendations(soilHealth, chemicalImpact, operationalEfficiency, biodiversity, totalScore),
    scored_at: new Date().toISOString(),
  };
}
