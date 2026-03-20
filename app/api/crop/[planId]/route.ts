import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { z } from 'zod';

const updatePlanSchema = z.object({
  plan_name: z.string().min(1).max(200).optional(),
  total_acres: z.number().positive().max(1000000).optional(),
  target_weeds: z.array(z.string().max(100)).max(20).optional(),
  weed_pressure: z.enum(['light', 'moderate', 'heavy']).optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(['draft', 'saved', 'archived']).optional(),
  total_cost: z.number().nonnegative().optional(),
  cost_per_acre: z.number().nonnegative().optional(),
});

async function getPlanForUser(planId: number, userId: string) {
  const rows = await query<{ id: number }>(
    `SELECT id FROM farmer_crop_plans WHERE id = $1 AND user_id = $2`,
    [planId, userId]
  );
  return rows[0] ?? null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const ip = getClientIp(request);
  const { planId } = await params;
  const planIdNum = parseInt(planId, 10);
  if (isNaN(planIdNum)) {
    return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
  }

  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, `/api/crop/${planId}`, 'GET');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const plans = await query<{
      id: number;
      plan_name: string;
      crop: string;
      plan_year: number;
      total_acres: string;
      target_weeds: string[];
      weed_pressure: string | null;
      total_cost: string | null;
      cost_per_acre: string | null;
      status: string;
      ai_generated: boolean;
      notes: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM farmer_crop_plans WHERE id = $1 AND user_id = $2`,
      [planIdNum, session.user.id]
    );

    if (plans.length === 0) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const plan = plans[0];

    // Fetch passes with products
    const passes = await query<{
      id: number;
      name: string;
      category: string;
      timing_label: string | null;
      sort_order: number;
      pass_cost: string | null;
    }>(
      `SELECT * FROM farmer_plan_passes WHERE plan_id = $1 ORDER BY sort_order`,
      [planIdNum]
    );

    const passesWithProducts = await Promise.all(
      passes.map(async (pass) => {
        const products = await query(
          `SELECT fpp.*,
                  p.name as current_product_name, p.price as current_price,
                  p.unit_of_measure, p.image, p.in_stock, p.approved_states,
                  p.truckload_eligible,
                  p.gallons_per_case, p.cases_per_pallet, p.bulk_density_lbs_per_gallon,
                  p.label_url, p.admin_label_url, p.restricted_use
           FROM farmer_plan_products fpp
           LEFT JOIN products p ON p.id = fpp.product_id
           WHERE fpp.plan_pass_id = $1
           ORDER BY fpp.sort_order`,
          [pass.id]
        );
        return { ...pass, products };
      })
    );

    return NextResponse.json({ plan: { ...plan, passes: passesWithProducts } });
  } catch (error) {
    console.error('[GET /api/crop/planId] Unhandled error:', error);
    securityLogger.logError('Failed to fetch farmer crop plan', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
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
    securityLogger.logRateLimitExceeded(ip, `/api/crop/${planId}`, 'PATCH');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = updatePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existing = await getPlanForUser(planIdNum, session.user.id);
    if (!existing) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const updates = parsed.data;
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.plan_name !== undefined) { setClauses.push(`plan_name = $${idx++}`); values.push(updates.plan_name); }
    if (updates.total_acres !== undefined) { setClauses.push(`total_acres = $${idx++}`); values.push(updates.total_acres); }
    if (updates.target_weeds !== undefined) { setClauses.push(`target_weeds = $${idx++}`); values.push(updates.target_weeds); }
    if (updates.weed_pressure !== undefined) { setClauses.push(`weed_pressure = $${idx++}`); values.push(updates.weed_pressure); }
    if (updates.notes !== undefined) { setClauses.push(`notes = $${idx++}`); values.push(updates.notes); }
    if (updates.status !== undefined) { setClauses.push(`status = $${idx++}`); values.push(updates.status); }
    if (updates.total_cost !== undefined) { setClauses.push(`total_cost = $${idx++}`); values.push(updates.total_cost); }
    if (updates.cost_per_acre !== undefined) { setClauses.push(`cost_per_acre = $${idx++}`); values.push(updates.cost_per_acre); }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(planIdNum, session.user.id);

    await query(
      `UPDATE farmer_crop_plans SET ${setClauses.join(', ')} WHERE id = $${idx++} AND user_id = $${idx}`,
      values
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PATCH /api/crop/planId] Unhandled error:', error);
    securityLogger.logError('Failed to update farmer crop plan', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
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
    securityLogger.logRateLimitExceeded(ip, `/api/crop/${planId}`, 'DELETE');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existing = await getPlanForUser(planIdNum, session.user.id);
    if (!existing) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    await query(`DELETE FROM farmer_crop_plans WHERE id = $1 AND user_id = $2`, [planIdNum, session.user.id]);
    revalidatePath('/admin/forecasts');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/crop/planId] Unhandled error:', error);
    securityLogger.logError('Failed to delete farmer crop plan', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
