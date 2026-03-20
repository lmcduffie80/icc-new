/**
 * Planting date estimates by US state and crop.
 * Based on USDA "Usual Planting and Harvesting Dates for U.S. Field Crops"
 * and extension service guidelines. Dates are approximate midpoints; actual
 * planting varies by year and conditions.
 */

export type CropType = 'corn' | 'soybeans' | 'wheat' | 'cotton';

export interface DateRange {
  /** Start of window (month 1-12, day 1-31) */
  start: { month: number; day: number };
  /** End of window */
  end: { month: number; day: number };
}

/** Planting date windows by state and crop. Key: state code (e.g. "GA") */
export const PLANTING_DATES: Record<string, Record<CropType, DateRange>> = {
  AL: {
    corn: { start: { month: 3, day: 20 }, end: { month: 5, day: 10 } },
    soybeans: { start: { month: 4, day: 25 }, end: { month: 6, day: 15 } },
    wheat: { start: { month: 10, day: 15 }, end: { month: 11, day: 25 } },
    cotton: { start: { month: 4, day: 15 }, end: { month: 5, day: 25 } },
  },
  AR: {
    corn: { start: { month: 3, day: 25 }, end: { month: 5, day: 5 } },
    soybeans: { start: { month: 5, day: 1 }, end: { month: 6, day: 15 } },
    wheat: { start: { month: 10, day: 1 }, end: { month: 11, day: 15 } },
    cotton: { start: { month: 4, day: 20 }, end: { month: 5, day: 25 } },
  },
  CA: {
    corn: { start: { month: 3, day: 15 }, end: { month: 5, day: 15 } },
    soybeans: { start: { month: 4, day: 15 }, end: { month: 6, day: 1 } },
    wheat: { start: { month: 10, day: 15 }, end: { month: 12, day: 15 } },
    cotton: { start: { month: 4, day: 1 }, end: { month: 5, day: 15 } },
  },
  CO: {
    corn: { start: { month: 4, day: 25 }, end: { month: 5, day: 25 } },
    soybeans: { start: { month: 5, day: 10 }, end: { month: 6, day: 5 } },
    wheat: { start: { month: 9, day: 10 }, end: { month: 10, day: 15 } },
    cotton: { start: { month: 5, day: 1 }, end: { month: 5, day: 20 } },
  },
  GA: {
    corn: { start: { month: 3, day: 25 }, end: { month: 5, day: 5 } },
    soybeans: { start: { month: 5, day: 1 }, end: { month: 6, day: 15 } },
    wheat: { start: { month: 10, day: 20 }, end: { month: 11, day: 25 } },
    cotton: { start: { month: 4, day: 15 }, end: { month: 5, day: 20 } },
  },
  IA: {
    corn: { start: { month: 4, day: 15 }, end: { month: 5, day: 10 } },
    soybeans: { start: { month: 5, day: 1 }, end: { month: 6, day: 5 } },
    wheat: { start: { month: 9, day: 20 }, end: { month: 10, day: 15 } },
    cotton: { start: { month: 5, day: 1 }, end: { month: 5, day: 25 } },
  },
  IL: {
    corn: { start: { month: 4, day: 15 }, end: { month: 5, day: 15 } },
    soybeans: { start: { month: 5, day: 1 }, end: { month: 6, day: 10 } },
    wheat: { start: { month: 9, day: 25 }, end: { month: 10, day: 20 } },
    cotton: { start: { month: 4, day: 25 }, end: { month: 5, day: 20 } },
  },
  IN: {
    corn: { start: { month: 4, day: 20 }, end: { month: 5, day: 15 } },
    soybeans: { start: { month: 5, day: 5 }, end: { month: 6, day: 10 } },
    wheat: { start: { month: 9, day: 25 }, end: { month: 10, day: 20 } },
    cotton: { start: { month: 4, day: 25 }, end: { month: 5, day: 20 } },
  },
  KS: {
    corn: { start: { month: 4, day: 20 }, end: { month: 5, day: 15 } },
    soybeans: { start: { month: 5, day: 10 }, end: { month: 6, day: 10 } },
    wheat: { start: { month: 9, day: 15 }, end: { month: 10, day: 20 } },
    cotton: { start: { month: 5, day: 1 }, end: { month: 5, day: 25 } },
  },
  KY: {
    corn: { start: { month: 4, day: 5 }, end: { month: 5, day: 15 } },
    soybeans: { start: { month: 5, day: 1 }, end: { month: 6, day: 15 } },
    wheat: { start: { month: 10, day: 1 }, end: { month: 10, day: 25 } },
    cotton: { start: { month: 4, day: 25 }, end: { month: 5, day: 25 } },
  },
  LA: {
    corn: { start: { month: 2, day: 25 }, end: { month: 4, day: 15 } },
    soybeans: { start: { month: 4, day: 15 }, end: { month: 6, day: 15 } },
    wheat: { start: { month: 10, day: 25 }, end: { month: 11, day: 25 } },
    cotton: { start: { month: 4, day: 1 }, end: { month: 5, day: 15 } },
  },
  MI: {
    corn: { start: { month: 4, day: 25 }, end: { month: 5, day: 20 } },
    soybeans: { start: { month: 5, day: 10 }, end: { month: 6, day: 10 } },
    wheat: { start: { month: 9, day: 15 }, end: { month: 10, day: 15 } },
    cotton: { start: { month: 5, day: 1 }, end: { month: 5, day: 25 } },
  },
  MN: {
    corn: { start: { month: 4, day: 25 }, end: { month: 5, day: 15 } },
    soybeans: { start: { month: 5, day: 5 }, end: { month: 6, day: 5 } },
    wheat: { start: { month: 9, day: 10 }, end: { month: 10, day: 10 } },
    cotton: { start: { month: 5, day: 5 }, end: { month: 5, day: 25 } },
  },
  MO: {
    corn: { start: { month: 4, day: 10 }, end: { month: 5, day: 15 } },
    soybeans: { start: { month: 5, day: 1 }, end: { month: 6, day: 15 } },
    wheat: { start: { month: 9, day: 25 }, end: { month: 10, day: 25 } },
    cotton: { start: { month: 4, day: 25 }, end: { month: 5, day: 25 } },
  },
  MS: {
    corn: { start: { month: 3, day: 15 }, end: { month: 4, day: 30 } },
    soybeans: { start: { month: 4, day: 25 }, end: { month: 6, day: 15 } },
    wheat: { start: { month: 10, day: 15 }, end: { month: 11, day: 20 } },
    cotton: { start: { month: 4, day: 15 }, end: { month: 5, day: 20 } },
  },
  MT: {
    corn: { start: { month: 5, day: 5 }, end: { month: 5, day: 25 } },
    soybeans: { start: { month: 5, day: 15 }, end: { month: 6, day: 5 } },
    wheat: { start: { month: 9, day: 1 }, end: { month: 9, day: 30 } },
    cotton: { start: { month: 5, day: 5 }, end: { month: 5, day: 25 } },
  },
  NC: {
    corn: { start: { month: 3, day: 25 }, end: { month: 5, day: 10 } },
    soybeans: { start: { month: 5, day: 5 }, end: { month: 6, day: 20 } },
    wheat: { start: { month: 10, day: 15 }, end: { month: 11, day: 20 } },
    cotton: { start: { month: 4, day: 20 }, end: { month: 5, day: 25 } },
  },
  ND: {
    corn: { start: { month: 5, day: 1 }, end: { month: 5, day: 20 } },
    soybeans: { start: { month: 5, day: 10 }, end: { month: 5, day: 31 } },
    wheat: { start: { month: 4, day: 20 }, end: { month: 5, day: 25 } },
    cotton: { start: { month: 5, day: 10 }, end: { month: 5, day: 25 } },
  },
  NE: {
    corn: { start: { month: 4, day: 20 }, end: { month: 5, day: 15 } },
    soybeans: { start: { month: 5, day: 5 }, end: { month: 6, day: 10 } },
    wheat: { start: { month: 9, day: 15 }, end: { month: 10, day: 15 } },
    cotton: { start: { month: 5, day: 1 }, end: { month: 5, day: 25 } },
  },
  NY: {
    corn: { start: { month: 5, day: 1 }, end: { month: 5, day: 25 } },
    soybeans: { start: { month: 5, day: 15 }, end: { month: 6, day: 10 } },
    wheat: { start: { month: 9, day: 15 }, end: { month: 10, day: 15 } },
    cotton: { start: { month: 5, day: 1 }, end: { month: 5, day: 20 } },
  },
  OH: {
    corn: { start: { month: 4, day: 20 }, end: { month: 5, day: 15 } },
    soybeans: { start: { month: 5, day: 5 }, end: { month: 6, day: 15 } },
    wheat: { start: { month: 9, day: 25 }, end: { month: 10, day: 20 } },
    cotton: { start: { month: 4, day: 25 }, end: { month: 5, day: 25 } },
  },
  OK: {
    corn: { start: { month: 4, day: 1 }, end: { month: 5, day: 10 } },
    soybeans: { start: { month: 5, day: 15 }, end: { month: 6, day: 20 } },
    wheat: { start: { month: 9, day: 20 }, end: { month: 10, day: 25 } },
    cotton: { start: { month: 4, day: 25 }, end: { month: 5, day: 25 } },
  },
  PA: {
    corn: { start: { month: 4, day: 25 }, end: { month: 5, day: 25 } },
    soybeans: { start: { month: 5, day: 10 }, end: { month: 6, day: 15 } },
    wheat: { start: { month: 9, day: 20 }, end: { month: 10, day: 20 } },
    cotton: { start: { month: 4, day: 25 }, end: { month: 5, day: 20 } },
  },
  SC: {
    corn: { start: { month: 3, day: 25 }, end: { month: 5, day: 10 } },
    soybeans: { start: { month: 5, day: 1 }, end: { month: 6, day: 20 } },
    wheat: { start: { month: 10, day: 15 }, end: { month: 11, day: 25 } },
    cotton: { start: { month: 4, day: 20 }, end: { month: 5, day: 25 } },
  },
  SD: {
    corn: { start: { month: 4, day: 25 }, end: { month: 5, day: 15 } },
    soybeans: { start: { month: 5, day: 5 }, end: { month: 6, day: 5 } },
    wheat: { start: { month: 9, day: 10 }, end: { month: 10, day: 10 } },
    cotton: { start: { month: 5, day: 5 }, end: { month: 5, day: 25 } },
  },
  TN: {
    corn: { start: { month: 4, day: 1 }, end: { month: 5, day: 15 } },
    soybeans: { start: { month: 5, day: 1 }, end: { month: 6, day: 20 } },
    wheat: { start: { month: 10, day: 1 }, end: { month: 10, day: 30 } },
    cotton: { start: { month: 4, day: 25 }, end: { month: 5, day: 25 } },
  },
  TX: {
    corn: { start: { month: 2, day: 25 }, end: { month: 4, day: 15 } },
    soybeans: { start: { month: 4, day: 15 }, end: { month: 6, day: 20 } },
    wheat: { start: { month: 10, day: 1 }, end: { month: 11, day: 20 } },
    cotton: { start: { month: 4, day: 1 }, end: { month: 5, day: 15 } },
  },
  VA: {
    corn: { start: { month: 4, day: 5 }, end: { month: 5, day: 15 } },
    soybeans: { start: { month: 5, day: 10 }, end: { month: 6, day: 20 } },
    wheat: { start: { month: 10, day: 1 }, end: { month: 10, day: 30 } },
    cotton: { start: { month: 4, day: 25 }, end: { month: 5, day: 25 } },
  },
  WA: {
    corn: { start: { month: 4, day: 25 }, end: { month: 5, day: 25 } },
    soybeans: { start: { month: 5, day: 10 }, end: { month: 6, day: 5 } },
    wheat: { start: { month: 9, day: 15 }, end: { month: 10, day: 30 } },
    cotton: { start: { month: 5, day: 1 }, end: { month: 5, day: 20 } },
  },
  WI: {
    corn: { start: { month: 4, day: 25 }, end: { month: 5, day: 15 } },
    soybeans: { start: { month: 5, day: 5 }, end: { month: 6, day: 10 } },
    wheat: { start: { month: 9, day: 15 }, end: { month: 10, day: 15 } },
    cotton: { start: { month: 5, day: 5 }, end: { month: 5, day: 25 } },
  },
};

