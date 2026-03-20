import { describe, it, expect } from 'vitest';
import { calcUnitsNeeded, calcCostPerAcre } from '@/lib/acre-pack-calc';

describe('calcUnitsNeeded', () => {
  it('returns 0 for non-positive acreage', () => {
    expect(calcUnitsNeeded(0, 5, 10)).toBe(0);
    expect(calcUnitsNeeded(-1, 5, 10)).toBe(0);
  });

  it('returns 0 for non-positive unitSize', () => {
    expect(calcUnitsNeeded(100, 5, 0)).toBe(0);
    expect(calcUnitsNeeded(100, 5, -1)).toBe(0);
  });

  it('calculates correctly when rate and container are the same unit', () => {
    // 100 acres * 32 fl oz/acre = 3200 fl oz, / 320 fl oz per jug = 10 jugs
    expect(calcUnitsNeeded(100, 32, 320, 'fl oz', 'fl oz')).toBe(10);
  });

  it('rounds up to next whole unit', () => {
    // 100 acres * 33 fl oz/acre = 3300 fl oz, / 320 = 10.3125 → 11
    expect(calcUnitsNeeded(100, 33, 320, 'fl oz', 'fl oz')).toBe(11);
  });

  it('treats null/undefined rateUnit and unitSizeUnit as same-unit (legacy path)', () => {
    expect(calcUnitsNeeded(100, 32, 320, null, null)).toBe(10);
    expect(calcUnitsNeeded(100, 32, 320, undefined, undefined)).toBe(10);
    expect(calcUnitsNeeded(100, 32, 320)).toBe(10);
  });

  describe('fl oz/acre → gal container conversion', () => {
    it('converts fl oz/acre to gal correctly — Glyphosate 16 fl oz/acre, 265 gal tote, 1000 acres', () => {
      // 16 fl oz/acre → 16/128 = 0.125 gal/acre
      // 1000 * 0.125 = 125 gal, ceil(125 / 265) = 1
      expect(calcUnitsNeeded(1000, 16, 265, 'fl oz', 'gal')).toBe(1);
    });

    it('Glyphosate 5.4 lbs/acre via lbs→gal path with lbsPerGallon', () => {
      // 5.4 lbs/acre / 10 lbs/gal = 0.54 gal/acre
      // 1000 * 0.54 = 540 gal, ceil(540 / 265) = 3
      expect(calcUnitsNeeded(1000, 5.4, 265, 'lbs', 'gal', 10)).toBe(3);
    });

    it('Glyphosate 5.4 lbs/acre, 500 acres → 2 totes', () => {
      // 500 * 0.54 = 270 gal, ceil(270 / 265) = 2
      expect(calcUnitsNeeded(500, 5.4, 265, 'lbs', 'gal', 10)).toBe(2);
    });

    it('converts fl oz/acre to qt container', () => {
      // 64 fl oz/acre → 64/32 = 2 qt/acre
      // 10 * 2 = 20 qt, ceil(20 / 5) = 4
      expect(calcUnitsNeeded(10, 64, 5, 'fl oz', 'qt')).toBe(4);
    });

    it('converts fl oz/acre to pt container', () => {
      // 32 fl oz/acre → 32/16 = 2 pt/acre
      // 10 * 2 = 20 pt, ceil(20 / 4) = 5
      expect(calcUnitsNeeded(10, 32, 4, 'fl oz', 'pt')).toBe(5);
    });

    it('converts gal/acre to fl oz container', () => {
      // 0.5 gal/acre → 0.5 * 128 = 64 fl oz/acre
      // 10 * 64 = 640 fl oz, ceil(640 / 128) = 5
      expect(calcUnitsNeeded(10, 0.5, 128, 'gal', 'fl oz')).toBe(5);
    });
  });

  describe('weight conversions', () => {
    it('converts oz/acre to lbs container', () => {
      // 32 oz/acre → 32/16 = 2 lbs/acre
      // 100 * 2 = 200 lbs, ceil(200 / 50) = 4
      expect(calcUnitsNeeded(100, 32, 50, 'oz', 'lbs')).toBe(4);
    });

    it('converts lbs/acre to oz container', () => {
      // 2 lbs/acre → 2 * 16 = 32 oz/acre
      // 10 * 32 = 320 oz, ceil(320 / 64) = 5
      expect(calcUnitsNeeded(10, 2, 64, 'lbs', 'oz')).toBe(5);
    });
  });

  describe('legacy lbs_per_gallon path (no explicit unit fields)', () => {
    it('applies lbs_per_gallon when no unit fields provided', () => {
      // Legacy: 5.4 lbs/acre, 10 lbs/gal, 265 gal tote
      expect(calcUnitsNeeded(1000, 5.4, 265, null, null, 10)).toBe(3);
    });

    it('treats zero lbsPerGallon as no conversion (legacy)', () => {
      expect(calcUnitsNeeded(100, 32, 320, null, null, 0)).toBe(10);
    });
  });

  describe('unsupported conversions fall back gracefully', () => {
    it('falls back to same-unit calculation when conversion is not supported', () => {
      // lbs → gal without lbsPerGallon — convertUnits returns null, falls back to raw rate
      expect(calcUnitsNeeded(100, 5, 10, 'lbs', 'gal', null)).toBe(50);
    });
  });
});

describe('calcCostPerAcre', () => {
  it('returns 0 for non-positive acreage', () => {
    expect(calcCostPerAcre(5, '100', 0)).toBe(0);
    expect(calcCostPerAcre(5, '100', -1)).toBe(0);
  });

  it('calculates cost per acre correctly — Glyphosate example', () => {
    // 3 totes * $3975 / 1000 acres = $11.925/acre
    const result = calcCostPerAcre(3, '3975', 1000);
    expect(result).toBeCloseTo(11.925, 2);
  });

  it('handles single unit', () => {
    // 1 unit * $50 / 100 acres = $0.50
    expect(calcCostPerAcre(1, '50', 100)).toBeCloseTo(0.5, 2);
  });
});
