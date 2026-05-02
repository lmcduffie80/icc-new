import { describe, it, expect } from 'vitest';
import {
  parseActiveIngredients,
  primaryActiveIngredient,
  concentrationsMatch,
  buildSearchQuery,
  parsePackaging,
  packagesMatch,
  retailerNameFromUrl,
  convertToGallons,
  computePricePerGallon,
} from '@/lib/competitor-match';

describe('parseActiveIngredients', () => {
  it('parses "Glyphosate 41%" as glyphosate / 41', () => {
    const result = parseActiveIngredients('Glyphosate 41%');
    expect(result).toHaveLength(1);
    expect(result[0].normalized).toBe('glyphosate');
    expect(result[0].concentration).toBe(41);
  });

  it('parses "41% Glyphosate SL" as glyphosate / 41 regardless of order', () => {
    const result = parseActiveIngredients('41% Glyphosate SL');
    expect(result).toHaveLength(1);
    expect(result[0].normalized).toBe('glyphosate');
    expect(result[0].concentration).toBe(41);
  });

  it('parses decimals like "Propiconazole 14.3%"', () => {
    const result = parseActiveIngredients('Propiconazole 14.3%');
    expect(result).toHaveLength(1);
    expect(result[0].normalized).toBe('propiconazole');
    expect(result[0].concentration).toBeCloseTo(14.3, 1);
  });

  it('parses multi-ingredient blends into multiple entries', () => {
    const result = parseActiveIngredients(
      'Zinc 5%, Manganese 3%, Boron 1%, Copper 1%'
    );
    expect(result).toHaveLength(4);
    expect(result[0].normalized).toBe('zinc');
    expect(result[0].concentration).toBe(5);
    expect(result[1].normalized).toBe('manganese');
    expect(result[2].normalized).toBe('boron');
    expect(result[3].normalized).toBe('copper');
  });

  it('returns empty array for "N/A - Natural Seed"', () => {
    expect(parseActiveIngredients('N/A - Natural Seed')).toEqual([]);
  });

  it('returns empty array for N-P-K fertilizer blends', () => {
    expect(parseActiveIngredients('N-P-K 15-15-15')).toEqual([]);
  });

  it('returns empty array for null/undefined/empty input', () => {
    expect(parseActiveIngredients(null)).toEqual([]);
    expect(parseActiveIngredients(undefined)).toEqual([]);
    expect(parseActiveIngredients('')).toEqual([]);
  });

  it('ignores trailing formulation suffixes (SL, SC, EC, WP, WDG)', () => {
    const cases = [
      '41% Glyphosate SL',
      'Glyphosate 41% SC',
      'Glyphosate 41% EC',
      'Glyphosate 41% WP',
      'Glyphosate 41% WDG',
    ];
    for (const input of cases) {
      const result = parseActiveIngredients(input);
      expect(result[0].normalized).toBe('glyphosate');
      expect(result[0].concentration).toBe(41);
    }
  });
});

describe('primaryActiveIngredient', () => {
  it('returns the first ingredient for a blend', () => {
    const result = primaryActiveIngredient('Zinc 5%, Manganese 3%');
    expect(result?.normalized).toBe('zinc');
    expect(result?.concentration).toBe(5);
  });

  it('returns null for non-chemical product strings', () => {
    expect(primaryActiveIngredient('N/A - Natural Seed')).toBeNull();
    expect(primaryActiveIngredient(null)).toBeNull();
  });
});

