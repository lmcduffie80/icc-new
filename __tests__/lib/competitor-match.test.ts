import { describe, it, expect } from 'vitest';
import {
  parseActiveIngredients,
  primaryActiveIngredient,
  concentrationsMatch,
  buildSearchQuery,
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
});
