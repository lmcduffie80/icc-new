/**
 * Active ingredient parsing + matching utilities.
 *
 * ICC products store active ingredients as free-form strings inside
 * `products.attributes.activeIngredients`, for example:
 *   - "Glyphosate 41%"
 *   - "41% Glyphosate SL"
 *   - "Propiconazole 14.3%"
 *   - "Zinc 5%, Manganese 3%, Boron 1%, Copper 1%"
 *   - "N/A - Natural Seed"
 *
 * Both the writer path (the nightly cron upserting competitor_products) and
 * the reader path (the /api/products/[id]/competitor-pricing endpoint) must
 * normalize these strings the same way so rows join cleanly on
 * `normalized_active_ingredient` + `concentration_percent`.
 */

export interface ParsedIngredient {
  /** Lowercased canonical ingredient name, e.g. "glyphosate". */
  normalized: string;
  /** Original display name as parsed, preserving capitalization. */
  display: string;
  /** Concentration as a decimal percent, e.g. 41 for "41%". `null` when unknown. */
  concentration: number | null;
}

/** Tokens that indicate the product has no chemical active ingredient. */
const NON_CHEMICAL_MARKERS = [
  'n/a',
  'not applicable',
  'natural seed',
  'natural hybrid seed',
  'electronic equipment',
  'irrigation equipment',
  'none',
];

/**
 * Trim whitespace and strip common product-suffix noise ("SL", "SC", "EC",
 * "WP", "WDG") so "41% Glyphosate SL" and "Glyphosate 41%" collapse to the
 * same normalized name.
 */