describe('concentrationsMatch', () => {
  it('matches identical concentrations', () => {
    expect(concentrationsMatch(41, 41)).toBe(true);
  });

  it('matches within the default 1 percentage-point tolerance', () => {
    expect(concentrationsMatch(41, 41.5)).toBe(true);
    expect(concentrationsMatch(41, 40.1)).toBe(true);
  });

  it('rejects concentrations outside tolerance', () => {
    expect(concentrationsMatch(41, 43)).toBe(false);
  });

  it('treats both null as a match, one null as a miss', () => {
    expect(concentrationsMatch(null, null)).toBe(true);
    expect(concentrationsMatch(41, null)).toBe(false);
    expect(concentrationsMatch(null, 41)).toBe(false);
  });

  it('honors a custom tolerance', () => {
    expect(concentrationsMatch(41, 43, 5)).toBe(true);
    expect(concentrationsMatch(41, 46.5, 5)).toBe(false);
  });
});

describe('buildSearchQuery', () => {
  const ingredient = {
    normalized: 'glyphosate',
    display: 'Glyphosate',
    concentration: 41,
  };

  it('substitutes {{ingredient}} and {{concentration}}', () => {
    const out = buildSearchQuery(
      'site:fbn.com {{ingredient}} {{concentration}}',
      ingredient
    );
    expect(out).toBe('site:fbn.com Glyphosate 41%');
  });

  it('falls back to "<ingredient> <concentration>%" when template is missing', () => {
    expect(buildSearchQuery(null, ingredient)).toBe('Glyphosate 41%');
    expect(buildSearchQuery(undefined, ingredient)).toBe('Glyphosate 41%');
  });

  it('handles ingredients without a concentration', () => {
    const withoutConcentration = {
      normalized: 'sulfur',
      display: 'Sulfur',
      concentration: null,
    };
    expect(buildSearchQuery(null, withoutConcentration)).toBe('Sulfur');
    expect(buildSearchQuery('{{ingredient}} {{concentration}}', withoutConcentration)).toBe(
      'Sulfur'
    );
  });

  it('substitutes {{packaging}} when a packaging is provided', () => {
    const packaging = parsePackaging('2.5 gal', null);
    expect(packaging).not.toBeNull();
    const out = buildSearchQuery(
      'site:fbn.com {{ingredient}} {{concentration}} {{packaging}}',
      ingredient,
      packaging
    );
    expect(out).toBe('site:fbn.com Glyphosate 41% 2.5 gal');
  });

  it('collapses empty {{packaging}} cleanly when packaging is null', () => {
    const out = buildSearchQuery(
      '{{ingredient}} {{concentration}} {{packaging}} buy online',
      ingredient,
      null
    );
    expect(out).toBe('Glyphosate 41% buy online');
  });
});

describe('parsePackaging', () => {
  it('parses "2.5 gal" as 2.5 gallons', () => {
    const p = parsePackaging('2.5 gal', null);
    expect(p).not.toBeNull();
    expect(p!.canonical).toBe('2.5gal');
    expect(p!.sizeValue).toBe(2.5);
    expect(p!.sizeUnit).toBe('gal');
    expect(p!.display).toBe('2.5 gal');
  });

  it('parses "30 gallon drum" ignoring trailing words', () => {
    const p = parsePackaging('30 gallon drum', null);
    expect(p).not.toBeNull();
    expect(p!.canonical).toBe('30gal');
    expect(p!.sizeValue).toBe(30);
    expect(p!.sizeUnit).toBe('gal');
  });

  it('parses "1 qt" as 1 quart', () => {
    const p = parsePackaging('1 qt', null);
    expect(p?.canonical).toBe('1qt');
    expect(p?.sizeUnit).toBe('qt');
  });

  it('parses "50 lb bag" as 50 pounds', () => {
    const p = parsePackaging('50 lb bag', null);
    expect(p?.canonical).toBe('50lb');
    expect(p?.sizeUnit).toBe('lb');
  });

  it('parses "Case (4 x 1 gal)" as 1 gal (per-container size, not the case multiplier)', () => {
    const p = parsePackaging('Case (4 x 1 gal)', null);
    // The parser walks the string looking for "<number> <unit>"; "4 x" has
    // no unit after it, so the match falls through to "1 gal" — which is
    // the right per-container size to compare against competitor listings.
    expect(p?.canonical).toBe('1gal');
    expect(p?.sizeUnit).toBe('gal');
  });

  it('returns null for completely unparseable strings', () => {
    expect(parsePackaging('marketing tagline', null)).toBeNull();
    expect(parsePackaging('', null)).toBeNull();
    expect(parsePackaging(null, null)).toBeNull();
    expect(parsePackaging(undefined, undefined)).toBeNull();
  });

  it('falls back to unit_of_measure when containerSizes is missing', () => {
    expect(parsePackaging(null, 'gallon')?.canonical).toBe('gal');
    expect(parsePackaging(null, 'case')?.canonical).toBe('case');
    expect(parsePackaging(null, 'each')?.canonical).toBe('each');
  });

  it('prefers containerSizes over unit_of_measure', () => {
    const p = parsePackaging('2.5 gal', 'gallon');
    expect(p?.canonical).toBe('2.5gal');
  });

  it('returns the first parseable segment from a multi-size string', () => {
    const p = parsePackaging('2.5 gal, 30 gal', null);
    expect(p?.canonical).toBe('2.5gal');
  });

  it('handles fluid ounces', () => {
    const p = parsePackaging('32 fl oz', null);
    expect(p?.sizeUnit).toBe('fl_oz');
    expect(p?.sizeValue).toBe(32);
  });

  it('handles metric units (liters, kilograms)', () => {
    expect(parsePackaging('1 liter', null)?.canonical).toBe('1l');
    expect(parsePackaging('5 kg', null)?.canonical).toBe('5kg');
  });
});

