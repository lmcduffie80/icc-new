import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import {
  rateLimiters,
  checkRateLimit,
  createRateLimitResponse,
  getClientIp,
} from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { zipCodeSchema } from '@/lib/validation';
import { z } from 'zod';
import { computeCropPlanDeadline } from '@/lib/crop-plan-deadline';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  planId: z.string().optional(),
  crop: z.string().optional(),
  zip: zipCodeSchema.optional(),
  year: z.coerce.number().int().min(2020).max(2030).optional(),
});

/**
 * GET /api/crop/deadline
 *
 * Returns order-by date for crop plan inputs based on location.
 *
 * Modes:
 * 1. planId=123 — Uses farmer's saved plan + farm profile zip (auth required)
 * 2. crop=corn&zip=31794 — Uses crop and zip from query (public, for acre-pack builder)
 *
 * Response: { orderByDate, earliestTargetDate, message, passTargets, urgency, ... }
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/crop/deadline', 'GET');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    planId: searchParams.get('planId') ?? undefined,
    crop: searchParams.get('crop') ?? undefined,
    zip: searchParams.get('zip') ?? undefined,
    year: searchParams.get('year') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { planId, crop, zip, year } = parsed.data;

  try {
    if (planId) {
      // Mode 1: planId — auth required, fetch plan + farm profile
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const planIdNum = parseInt(planId, 10);
      if (isNaN(planIdNum)) {
        return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
      }

      const planRows = await query<{
        id: number;
        crop: string;
        plan_year: number;
      }>(
        `SELECT id, crop, plan_year FROM farmer_crop_plans WHERE id = $1 AND user_id = $2`,
        [planIdNum, session.user.id]
      );
      if (planRows.length === 0) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }
      const plan = planRows[0];

      const passes = await query<{ name: string; timing_label: string | null }>(
        `SELECT name, timing_label FROM farmer_plan_passes WHERE plan_id = $1 ORDER BY sort_order`,
        [planIdNum]
      );

      // Get farm profile zip
      const farmRows = await query<{ zip_code: string }>(
        `SELECT zip_code FROM farm_profiles WHERE user_id = $1`,
        [session.user.id]
      );
      const zipCode = farmRows[0]?.zip_code ?? zip;
      if (!zipCode) {
        return NextResponse.json(
          {
            error: 'Location required',
            hint: 'Add your farm ZIP code in Account → Farm Profile to get order-by dates.',
          },
          { status: 400 }
        );
      }

      const result = computeCropPlanDeadline(
        zipCode,
        plan.crop,
        passes,
        plan.plan_year
      );
      return NextResponse.json(result);
    }

    // Mode 2: crop + zip — public, for acre-pack builder
    if (!crop || !zip) {
      return NextResponse.json(
        {
          error: 'Missing parameters',
          hint: 'Provide either planId (auth) or crop and zip (e.g. ?crop=corn&zip=31794)',
        },
        { status: 400 }
      );
    }

    // Fetch pass templates from acre_pack for the crop to get timing_labels
    const programRows = await query<{ id: number }>(
      `SELECT id FROM acre_pack_programs WHERE crop = $1 AND is_active = true LIMIT 1`,
      [crop.toLowerCase()]
    );
    if (programRows.length === 0) {
      return NextResponse.json(
        { error: 'Invalid crop. Must be: corn, soybeans, wheat, cotton' },
        { status: 400 }
      );
    }

    const passes = await query<{ name: string; timing_label: string | null }>(
      `SELECT name, timing_label FROM acre_pack_passes WHERE program_id = $1 ORDER BY sort_order`,
      [programRows[0].id]
    );

    const result = computeCropPlanDeadline(zip, crop, passes, year);
    return NextResponse.json(result);
  } catch (error) {
    securityLogger.logError('Crop plan deadline calculation failed', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
