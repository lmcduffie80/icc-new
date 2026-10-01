import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { query, queryOne, getTenantIdForUser } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { z } from 'zod';
import { createAgroPolygon, isAgromonitoringConfigured } from '@/lib/agromonitoring';

const createFieldSchema = z.object({
  polygon_name: z.string().min(1).max(100).trim(),
  coordinates: z
    .array(z.tuple([z.number(), z.number()]))
    .min(3, 'A polygon needs at least 3 points'),
  crop_type: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

interface FieldRow {
  id: string;
  user_id: string;
  tenant_id: string;
  polygon_name: string;
  agro_poly_id: string | null;
  geojson: object;
  crop_type: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// GET /api/farm/fields — list all fields for the authenticated user
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/farm/fields', 'GET');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const fields = await query<FieldRow>(
      `SELECT id, user_id, tenant_id, polygon_name, agro_poly_id, geojson,
              crop_type, notes, created_at, updated_at
       FROM farm_field_polygons
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [session.user.id]
    );
    return NextResponse.json({ fields });
  } catch (error) {
    securityLogger.logError('Failed to fetch farm fields', error, ip);
    return NextResponse.json({ error: 'Failed to fetch fields' }, { status: 500 });
  }
}

// POST /api/farm/fields — create a new field polygon
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/farm/fields', 'POST');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createFieldSchema.safeParse(body);
  if (!parsed.success) {
    securityLogger.logValidationFailure('/api/farm/fields', ip, parsed.error.issues, 'POST');
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  const { polygon_name, coordinates, crop_type, notes } = parsed.data;

  // Ensure the ring is closed (first coord === last coord) so that Sentinel Hub
  // and other geospatial APIs receive a valid GeoJSON Polygon.
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const closedRing =
    first[0] === last[0] && first[1] === last[1]
      ? coordinates
      : ([...coordinates, first] as [number, number][]);

  const geojson = {
    type: 'Polygon',
    coordinates: [closedRing],
  };

  try {
    const tenantId = await getTenantIdForUser(session.user.id);

    // Register with Agromonitoring if configured
    let agroPolyId: string | null = null;
    if (isAgromonitoringConfigured()) {
      try {
        const agroPolygon = await createAgroPolygon(polygon_name, coordinates);
        agroPolyId = agroPolygon.id;
      } catch (agroErr) {
        // Non-fatal — store locally even if Agromonitoring registration fails
        console.warn('[farm/fields] Agromonitoring polygon registration failed:', agroErr);
      }
    }

    const field = await queryOne<FieldRow>(
      `INSERT INTO farm_field_polygons
         (user_id, tenant_id, polygon_name, agro_poly_id, geojson, crop_type, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [session.user.id, tenantId, polygon_name, agroPolyId, JSON.stringify(geojson), crop_type ?? null, notes ?? null]
    );

    return NextResponse.json({ field }, { status: 201 });
  } catch (error) {
    securityLogger.logError('Failed to create farm field', error, ip);
    return NextResponse.json({ error: 'Failed to create field' }, { status: 500 });
  }
}