describe('packagesMatch', () => {
  const twoFiveGal = parsePackaging('2.5 gal', null)!;
  const thirtyGal = parsePackaging('30 gal', null)!;
  const twoFiveGalish = parsePackaging('2.6 gal', null)!;
  const fiftyLb = parsePackaging('50 lb', null)!;

  it('returns true for identical packagings', () => {
    expect(packagesMatch(twoFiveGal, parsePackaging('2.5 gal', null))).toBe(true);
  });

  it('returns true within the default 5% tolerance', () => {
    expect(packagesMatch(twoFiveGal, twoFiveGalish)).toBe(true); // 2.5 vs 2.6 → 3.85%
  });

  it('returns false outside the tolerance', () => {
    expect(packagesMatch(twoFiveGal, thirtyGal)).toBe(false);
  });

  it('returns false for mismatched units (no cross-unit conversion)', () => {
    expect(packagesMatch(twoFiveGal, fiftyLb)).toBe(false);
  });

  it('treats null on either side as a wildcard match (legacy rows)', () => {
    expect(packagesMatch(null, twoFiveGal)).toBe(true);
    expect(packagesMatch(twoFiveGal, null)).toBe(true);
    expect(packagesMatch(null, null)).toBe(true);
  });

  it('honors a custom tolerance', () => {
    // 2.5 vs 30 is a huge diff; even a 50% tolerance won't match.
    expect(packagesMatch(twoFiveGal, thirtyGal, 50)).toBe(false);
    // But 2.5 vs 3.0 gallons (20% diff) should match at 25% tolerance.
    expect(packagesMatch(twoFiveGal, parsePackaging('3 gal', null), 25)).toBe(true);
  });
});