/** Default planting midpoint for states not in PLANTING_DATES */
const DEFAULT_PLANTING: Record<CropType, DateRange> = {
  corn: { start: { month: 4, day: 15 }, end: { month: 5, day: 15 } },
  soybeans: { start: { month: 5, day: 1 }, end: { month: 6, day: 10 } },
  wheat: { start: { month: 10, day: 1 }, end: { month: 10, day: 25 } },
  cotton: { start: { month: 4, day: 25 }, end: { month: 5, day: 20 } },
};

/**
 * Get planting date range for a state and crop.
 * Falls back to default range if state not in database.
 */
export function getPlantingDateRange(state: string, crop: CropType): DateRange {
  const stateData = PLANTING_DATES[state.toUpperCase()];
  return stateData?.[crop] ?? DEFAULT_PLANTING[crop];
}

/**
 * Compute midpoint date of a planting window for a given year.
 */
export function getPlantingMidpoint(
  state: string,
  crop: CropType,
  year: number
): Date {
  const range = getPlantingDateRange(state, crop);
  const startDate = new Date(year, range.start.month - 1, range.start.day);
  const endDate = new Date(year, range.end.month - 1, range.end.day);
  const midTime = (startDate.getTime() + endDate.getTime()) / 2;
  return new Date(midTime);
}
