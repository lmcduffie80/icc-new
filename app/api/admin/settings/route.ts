import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { z } from 'zod';

const VALID_KEYS = [
  'shipping',
  'tax',
  'payment',
  'categories',
  'units_of_measure',
  'store_info',
  'truckload',
] as const;

type SettingKey = (typeof VALID_KEYS)[number];

const PERMISSION_MAP: Record<SettingKey, string> = {
  shipping: 'settings.update_shipping',
  tax: 'settings.update_tax',
  payment: 'settings.update_payment',
  categories: 'settings.update_categories',
  units_of_measure: 'settings.update_units_of_measure',
  store_info: 'settings.update_store_info',
  truckload: 'settings.update_shipping',
};

const settingsUpdateSchema = z.object({
  key: z.enum(VALID_KEYS),
  value: z.unknown(),
});

/**
 * GET /api/admin/settings - Fetch all site settings
 * Requires: settings.view permission
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  const rateLimitResult = await checkRateLimit(request, rateLimiters.admin);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/admin/settings', 'GET');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  const auth = await requireAdmin('settings.view');
  if (auth.error) return auth.error;

  try {
    const rows = await query<{ key: string; value: unknown }>(
      'SELECT key, value FROM site_settings ORDER BY key'
    );
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return NextResponse.json(settings);
  } catch (error) {
    securityLogger.logError('Failed to fetch settings', error, ip);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

/**
 * POST /api/admin/settings - Update a site setting
 * Requires: permission specific to the setting key being updated
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  const rateLimitResult = await checkRateLimit(request, rateLimiters.admin);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/admin/settings', 'POST');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = settingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    securityLogger.logValidationFailure('/api/admin/settings', ip, parsed.error.issues, 'POST');
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  const { key, value } = parsed.data;
  const requiredPermission = PERMISSION_MAP[key];

  const auth = await requireAdmin(requiredPermission as Parameters<typeof requireAdmin>[0]);
  if (auth.error) return auth.error;

  try {
    await query(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    );

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: '/api/admin/settings',
      method: 'POST',
      details: { action: 'update_setting', key, adminId: auth.session.adminUser.id },
      severity: 'low',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    securityLogger.logError('Failed to update setting', error, ip);
    return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 });
  }
}