function stripFormulationSuffix(value: string): string {
  return value
    .replace(/\b(sl|sc|ec|wp|wdg|dg|ew|me|od|xt)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse a single segment like "Glyphosate 41%" or "41% Glyphosate" into a
 * structured pair. Returns `null` when the segment can't confidently be
 * parsed (e.g. a marketing tagline).
 */
function parseSegment(segment: string): ParsedIngredient | null {
  const trimmed = segment.trim();
  if (trimmed.length === 0) return null;

  const lower = trimmed.toLowerCase();
  if (NON_CHEMICAL_MARKERS.some((marker) => lower.includes(marker))) {
    return null;
  }

  // N-P-K fertilizer blends like "N-P-K 15-15-15" — skip; not an active
  // ingredient we can price against a competitor chemical.
  if (/n[-\s]*p[-\s]*k/i.test(trimmed)) return null;

  const cleaned = stripFormulationSuffix(trimmed);

  // Extract a percent concentration if present.
  const percentMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*%/);
  const concentration = percentMatch ? Number(percentMatch[1]) : null;

  // The ingredient name is everything left after removing the percent token
  // and any stray punctuation.
  const namePart = cleaned
    .replace(/(\d+(?:\.\d+)?)\s*%/g, '')
    .replace(/[,.;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (namePart.length < 3) return null;

  // Normalize: lowercase, remove stray punctuation, collapse spaces. We keep
  // multi-word ingredients intact (e.g. "bacillus thuringiensis").
  const normalized = namePart.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim();

  if (normalized.length === 0) return null;

  return {
    normalized,
    display: namePart,
    concentration: concentration !== null && Number.isFinite(concentration) ? concentration : null,
  };
}

/**
 * Parse an active-ingredient string into one or more structured pairs.
 *
 * Multi-ingredient strings like
 *   "Zinc 5%, Manganese 3%, Boron 1%, Copper 1%"
 * return every parseable segment. Callers that need a single primary
 * ingredient can read `result[0]`, which corresponds to the first ingredient
 * listed (the dominant one by convention in ag chemical labels).
 */
export function parseActiveIngredients(value: string | null | undefined): ParsedIngredient[] {
  if (!value) return [];

  const segments = value.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const results: ParsedIngredient[] = [];
  for (const segment of segments) {
    const parsed = parseSegment(segment);
    if (parsed) results.push(parsed);
  }
  return results;
}

/**
 * Primary active ingredient of a product, as used by the competitor match
 * logic. Returns `null` for non-chemical products (seed, electronics, etc.)
 * where competitor pricing comparisons don't apply.
 */
export function primaryActiveIngredient(
  value: string | null | undefined
): ParsedIngredient | null {
  const parsed = parseActiveIngredients(value);
  return parsed[0] ?? null;
}

/**
 * Returns true when two concentrations are considered equivalent for matching
 * purposes. Allows 1 percentage-point tolerance so "41%" and "41.5%" match
 * the same competitor listing. Concentrations that are both `null` match as
 * well — useful for ingredients sold at a single standard concentration.
 */
export function concentrationsMatch(
  a: number | null,
  b: number | null,
  tolerance = 1
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= tolerance;
}

/**
 * Expands the `search_template` on a competitors row into a concrete search
 * query. Template supports `{{ingredient}}`, `{{concentration}}`, and
 * `{{packaging}}` tokens. Empty packaging collapses cleanly.
 */
export function buildSearchQuery(
  template: string | null | undefined,
  ingredient: ParsedIngredient,
  packaging?: ParsedPackaging | null
): string {
  const concentrationText = ingredient.concentration !== null
    ? `${ingredient.concentration}%`
    : '';
  const packagingText = packaging?.display ?? '';
  const fallback = [ingredient.display, concentrationText, packagingText]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (!template) return fallback;
  return template
    .replace(/{{\s*ingredient\s*}}/gi, ingredient.display)
    .replace(/{{\s*concentration\s*}}/gi, concentrationText)
    .replace(/{{\s*packaging\s*}}/gi, packagingText)
    .replace(/\s+/g, ' ')
    .trim();
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Packaging parsing
 *
 * ICC products store the package size in `attributes.containerSizes` as a
 * free-form string (e.g. "2.5 gal", "30 gallon drum", "1 qt", "50 lb bag",
 * "Case (4 x 1 gal)"). The unit_of_measure column is a coarser fallback
 * (e.g. "gallon", "case"). We normalize both into a canonical form so the
 * competitor pricing read API can compare a 2.5 gal ICC SKU only against
 * 2.5 gal competitor listings.
 * ────────────────────────────────────────────────────────────────────────── */

export type PackagingUnit =
  | 'gal'
  | 'qt'
  | 'pt'
  | 'fl_oz'
  | 'lb'
  | 'oz'
  | 'l'
  | 'ml'
  | 'kg'
  | 'g'
  | 'each'
  | 'case';

export interface ParsedPackaging {
  /** Canonical key for SQL equality joins, e.g. "2.5gal", "50lb". */
  canonical: string;
  /** Numeric size value, e.g. 2.5 for "2.5 gal". `null` for unit-only sizes like "each". */
  sizeValue: number | null;
  /** Normalized unit token. */
  sizeUnit: PackagingUnit;
  /** Human-readable display, e.g. "2.5 gal". */
  display: string;
}

/**
 * Map free-form unit aliases to a canonical {@link PackagingUnit}. Returns
 * `null` for tokens we don't recognize so the caller can decide whether to
 * fall back to a different field.
 */
function normalizeUnit(value: string): PackagingUnit | null {
  const v = value.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  if (!v) return null;

  if (/^(gal|gals|gallon|gallons)$/.test(v)) return 'gal';
  if (/^(qt|qts|quart|quarts)$/.test(v)) return 'qt';
  if (/^(pt|pts|pint|pints)$/.test(v)) return 'pt';
  if (/^(fl ?oz|floz|fluid ounce|fluid ounces)$/.test(v)) return 'fl_oz';
  if (/^(lb|lbs|pound|pounds)$/.test(v)) return 'lb';
  if (/^(oz|ozs|ounce|ounces)$/.test(v)) return 'oz';
  if (/^(l|ltr|liter|litre|liters|litres)$/.test(v)) return 'l';
  if (/^(ml|milliliter|millilitre|milliliters|millilitres)$/.test(v)) return 'ml';
  if (/^(kg|kgs|kilogram|kilograms)$/.test(v)) return 'kg';
  if (/^(g|gram|grams)$/.test(v)) return 'g';
  if (/^(case|cs|cases)$/.test(v)) return 'case';
  if (/^(each|ea|unit|units|count|ct)$/.test(v)) return 'each';
  return null;
}

/**
 * Parse a single package-size token like "2.5 gal" or "30 gallon" into a
 * structured {@link ParsedPackaging}. Returns `null` when the token can't be
 * interpreted as a size + unit.
 */
function parsePackageToken(input: string): ParsedPackaging | null {
  const cleaned = input
    .replace(/[()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;

  // Match the first <number> <unit> pair. Multiplier expressions like
  // "Case (4 x 1 gal)" are intentionally simplified to "1 gal" because the
  // ICC catalog's competitor matching is done on the per-container size,
  // not the total case volume.
  const match = cleaned.match(
    /(\d+(?:\.\d+)?)\s*(gallons?|gals?|quarts?|qts?|pints?|pts?|fl\.?\s*oz|fluid\s+ounces?|pounds?|lbs?|ounces?|ozs?|liters?|litres?|ltr|ml|milli(?:liter|litre)s?|kilograms?|kgs?|grams?|g|each|ea|cs|cases?|units?|count|ct)\b/i
  );

  if (match) {
    const value = Number(match[1]);
    const unit = normalizeUnit(match[2]);
    if (unit && Number.isFinite(value) && value > 0) {
      return {
        canonical: `${stripTrailingZeros(value)}${unit}`,
        sizeValue: value,
        sizeUnit: unit,
        display: `${stripTrailingZeros(value)} ${displayUnit(unit)}`,
      };
    }
  }

  // Unit-only tokens like "each" / "case" with no numeric size.
  const unitOnly = normalizeUnit(cleaned);
  if (unitOnly === 'each' || unitOnly === 'case') {
    return {
      canonical: unitOnly,
      sizeValue: null,
      sizeUnit: unitOnly,
      display: displayUnit(unitOnly),
    };
  }

  return null;
}

function stripTrailingZeros(value: number): string {
  // 2.5 → "2.5", 30 → "30", 30.0 → "30"
  return Number.isInteger(value) ? String(value) : String(value).replace(/0+$/, '').replace(/\.$/, '');
}

function displayUnit(unit: PackagingUnit): string {
  if (unit === 'fl_oz') return 'fl oz';
  return unit;
}

/**
 * Parse an ICC product's packaging from `attributes.containerSizes` (preferred)
 * with a fallback to `unit_of_measure`. Multi-size strings like
 * "2.5 gal, 30 gal" return the first parseable token (the dominant SKU size).
 *
 * Returns `null` when neither field yields a recognizable size — those products
 * skip packaging-restricted matching and fall back to ingredient-only matches.
 */
export function parsePackaging(
  containerSizes: string | null | undefined,
  unitOfMeasure: string | null | undefined
): ParsedPackaging | null {
  // 1) Try each comma-separated segment of containerSizes in order.
  if (containerSizes) {
    const segments = containerSizes.split(/[,;/]/).map((s) => s.trim()).filter(Boolean);
    for (const segment of segments) {
      const parsed = parsePackageToken(segment);
      if (parsed) return parsed;
    }
  }
  // 2) Fall back to unit_of_measure (often just "gallon" / "case").
  if (unitOfMeasure) {
    const parsed = parsePackageToken(unitOfMeasure);
    if (parsed) return parsed;
    const unitOnly = normalizeUnit(unitOfMeasure);
    if (unitOnly) {
      return {
        canonical: unitOnly,
        sizeValue: null,
        sizeUnit: unitOnly,
        display: displayUnit(unitOnly),
      };
    }
  }
  return null;
}

/**
 * Returns true when two packagings should be considered equivalent for
 * competitor matching. Same unit + size within `tolerancePct` percent (default
 * 5%) → match. Both `null` is treated as a wildcard match (the read API uses
 * this for legacy rows without packaging data). Mismatched units never match
 * — we do not attempt cross-unit conversion (e.g. gallons ↔ liters) because
 * the catalog mixes US and metric inconsistently.
 */
export function packagesMatch(
  a: ParsedPackaging | null,
  b: ParsedPackaging | null,
  tolerancePct = 5
): boolean {
  if (a === null || b === null) return true;
  if (a.sizeUnit !== b.sizeUnit) return false;
  if (a.sizeValue === null && b.sizeValue === null) return true;
  if (a.sizeValue === null || b.sizeValue === null) return false;
  const denom = Math.max(Math.abs(a.sizeValue), Math.abs(b.sizeValue));
  if (denom === 0) return a.sizeValue === b.sizeValue;
  const diffPct = (Math.abs(a.sizeValue - b.sizeValue) / denom) * 100;
  return diffPct <= tolerancePct;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Volume → gallons conversion
 *
 * The ICC store displays price-per-gallon prominently (e.g. "$16.00/gal" on
 * a 265 gal tote). Competitor listings come in many sizes — 2.5 gal, 30 gal,
 * 1 qt, 1 L, etc. — so we normalize each one to gallons and divide the
 * competitor's total price by the gallon count to align with the ICC
 * display. Weight units (lb/oz/kg/g) and unit-only sizes (each/case) cannot
 * be converted to volume and return `null`.
 *
 * `case` is intentionally not converted: a "case" can mean any number of
 * sub-containers, and we already store the per-container size when the
 * agent captures something like "Case (4 x 1 gal)" — that's parsed as
 * "1 gal" by `parsePackaging`, so the per-gallon price is correct for the
 * single-container price the user sees.
 * ────────────────────────────────────────────────────────────────────────── */

const VOLUME_UNIT_TO_GALLONS: Partial<Record<PackagingUnit, number>> = {
  gal: 1,
  qt: 1 / 4,
  pt: 1 / 8,
  fl_oz: 1 / 128,
  l: 0.264172052,
  ml: 0.000264172052,
};

/**
 * Convert a (sizeValue, sizeUnit) pair to gallons. Returns `null` when the
 * unit is non-volume (lb, oz, kg, g, each, case) or the size is missing.
 */
export function convertToGallons(
  sizeValue: number | null | undefined,
  sizeUnit: PackagingUnit | null | undefined
): number | null {
  if (sizeValue === null || sizeValue === undefined || sizeUnit === null || sizeUnit === undefined) {
    return null;
  }
  if (!Number.isFinite(sizeValue) || sizeValue <= 0) return null;
  const factor = VOLUME_UNIT_TO_GALLONS[sizeUnit];
  if (factor === undefined) return null;
  return sizeValue * factor;
}

/**
 * Compute the per-gallon price for a packaged product. Returns `null` when
 * either the price or the packaging volume cannot be resolved (e.g. a 50 lb
 * bag of granular product, or a "case" with no per-container size). Rounded
 * to the cent so downstream display logic doesn't have to.
 */
export function computePricePerGallon(
  totalPrice: number | null | undefined,
  packaging: ParsedPackaging | null | undefined
): number | null {
  if (totalPrice === null || totalPrice === undefined) return null;
  if (!Number.isFinite(totalPrice) || totalPrice <= 0) return null;
  if (!packaging) return null;
  const gallons = convertToGallons(packaging.sizeValue, packaging.sizeUnit);
  if (gallons === null || gallons <= 0) return null;
  return Math.round((totalPrice / gallons) * 100) / 100;
}

/**
 * Best-effort retailer name from a product page URL hostname. Used for
 * open-web hits where the hostname (e.g. "tractorsupply.com") is the only
 * retailer signal. Strips common subdomains (www, shop, store).
 */
export function retailerNameFromUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null;
  let hostname: string;
  try {
    hostname = new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  hostname = hostname.replace(/^(www|shop|store|m)\./, '');
  // "tractorsupply.com" → "Tractor Supply", "amazon.com" → "Amazon".
  const root = hostname.split('.').slice(0, -1).join('.') || hostname;
  if (!root) return null;
  return root
    .split(/[-.]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
