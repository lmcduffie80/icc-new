import { describe, it, expect } from 'vitest';
import {
  getPlantingDateRange,
  getPlantingMidpoint,
  type CropType,
} from '@/lib/planting-dates';

describe('planting-dates', () => {
  describe('getPlantingDateRange', () => {
    it('returns range for known state IL and corn', () => {
      const range = getPlantingDateRange('IL', 'corn');
      expect(range.start.month).toBe(4);
      expect(range.start.day).toBe(15);
      expect(range.end.month).toBe(5);
      expect(range.end.day).toBe(15);
    });

    it('returns range for GA cotton', () => {
      const range = getPlantingDateRange('GA', 'cotton');
      expect(range.start.month).toBe(4);
      expect(range.end.month).toBe(5);
    });

    it('returns default for unknown state', () => {
      const range = getPlantingDateRange('XX', 'corn' as CropType);
      expect(range.start).toBeDefined();
      expect(range.end).toBeDefined();
    });

    it('is case-insensitive for state', () => {
      const lower = getPlantingDateRange('il', 'corn');
      const upper = getPlantingDateRange('IL', 'corn');
      expect(lower).toEqual(upper);
    });
  });

  describe('getPlantingMidpoint', () => {
    it('returns date within planting window for IL corn 2026', () => {
      const mid = getPlantingMidpoint('IL', 'corn', 2026);
      expect(mid.getFullYear()).toBe(2026);
      expect(mid.getMonth()).toBeGreaterThanOrEqual(3); // April = 3 (0-indexed)
      expect(mid.getMonth()).toBeLessThanOrEqual(4); // May = 4
    });

    it('returns consistent midpoint for same inputs', () => {
      const a = getPlantingMidpoint('IA', 'soybeans', 2026);
      const b = getPlantingMidpoint('IA', 'soybeans', 2026);
      expect(a.getTime()).toBe(b.getTime());
    });
  });
});
