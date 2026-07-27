import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { getRequiredTenantId, MissingTenantError } from '@/lib/tenant';
import { z } from 'zod';

const createPlanSchema = z.object({
  plan_name: z.string().min(1).max(200),
  crop: z.enum(['corn', 'soybeans', 'wheat', 'cotton']),
  plan_year: z.number().int().min(2020).max(2100),
  total_acres: z.number().positive().max(1000000),
  target_weeds: z.array(z.string().max(100)).max(20).optional(),
  weed_pressure: z.enum(['light', 'moderate', 'heavy']).optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/crop', 'GET');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year');
  const crop = searchParams.get('crop');

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let sql = `
      SELECT
        p.id, p.plan_name, p.crop, p.plan_year, p.total_acres,
        p.target_weeds, p.weed_pressure, p.total_cost, p.cost_per_acre,
        p.status, p.ai_generated, p.notes, p.created_at, p.updated_at,
        COUNT(DISTINCT pp.id)::int AS pass_count
      FROM farmer_crop_plans p
      LEFT JOIN farmer_plan_passes pp ON pp.plan_id = p.id
      WHERE p.user_id = $1
    `;
    const params: (string | number)[] = [session.user.id];
    let paramIdx = 2;

    if (year) {
      sql += ` AND p.plan_year = $${paramIdx++}`;
      params.push(parseInt(year, 10));
    }
    if (crop) {
      sql += ` AND p.crop = $${paramIdx++}`;
      params.push(crop);
    }

    sql += ` GROUP BY p.id ORDER BY p.plan_year DESC, p.created_at DESC`;

    const plans = await query(sql, params);
    return NextResponse.json({ plans });
  } catch (error) {
    console.error('[GET /api/crop] Unhandled error:', error);
    securityLogger.logError('Failed to fetch farmer crop plans', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/crop', 'POST');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  const { plan_name, crop, plan_year, total_acres, target_weeds, weed_pressure, notes } = parsed.data;

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

    const result = await query<{ id: number }>(
      `INSERT INTO farmer_crop_plans
        (user_id, tenant_id, plan_name, crop, plan_year, total_acres, target_weeds, weed_pressure, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
       RETURNING id`,
      [
        session.user.id,
        tenantId,
        plan_name,
        crop,
        plan_year,
        total_acres,
        target_weeds ?? [],
        weed_pressure ?? null,
        notes ?? null,
      ]
    );

    return NextResponse.json({ plan: result[0] }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/crop] Unhandled error:', error);
    securityLogger.logError('Failed to create farmer crop plan', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
