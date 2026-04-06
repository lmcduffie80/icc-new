import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { z } from 'zod';
import { calculateCarbonScore } from '@/lib/carbon-scoring';

const productSchema = z.object({
  product_id: z.string(),
  product_name: z.string(),
  is_recommended: z.boolean().default(false),
  rate_per_acre: z.number().nonnegative(),
  rate_unit: z.string().max(30),
  unit_size: z.number().nonnegative(),
  unit_size_unit: z.string().max(30).nullable().optional(),
  lbs_per_gallon: z.number().positive().nullable().optional(),
  units_needed: z.number().nonnegative().optional(),
  unit_cost: z.number().nonnegative().optional(),
  line_total: z.number().nonnegative().optional(),
  cost_per_acre: z.number().nonnegative().optional(),
  sort_order: z.number().int().default(0),
});

const savePassesSchema = z.object({
  passes: z.array(
    z.object({
      name: z.string().max(100),
      category: z.string().max(50),
      timing_label: z.string().max(500).optional(),
      sort_order: z.number().int().default(0),
      pass_cost: z.number().nonnegative().optional(),
      products: z.array(productSchema),
    })
  ),
  total_cost: z.number().nonnegative().optional(),
  cost_per_acre: z.number().nonnegative().optional(),
  ai_generated: z.boolean().default(false),
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
    securityLogger.logRateLimitExceeded(ip, `/api/crop/${planId}/passes`, 'POST');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = savePassesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify plan belongs to this user; fetch crop/acres for carbon scoring
    const plans = await query<{ id: number; crop: string; total_acres: string }>(
      `SELECT id, crop, total_acres FROM farmer_crop_plans WHERE id = $1 AND user_id = $2`,
      [planIdNum, session.user.id]
    );
    if (plans.length === 0) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const { passes, total_cost, cost_per_acre, ai_generated } = parsed.data;

    // Delete existing passes (cascade deletes products)
    await query(`DELETE FROM farmer_plan_passes WHERE plan_id = $1`, [planIdNum]);

    // Insert new passes and products
    for (const pass of passes) {
      const passResult = await query<{ id: number }>(
        `INSERT INTO farmer_plan_passes (plan_id, name, category, timing_label, sort_order, pass_cost)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [planIdNum, pass.name, pass.category, pass.timing_label ?? null, pass.sort_order, pass.pass_cost ?? null]
      );
      const passId = passResult[0].id;

      for (const product of pass.products) {
        await query(
          `INSERT INTO farmer_plan_products
            (plan_pass_id, product_id, product_name, rate_per_acre, rate_unit,
             units_needed, unit_cost, line_total, cost_per_acre, is_recommended, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            passId,
            product.product_id,
            product.product_name,
            product.rate_per_acre,
            product.rate_unit,
            product.units_needed ?? null,
            product.unit_cost ?? null,
            product.line_total ?? null,
            product.cost_per_acre ?? null,
            product.is_recommended,
            product.sort_order,
          ]
        );
      }
    }

    // Compute carbon score from the saved passes
    const scoringPasses = passes.map((pass) => ({
      category: pass.category,
      products: pass.products.map((p) => ({
        product_name: p.product_name,
        rate_per_acre: p.rate_per_acre,
        rate_unit: p.rate_unit,
      })),
    }));
    const carbonScore = calculateCarbonScore(
      scoringPasses,
      plans[0].crop,
      parseFloat(plans[0].total_acres)
    );

    // Update plan totals, status, and carbon score
    await query(
      `UPDATE farmer_crop_plans
       SET total_cost = $1, cost_per_acre = $2, ai_generated = $3, status = 'saved',
           carbon_score = $4, updated_at = NOW()
       WHERE id = $5`,
      [total_cost ?? null, cost_per_acre ?? null, ai_generated, JSON.stringify(carbonScore), planIdNum]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PUT /api/crop/planId/passes] Unhandled error:', error);
    securityLogger.logError('Failed to save plan passes', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
