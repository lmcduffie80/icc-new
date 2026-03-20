import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { securityLogger } from '@/lib/security-logger';
import { getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';

// GET /api/admin/acre-pack — list all programs with pass counts
export async function GET(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const ip = getClientIp(request);
  const session = authResult.session!;
  if (!session.permissions.includes('acrepack.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const programs = await query<{
      id: number;
      crop: string;
      name: string;
      description: string | null;
      image_url: string | null;
      is_active: boolean;
      sort_order: number;
      pass_count: string;
    }>(
      `SELECT
         p.id, p.crop, p.name, p.description, p.image_url, p.is_active, p.sort_order,
         COUNT(ap.id)::text AS pass_count
       FROM acre_pack_programs p
       LEFT JOIN acre_pack_passes ap ON ap.program_id = p.id
       GROUP BY p.id
       ORDER BY p.sort_order`
    );

    return NextResponse.json({ programs });
  } catch (error) {
    securityLogger.logError('Admin AcrePack GET failed', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const updateProgramSchema = z.object({
  id: z.number(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

// PATCH /api/admin/acre-pack — update a program's metadata
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

  const parsed = updateProgramSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  const { id, name, description, is_active, sort_order } = parsed.data;

  try {
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
    if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); values.push(is_active); }
    if (sort_order !== undefined) { updates.push(`sort_order = $${idx++}`); values.push(sort_order); }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const updated = await queryOne<{ id: number; name: string; is_active: boolean }>(
      `UPDATE acre_pack_programs SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, name, is_active`,
      values
    );

    if (!updated) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    securityLogger.logAdminAction(
      session.admin_user_id,
      session.admin_email,
      'acre_pack_program_updated',
      String(id),
      ip
    );

    return NextResponse.json({ success: true, program: updated });
  } catch (error) {
    securityLogger.logError('Admin AcrePack PATCH failed', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
