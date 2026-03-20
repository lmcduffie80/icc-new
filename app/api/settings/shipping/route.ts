import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import {
  rateLimiters,
  checkRateLimit,
  createRateLimitResponse,
  getClientIp,
} from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

interface ShippingMethod {
  id: string;
  name: string;
  price: number;
  days: string;
}

// New format: array of shipping methods
type ShippingSettings = ShippingMethod[];

// Old format for backward compatibility
interface LegacyShippingSettings {
  standard?: { name: string; price: number; days: string };
  express?: { name: string; price: number; days: string };
  [key: string]: { name: string; price: number; days: string } | undefined;
}

interface DeliveryOption {
  id: string;
  name: string;
  price: number;
  estimatedDays: string;
}

// Default shipping settings if not configured in database
const DEFAULT_SHIPPING: ShippingSettings = [
  { id: 'standard', name: 'Standard Shipping', price: 9.99, days: '5-7' },
  { id: 'express', name: 'Express Shipping', price: 19.99, days: '2-3' },
];

/**
 * Normalize shipping settings from old format (object) to new format (array)
 */
function normalizeShippingSettings(raw: unknown): ShippingSettings {
  if (!raw) return DEFAULT_SHIPPING;

  // If already an array, return as-is
  if (Array.isArray(raw)) return raw as ShippingSettings;

  // Convert old object format to array
  const obj = raw as LegacyShippingSettings;
  const methods: ShippingSettings = [];

  for (const [id, method] of Object.entries(obj)) {
    if (method && typeof method === 'object' && 'name' in method) {
      methods.push({
        id,
        name: method.name || id,
        price: method.price || 0,
        days: method.days || '',
      });
    }
  }

  return methods.length > 0 ? methods : DEFAULT_SHIPPING;
}

/**
 * Transform days string to user-friendly format
 * "5-7" -> "5-7 business days"
 * "1" -> "1 business day"
 */
function formatDays(days: string): string {
  if (days === '1') {
    return '1 business day';
  }
  return `${days} business days`;
}

// GET /api/settings/shipping - Get shipping options (public)
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  try {
    // Rate limiting - relaxed (60 req/min) since this is frequently called
    const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, '/api/settings/shipping', 'GET');
      return createRateLimitResponse(rateLimitResult.reset);
    }

    // Fetch shipping, truckload, and invoice settings from database
    const rows = await query<{ key: string; value: unknown }>(
      `SELECT key, value FROM site_settings WHERE key IN ('shipping', 'truckload', 'invoice')`
    );

    const settingsMap = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    // Normalize settings (handles both old object format and new array format)
    const settings = normalizeShippingSettings(settingsMap['shipping']);

    // Transform to delivery options format for checkout
    const options: DeliveryOption[] = settings.map((method) => ({
      id: method.id,
      name: method.name,
      price: method.price,
      estimatedDays: formatDays(method.days),
    }));

    return NextResponse.json({
      options,
      truckload: settingsMap['truckload'] ?? null,
      invoice: settingsMap['invoice'] ?? { required: true },
    });
  } catch (error) {
    console.error('Error fetching shipping settings:', error);

    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip,
      path: '/api/settings/shipping',
      method: 'GET',
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
      severity: 'low',
    });

    // Return defaults on error so checkout still works
    const options: DeliveryOption[] = DEFAULT_SHIPPING.map((method) => ({
      id: method.id,
      name: method.name,
      price: method.price,
      estimatedDays: formatDays(method.days),
    }));

    return NextResponse.json({ options, truckload: null, invoice: { required: true } });
  }
}