describe('convertToGallons', () => {
  it('returns the value when unit is already gallons', () => {
    expect(convertToGallons(2.5, 'gal')).toBe(2.5);
    expect(convertToGallons(265, 'gal')).toBe(265);
  });

  it('converts quarts → gallons (4 qt = 1 gal)', () => {
    expect(convertToGallons(4, 'qt')).toBe(1);
    expect(convertToGallons(1, 'qt')).toBe(0.25);
  });

  it('converts pints → gallons (8 pt = 1 gal)', () => {
    expect(convertToGallons(8, 'pt')).toBe(1);
  });

  it('converts fluid ounces → gallons (128 fl oz = 1 gal)', () => {
    expect(convertToGallons(128, 'fl_oz')).toBe(1);
  });

  it('converts liters → gallons', () => {
    expect(convertToGallons(1, 'l')).toBeCloseTo(0.264172, 5);
    expect(convertToGallons(3.785, 'l')).toBeCloseTo(1, 2);
  });

  it('returns null for weight units (lb, oz, kg, g)', () => {
    expect(convertToGallons(50, 'lb')).toBeNull();
    expect(convertToGallons(16, 'oz')).toBeNull();
    expect(convertToGallons(2, 'kg')).toBeNull();
    expect(convertToGallons(500, 'g')).toBeNull();
  });

  it('returns null for unit-only sizes (each, case)', () => {
    expect(convertToGallons(1, 'each')).toBeNull();
    expect(convertToGallons(1, 'case')).toBeNull();
  });

  it('returns null when sizeValue is missing or non-positive', () => {
    expect(convertToGallons(null, 'gal')).toBeNull();
    expect(convertToGallons(undefined, 'gal')).toBeNull();
    expect(convertToGallons(0, 'gal')).toBeNull();
    expect(convertToGallons(-1, 'gal')).toBeNull();
  });
});

describe('computePricePerGallon', () => {
  it('divides total price by gallon count for the user-stated 265 gal tote example', () => {
    const tote = parsePackaging('265 Gal', null);
    expect(computePricePerGallon(4240, tote)).toBe(16);
  });

  it('handles a 2.5 gal jug at $50 → $20/gal', () => {
    const jug = parsePackaging('2.5 gal', null);
    expect(computePricePerGallon(50, jug)).toBe(20);
  });

  it('handles a 1 qt bottle at $20 → $80/gal', () => {
    const bottle = parsePackaging('1 qt', null);
    expect(computePricePerGallon(20, bottle)).toBe(80);
  });

  it('rounds to the cent', () => {
    // 30 / 3 = 10
    expect(computePricePerGallon(30, parsePackaging('3 gal', null))).toBe(10);
    // 1 L = 0.264172 gal; $5 / 0.264172 = $18.927... → $18.93
    expect(computePricePerGallon(5, parsePackaging('1 liter', null))).toBe(18.93);
  });

  it('returns null for weight-based packages (a 50 lb bag has no $/gal)', () => {
    expect(computePricePerGallon(75, parsePackaging('50 lb', null))).toBeNull();
  });

  it('returns null when packaging is missing or unparseable', () => {
    expect(computePricePerGallon(50, null)).toBeNull();
    expect(computePricePerGallon(50, parsePackaging('marketing', null))).toBeNull();
  });

  it('returns null for missing or non-positive prices', () => {
    expect(computePricePerGallon(null, parsePackaging('2.5 gal', null))).toBeNull();
    expect(computePricePerGallon(undefined, parsePackaging('2.5 gal', null))).toBeNull();
    expect(computePricePerGallon(0, parsePackaging('2.5 gal', null))).toBeNull();
    expect(computePricePerGallon(-5, parsePackaging('2.5 gal', null))).toBeNull();
  });
});

describe('retailerNameFromUrl', () => {
  it('extracts a friendly retailer name from a hostname', () => {
    expect(retailerNameFromUrl('https://www.tractorsupply.com/p/123')).toBe('Tractorsupply');
    expect(retailerNameFromUrl('https://amazon.com/dp/B00123')).toBe('Amazon');
  });

  it('strips common subdomain prefixes', () => {
    expect(retailerNameFromUrl('https://shop.domyown.com/glyphosate')).toBe('Domyown');
    expect(retailerNameFromUrl('https://store.example-co.com/x')).toBe('Example Co');
  });

  it('returns null for invalid or missing URLs', () => {
    expect(retailerNameFromUrl(null)).toBeNull();
    expect(retailerNameFromUrl(undefined)).toBeNull();
    expect(retailerNameFromUrl('not a url')).toBeNull();
  });
});
