import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { computeCropPlanDeadline } from '@/lib/crop-plan-deadline';

describe('computeCropPlanDeadline', () => {
  // Pin "today" well before the 2026 spring planting window so the
  // order-by-date logic always lands in the future. Without this the
  // "Order by" message branch silently flips to the "Order ASAP" branch
  // once real-world time crosses each test's order-by threshold, and the
  // suite breaks on a date-dependent schedule.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns orderByDate before earliestTargetDate', () => {
    const result = computeCropPlanDeadline(
      '31794',
      'corn',
      [
        { name: 'Pre-Emerge Herbicide', timing_label: 'Spring, before planting' },
        { name: 'Post-Emerge Herbicide', timing_label: 'V2–V4 growth stage' },
      ],
      2026
    );
    expect(result.orderByDate).toBeDefined();
    expect(result.earliestTargetDate).toBeDefined();
    expect(new Date(result.orderByDate).getTime()).toBeLessThan(
      new Date(result.earliestTargetDate).getTime()
    );
  });

  it('returns passTargets for each pass', () => {
    const result = computeCropPlanDeadline(
      '60001',
      'soybeans',
      [
        { name: 'Pre-Emerge', timing_label: 'At planting' },
        { name: 'Post-Emerge', timing_label: 'V2–V4' },
      ],
      2026
    );
    expect(result.passTargets).toHaveLength(2);
    expect(result.passTargets[0].pass).toBe('Pre-Emerge');
    expect(result.passTargets[0].targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('includes message with order-by date', () => {
    const result = computeCropPlanDeadline('50001', 'corn', [
      { name: 'Pre-Emerge', timing_label: 'At planting' },
    ], 2026);
    expect(result.message).toContain('Order by');
    expect(result.message).toContain(result.orderByDate);
  });

  it('respects custom leadTimeDays', () => {
    const result7 = computeCropPlanDeadline(
      '31794',
      'corn',
      [{ name: 'Pre-Emerge', timing_label: 'At planting' }],
      2026,
      7
    );
    const result14 = computeCropPlanDeadline(
      '31794',
      'corn',
      [{ name: 'Pre-Emerge', timing_label: 'At planting' }],
      2026,
      14
    );
    const orderBy7 = new Date(result7.orderByDate).getTime();
    const orderBy14 = new Date(result14.orderByDate).getTime();
    expect(orderBy7).toBeGreaterThan(orderBy14);
  });

  it('handles wheat fall planting', () => {
    const result = computeCropPlanDeadline(
      '66001',
      'wheat',
      [
        { name: 'Fall Pre-Emerge', timing_label: 'Fall, at planting' },
        { name: 'Spring Post-Emerge', timing_label: 'Spring, Feekes 4–6' },
      ],
      2026
    );
    expect(result.passTargets.length).toBeGreaterThan(0);
    expect(result.earliestTargetDate).toBeDefined();
  });

  it('returns result even when zip maps to unknown state', () => {
    const result = computeCropPlanDeadline(
      '00123',
      'corn',
      [{ name: 'Pre-Emerge', timing_label: 'At planting' }],
      2026
    );
    expect(result.state).toBeNull();
    expect(result.orderByDate).toBeDefined();
    expect(result.earliestTargetDate).toBeDefined();
  });

  it('handles empty passes using planting date', () => {
    const result = computeCropPlanDeadline('31794', 'corn', [], 2026);
    expect(result.passTargets).toHaveLength(0);
    expect(result.earliestTargetDate).toBeDefined();
    expect(result.orderByDate).toBeDefined();
  });
});
