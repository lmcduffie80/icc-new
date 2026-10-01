import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { query, queryOne } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { deleteAgroPolygon } from '@/lib/agromonitoring';
import { z } from 'zod';

interface FieldRow {
  id: string;
  user_id: string;
  polygon_name: string;
  agro_poly_id: string | null;
  geojson: object;
  crop_type: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// GET /api/farm/fields/[fieldId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fieldId: string }> }
) {
  const ip = getClientIp(request);
  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) return createRateLimitResponse(rateLimitResult.reset);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fieldId } = await params;

  try {
    const field = await queryOne<FieldRow>(
      `SELECT * FROM farm_field_polygons WHERE id = $1 AND user_id = $2`,
      [fieldId, session.user.id]
    );
    if (!field) return NextResponse.json({ error: 'Field not found' }, { status: 404 });
    return NextResponse.json({ field });
  } catch (error) {
    securityLogger.logError('Failed to fetch field', error, ip);
    return NextResponse.json({ error: 'Failed to fetch field' }, { status: 500 });
  }
}

// DELETE /api/farm/fields/[fieldId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ fieldId: string }> }
) {
  const ip = getClientIp(request);
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) return createRateLimitResponse(rateLimitResult.reset);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fieldId } = await params;

  try {
    const field = await queryOne<FieldRow>(
      `SELECT id, agro_poly_id FROM farm_field_polygons WHERE id = $1 AND user_id = $2`,
      [fieldId, session.user.id]
    );
    if (!field) return NextResponse.json({ error: 'Field not found' }, { status: 404 });

    // Remove from Agromonitoring if registered
    if (field.agro_poly_id) {
      try {
        await deleteAgroPolygon(field.agro_poly_id);
      } catch (err) {
        console.warn('[farm/fields/delete] Agromonitoring delete failed (non-fatal):', err);
      }
    }

    await query(`DELETE FROM farm_field_polygons WHERE id = $1`, [fieldId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    securityLogger.logError('Failed to delete field', error, ip);
    return NextResponse.json({ error: 'Failed to delete field' }, { status: 500 });
  }
}

const patchFieldSchema = z.object({
  crop_type: z.string().max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

// PATCH /api/farm/fields/[fieldId]
// Update crop_type or notes on an existing field (e.g., to confirm/override an AI suggestion).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ fieldId: string }> }
) {
  const ip = getClientIp(request);
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) return createRateLimitResponse(rateLimitResult.reset);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fieldId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = patchFieldSchema.safeParse(body);
  if (!parsed.success) {
    securityLogger.logValidationFailure(
      '/api/farm/fields/[fieldId]',
      ip,
      parsed.error.issues,
      'PATCH'
    );
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400 }
    );
  }

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  try {
    // Build SET clause dynamically for only the provided fields
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: (string | null)[] = [];
    let idx = 1;

    if ('crop_type' in updates) {
      setClauses.push(`crop_type = $${idx++}`);
      values.push(updates.crop_type ?? null);
    }
    if ('notes' in updates) {
      setClauses.push(`notes = $${idx++}`);
      values.push(updates.notes ?? null);
    }

    values.push(fieldId);
    values.push(session.user.id);

    const field = await queryOne<FieldRow>(
      `UPDATE farm_field_polygons
       SET ${setClauses.join(', ')}
       WHERE id = $${idx++} AND user_id = $${idx}
       RETURNING *`,
      values
    );

    if (!field) return NextResponse.json({ error: 'Field not found' }, { status: 404 });

    return NextResponse.json({ field });
  } catch (error) {
    securityLogger.logError('Failed to update field', error, ip);
    return NextResponse.json({ error: 'Failed to update field' }, { status: 500 });
  }
}
