import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { getRequiredTenantId, MissingTenantError } from '@/lib/tenant';
import { z } from 'zod';

const cloneSchema = z.object({
  plan_year: z.number().int().min(2020).max(2100),
  plan_name: z.string().min(1).max(200).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const ip = getClientIp(request);
  const { planId } = await params;
  const planIdNum = parseInt(planId, 10);
  if (isNaN(planIdNum)) {
    return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
  }

  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, `/api/crop/${planId}/clone`, 'POST');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = cloneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  const { plan_year, plan_name } = parsed.data;

  let tenantId: string;
  try {
    tenantId = getRequiredTenantId(request);
  } catch (err) {
    if (err instanceof MissingTenantError) {
      return NextResponse.json({ error: 'Missing tenant context' }, { status: 400 });
    }
    throw err;
  }

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch original plan
    const plans = await query<{
      id: number;
      plan_name: string;
      crop: string;
      total_acres: string;
      target_weeds: string[];
      weed_pressure: string | null;
      notes: string | null;
    }>(
      `SELECT id, plan_name, crop, total_acres, target_weeds, weed_pressure, notes
       FROM farmer_crop_plans WHERE id = $1 AND user_id = $2`,
      [planIdNum, session.user.id]
    );

    if (plans.length === 0) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const original = plans[0];
    const newName = plan_name ?? `${original.plan_name} (${plan_year})`;

    // Create new plan as draft
    const newPlanResult = await query<{ id: number }>(
      `INSERT INTO farmer_crop_plans
        (user_id, tenant_id, plan_name, crop, plan_year, total_acres, target_weeds, weed_pressure, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
       RETURNING id`,
      [
        session.user.id,
        tenantId,
        newName,
        original.crop,
        plan_year,
        original.total_acres,
        original.target_weeds ?? [],
        original.weed_pressure ?? null,
        original.notes ?? null,
      ]
    );

    const newPlanId = newPlanResult[0].id;

    // Clone passes
    const passes = await query<{
      id: number;
      name: string;
      category: string;
      timing_label: string | null;
      sort_order: number;
    }>(
      `SELECT id, name, category, timing_label, sort_order FROM farmer_plan_passes WHERE plan_id = $1 ORDER BY sort_order`,
      [planIdNum]
    );

    for (const pass of passes) {
      const newPassResult = await query<{ id: number }>(
        `INSERT INTO farmer_plan_passes (plan_id, name, category, timing_label, sort_order)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [newPlanId, pass.name, pass.category, pass.timing_label, pass.sort_order]
      );
      const newPassId = newPassResult[0].id;

      // Clone products (without historical costs — farmer will recalculate)
      const products = await query<{
        product_id: string;
        product_name: string;
        rate_per_acre: string;
        rate_unit: string;
        is_recommended: boolean;
        sort_order: number;
      }>(
        `SELECT product_id, product_name, rate_per_acre, rate_unit, is_recommended, sort_order
         FROM farmer_plan_products WHERE plan_pass_id = $1 ORDER BY sort_order`,
        [pass.id]
      );

      for (const product of products) {
        await query(
          `INSERT INTO farmer_plan_products
            (plan_pass_id, product_id, product_name, rate_per_acre, rate_unit, is_recommended, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            newPassId,
            product.product_id,
            product.product_name,
            product.rate_per_acre,
            product.rate_unit,
            product.is_recommended,
            product.sort_order,
          ]
        );
      }
    }

    return NextResponse.json({ plan: { id: newPlanId } }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/crop/planId/clone] Unhandled error:', error);
    securityLogger.logError('Failed to clone farmer crop plan', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
