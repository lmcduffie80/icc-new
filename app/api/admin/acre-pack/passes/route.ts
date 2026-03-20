import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { securityLogger } from '@/lib/security-logger';
import { getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';

// GET /api/admin/acre-pack/passes?programId=X
export async function GET(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const ip = getClientIp(request);
  const session = authResult.session!;
  if (!session.permissions.includes('acrepack.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const programId = request.nextUrl.searchParams.get('programId');

  if (!programId || isNaN(Number(programId))) {
    return NextResponse.json({ error: 'programId is required' }, { status: 400 });
  }

  try {
    const passes = await query<{
      id: number;
      name: string;
      timing_label: string | null;
      category: string;
      description: string | null;
      is_required: boolean;
      sort_order: number;
      product_count: string;
    }>(
      `SELECT
         ap.id, ap.name, ap.timing_label, ap.category, ap.description, ap.is_required, ap.sort_order,
         COUNT(app.id)::text AS product_count
       FROM acre_pack_passes ap
       LEFT JOIN acre_pack_pass_products app ON app.pass_id = ap.id
       WHERE ap.program_id = $1
       GROUP BY ap.id
       ORDER BY ap.sort_order`,
      [Number(programId)]
    );

    return NextResponse.json({ passes });
  } catch (error) {
    securityLogger.logError('Admin AcrePack passes GET failed', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const createPassSchema = z.object({
  program_id: z.number().int(),
  name: z.string().min(1).max(100),
  timing_label: z.string().max(100).nullable().optional(),
  category: z.string().min(1).max(50),
  description: z.string().max(500).nullable().optional(),
  is_required: z.boolean().optional().default(false),
  sort_order: z.number().int().optional().default(0),
});

// POST /api/admin/acre-pack/passes — create a new pass
export async function POST(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const ip = getClientIp(request);
  const session = authResult.session!;
  if (!session.permissions.includes('acrepack.manage_programs')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createPassSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  const { program_id, name, timing_label, category, description, is_required, sort_order } = parsed.data;

  try {
    const pass = await queryOne<{ id: number; name: string }>(
      `INSERT INTO acre_pack_passes (program_id, name, timing_label, category, description, is_required, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name`,
      [program_id, name, timing_label ?? null, category, description ?? null, is_required, sort_order]
    );

    securityLogger.logAdminAction(
      session.admin_user_id,
      session.admin_email,
      'acre_pack_pass_created',
      `program:${program_id}`,
      ip,
      { passId: pass?.id }
    );

    return NextResponse.json({ success: true, pass }, { status: 201 });
  } catch (error) {
    securityLogger.logError('Admin AcrePack pass POST failed', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const updatePassSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1).max(100).optional(),
  timing_label: z.string().max(100).nullable().optional(),
  category: z.string().min(1).max(50).optional(),
  description: z.string().max(500).nullable().optional(),
  is_required: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

// PATCH /api/admin/acre-pack/passes — update a pass
export async function PATCH(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const ip = getClientIp(request);
  const session = authResult.session!;
  if (!session.permissions.includes('acrepack.manage_programs')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = updatePassSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  const { id, name, timing_label, category, description, is_required, sort_order } = parsed.data;

  try {
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
    if (timing_label !== undefined) { updates.push(`timing_label = $${idx++}`); values.push(timing_label); }
    if (category !== undefined) { updates.push(`category = $${idx++}`); values.push(category); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
    if (is_required !== undefined) { updates.push(`is_required = $${idx++}`); values.push(is_required); }
    if (sort_order !== undefined) { updates.push(`sort_order = $${idx++}`); values.push(sort_order); }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const updated = await queryOne<{ id: number; name: string }>(
      `UPDATE acre_pack_passes SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, name`,
      values
    );

    if (!updated) {
      return NextResponse.json({ error: 'Pass not found' }, { status: 404 });
    }

    securityLogger.logAdminAction(
      session.admin_user_id,
      session.admin_email,
      'acre_pack_pass_updated',
      String(id),
      ip
    );

    return NextResponse.json({ success: true, pass: updated });
  } catch (error) {
    securityLogger.logError('Admin AcrePack pass PATCH failed', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/acre-pack/passes?id=X
export async function DELETE(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const ip = getClientIp(request);
  const session = authResult.session!;
  if (!session.permissions.includes('acrepack.manage_programs')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const id = request.nextUrl.searchParams.get('id');

  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    await queryOne(
      `DELETE FROM acre_pack_passes WHERE id = $1 RETURNING id`,
      [Number(id)]
    );

    securityLogger.logAdminAction(
      session.admin_user_id,
      session.admin_email,
      'acre_pack_pass_deleted',
      String(id),
      ip
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    securityLogger.logError('Admin AcrePack pass DELETE failed', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
