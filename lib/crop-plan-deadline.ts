/**
 * Crop plan purchase deadline logic.
 * Computes when a farmer should order inputs to hit application targets
 * based on location (zip → state) and crop plan pass timing.
 */

import { zipToState } from '@/lib/zip-to-state';
import {
  getPlantingMidpoint,
  type CropType,
} from '@/lib/planting-dates';

export interface PassTarget {
  pass: string;
  timingLabel: string | null;
  targetDate: string;
  daysFromPlanting: number;
}

export interface CropPlanDeadlineResult {
  orderByDate: string;
  earliestTargetDate: string;
  message: string;
  passTargets: PassTarget[];
  leadTimeDays: number;
  state: string | null;
  crop: CropType;
  planYear: number;
  urgency: 'asap' | 'soon' | 'normal' | 'ahead';
}

/** Default lead time: processing + shipping + buffer (days) */
const DEFAULT_LEAD_TIME_DAYS = 14;

/**
 * Map timing_label patterns to days from planting (negative = before, positive = after).
 * Uses the earliest (most conservative) date in the application window.
 */
function getDaysFromPlanting(
  timingLabel: string | null,
  crop: CropType
): number {
  const lower = (timingLabel ?? '').toLowerCase();

  // Pre-plant / burndown (before planting)
  if (
    lower.includes('before planting') ||
    lower.includes('pre-plant') ||
    lower.includes('burndown') ||
    (lower.includes('before crop emergence') && !lower.includes('post'))
  ) {
    return -14;
  }

  // At planting / pre-emerge at planting
  if (
    lower.includes('at planting') ||
    lower.includes('before crop emergence')
  ) {
    return 0;
  }

  // Fall planting (wheat) - use fixed fall date; caller handles
  if (lower.includes('fall')) {
    return -180; // Will be overridden for wheat fall
  }

  // Spring post-emerge (V2-V4, V2-V6, Feekes 4-6)
  if (
    lower.includes('v2') ||
    lower.includes('v4') ||
    lower.includes('post-emerge') ||
    lower.includes('after crop emergence') ||
    lower.includes('feekes 4')
  ) {
    return crop === 'wheat' ? 90 : 25; // Wheat spring ~Mar-Apr; row crops ~25 days
  }

  // Fungicide / mid-season
  if (
    lower.includes('vt') ||
    lower.includes('r1') ||
    lower.includes('r3') ||
    lower.includes('feekes 10') ||
    lower.includes('heading') ||
    lower.includes('head scab') ||
    lower.includes('boll development') ||
    lower.includes('mid-season')
  ) {
    return crop === 'wheat' ? 120 : 75;
  }

  // Adjuvant / with each application - use first pass
  if (lower.includes('adjuvant') || lower.includes('with each')) {
    return 0;
  }

  // Biological / as needed - use early season
  if (lower.includes('as needed') || lower.includes('biological')) {
    return 35;
  }

  // Default: assume first pass at planting
  return 0;
}

/**
 * For wheat fall planting: target date is in fall of prior calendar year
 * relative to plan_year (e.g. plan_year 2026 → fall 2025).
 */
function getWheatFallPlantingDate(planYear: number): Date {
  return new Date(planYear - 1, 9, 15); // Oct 15
}

/**
 * Compute target date for a pass given planting date and timing.
 */
function computeTargetDate(
  plantingDate: Date,
  daysFromPlanting: number,
  crop: CropType,
  timingLabel: string | null,
  planYear: number
): Date {
  const lower = (timingLabel ?? '').toLowerCase();

  // Wheat fall
  if (crop === 'wheat' && lower.includes('fall')) {
    return getWheatFallPlantingDate(planYear);
  }

  // Wheat spring (Feekes 4-6 = ~Mar 15, Feekes 10/heading = ~Apr 25)
  if (crop === 'wheat' && (lower.includes('spring') || lower.includes('feekes'))) {
    if (lower.includes('feekes 10') || lower.includes('heading') || lower.includes('head scab')) {
      return new Date(planYear, 3, 25); // Apr 25
    }
    return new Date(planYear, 2, 15); // Mar 15
  }

  const result = new Date(plantingDate);
  result.setDate(result.getDate() + daysFromPlanting);
  return result;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Compute when the farmer should order by to hit crop plan targets.
 *
 * @param zipCode - Farmer's ZIP (from farm_profiles or shipping address)
 * @param crop - Crop type (corn, soybeans, wheat, cotton)
 * @param passes - Array of { name, timing_label } from plan passes
 * @param planYear - Plan year (default: current year)
 * @param leadTimeDays - Order processing + shipping + buffer (default: 14)
 */
export function computeCropPlanDeadline(
  zipCode: string,
  crop: string,
  passes: Array<{ name: string; timing_label: string | null }>,
  planYear?: number,
  leadTimeDays: number = DEFAULT_LEAD_TIME_DAYS
): CropPlanDeadlineResult {
  const year = planYear ?? new Date().getFullYear();
  const cropNorm = crop.toLowerCase() as CropType;
  const validCrops: CropType[] = ['corn', 'soybeans', 'wheat', 'cotton'];
  const cropType = validCrops.includes(cropNorm) ? cropNorm : 'corn';

  const state = zipToState(zipCode);

  // Use default Midwest planting if state unknown
  const stateCode = state ?? 'IL';
  const plantingDate = getPlantingMidpoint(stateCode, cropType, year);

  const passTargets: PassTarget[] = [];
  let earliestTarget: Date | null = null;

  for (const pass of passes) {
    const daysFromPlanting = getDaysFromPlanting(pass.timing_label, cropType);
    const targetDate = computeTargetDate(
      plantingDate,
      daysFromPlanting,
      cropType,
      pass.timing_label,
      year
    );
    passTargets.push({
      pass: pass.name,
      timingLabel: pass.timing_label,
      targetDate: formatDate(targetDate),
      daysFromPlanting,
    });
    if (!earliestTarget || targetDate < earliestTarget) {
      earliestTarget = targetDate;
    }
  }

  const earliestTargetDate = earliestTarget ?? plantingDate;
  const orderByDate = new Date(earliestTargetDate);
  orderByDate.setDate(orderByDate.getDate() - leadTimeDays);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const orderByTrunc = new Date(orderByDate);
  orderByTrunc.setHours(0, 0, 0, 0);

  let urgency: CropPlanDeadlineResult['urgency'] = 'normal';
  if (orderByTrunc <= today) {
    urgency = 'asap';
  } else {
    const daysUntil = Math.ceil((orderByTrunc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 7) urgency = 'soon';
    else if (daysUntil >= 30) urgency = 'ahead';
  }

  const firstPassName = passTargets[0]?.pass ?? 'first application';
  let message: string;
  if (urgency === 'asap') {
    message = `Order ASAP — your first ${firstPassName} target (${formatDate(earliestTargetDate)}) is approaching.`;
  } else {
    message = `Order by ${formatDate(orderByDate)} to ensure delivery before your first ${firstPassName} (targeted ${formatDate(earliestTargetDate)}).`;
  }

  return {
    orderByDate: formatDate(orderByDate),
    earliestTargetDate: formatDate(earliestTargetDate),
    message,
    passTargets,
    leadTimeDays,
    state,
    crop: cropType,
    planYear: year,
    urgency,
  };
}
