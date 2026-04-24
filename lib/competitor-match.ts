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
 * query. Template supports `{{ingredient}}` and `{{concentration}}` tokens.
 */
export function buildSearchQuery(
  template: string | null | undefined,
  ingredient: ParsedIngredient
): string {
  const concentrationText = ingredient.concentration !== null
    ? `${ingredient.concentration}%`
    : '';
  const fallback = `${ingredient.display} ${concentrationText}`.trim();
  if (!template) return fallback;
  return template
    .replace(/{{\s*ingredient\s*}}/gi, ingredient.display)
    .replace(/{{\s*concentration\s*}}/gi, concentrationText)
    .trim();
}
