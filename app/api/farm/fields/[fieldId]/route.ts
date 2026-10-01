import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { query, queryOne } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { deleteAgroPolygon } from '@/lib/agromonitoring';

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
