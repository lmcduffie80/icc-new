import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { queryOne, query } from '@/lib/db';
import {
  rateLimiters,
  checkRateLimit,
  createRateLimitResponse,
  getClientIp,
} from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { classifyCropType } from '@/lib/crop-classifier';

interface FieldRow {
  id: string;
  user_id: string;
  polygon_name: string;
  agro_poly_id: string | null;
  geojson: { type: string; coordinates: unknown };
  crop_type: string | null;
}

/**
 * POST /api/farm/fields/[fieldId]/crop-classification
 *
 * Runs all three crop classification methods (NDVI time-series, satellite vision,
 * and Agromonitoring history) in parallel against the field's geometry.
 *
 * If the aggregated confidence is "high", the crop_type column in the database is
 * automatically updated. Lower-confidence results are returned for the user to confirm.
 *
 * Response:
 *   {
 *     report: CropClassificationReport,
 *     updatedCropType: string | null  // set when DB was auto-updated
 *   }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fieldId: string }> }
) {
  const ip = getClientIp(request);

  // Moderate limit — this triggers several external API calls + AI inference
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(
      ip,
      '/api/farm/fields/[fieldId]/crop-classification',
      'POST'
    );
    return createRateLimitResponse(rateLimitResult.reset);
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { fieldId } = await params;

  try {
    // Verify ownership and load field geometry
    const field = await queryOne<FieldRow>(
      `SELECT id, user_id, polygon_name, agro_poly_id, geojson, crop_type
       FROM farm_field_polygons
       WHERE id = $1 AND user_id = $2`,
      [fieldId, session.user.id]
    );

    if (!field) {
      return NextResponse.json({ error: 'Field not found' }, { status: 404 });
    }

    // Run all classification methods — individual failures are captured inside the report
    const report = await classifyCropType(field.geojson, field.agro_poly_id);

    // Auto-save to DB only when all available methods agree with high confidence
    let updatedCropType: string | null = null;
    if (report.suggested && report.confidence === 'high') {
      await query(
        `UPDATE farm_field_polygons
         SET crop_type = $1, updated_at = NOW()
         WHERE id = $2`,
        [report.suggested, fieldId]
      );
      updatedCropType = report.suggested;
    }

    return NextResponse.json({ report, updatedCropType });
  } catch (error) {
    securityLogger.logError('Failed to classify crop type', error, ip);
    return NextResponse.json(
      { error: 'Failed to classify crop type. Please try again.' },
      { status: 500 }
    );
  }
}
