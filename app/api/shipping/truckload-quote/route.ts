import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { allocateItemsToWarehousesFIFO } from '@/lib/warehouse-allocation';
import { queryOne } from '@/lib/db';

const truckloadQuoteSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().max(200).optional(),
      unitOfMeasure: z.string().max(50).nullable().optional(),
      quantity: z.number().int().positive().max(100000),
      productId: z.string().uuid().optional(),
      pricePerUnit: z.number().nonnegative().optional(),
    })
  ).min(1).max(500),
  shipTo: z.object({
    street: z.string().min(1).max(200),
    city: z.string().min(1).max(100),
    state: z.string().length(2),
    zip: z.string().min(5).max(10),
    country: z.string().length(2).optional(),
  }),
});

interface TruckloadRate {
  id: string;
  label: string;
  rate_per_mile: number;
}

interface TruckloadSettings {
  enabled: boolean;
  min_totes: number;
  gallons_per_tote: number;
  rates: TruckloadRate[];
}

interface WarehouseRow {
  id: string;
  address_street: string;
  address_city: string;
  address_state: string;
  address_zip: string;
}

interface SiteSettingRow {
  value: TruckloadSettings;
}

const DEFAULT_TRUCKLOAD_SETTINGS: TruckloadSettings = {
  enabled: false,
  min_totes: 15,
  gallons_per_tote: 265,
  rates: [
    { id: 'rate-350', label: '$3.50/mile', rate_per_mile: 3.50 },
    { id: 'rate-400', label: '$4.00/mile', rate_per_mile: 4.00 },
    { id: 'rate-500', label: '$5.00/mile', rate_per_mile: 5.00 },
  ],
};

async function getTruckloadSettings(): Promise<TruckloadSettings> {
  const row = await queryOne<SiteSettingRow>(
    `SELECT value FROM site_settings WHERE key = 'truckload'`
  );
  if (!row) return DEFAULT_TRUCKLOAD_SETTINGS;
  return { ...DEFAULT_TRUCKLOAD_SETTINGS, ...row.value };
}

async function resolveWarehouseAddress(
  items: z.infer<typeof truckloadQuoteSchema>['items']
): Promise<WarehouseRow | null> {
  const orderItems = items
    .filter((i) => !!i.productId)
    .map((i) => ({ product_id: i.productId!, quantity: i.quantity, name: i.name ?? '' }));

  let warehouseId: string | undefined;

  if (orderItems.length > 0) {
    try {
      const { allocations } = await allocateItemsToWarehousesFIFO(orderItems);
      if (allocations.length > 0) {
        warehouseId = allocations[0].warehouse_id;
      }
    } catch (err) {
      console.warn('[TruckloadQuote] FIFO allocation failed, falling back to default warehouse:', err);
    }
  }

  if (warehouseId) {
    const row = await queryOne<WarehouseRow>(
      `SELECT id, address_street, address_city, address_state, address_zip
       FROM warehouses WHERE id = $1 AND is_active = true`,
      [warehouseId]
    );
    if (row) return row;
  }

  return queryOne<WarehouseRow>(
    `SELECT id, address_street, address_city, address_state, address_zip
     FROM warehouses WHERE is_active = true ORDER BY created_at ASC LIMIT 1`
  );
}

/**
 * Call Google Maps Distance Matrix API to get driving distance in miles.
 * Returns null if the API key is not configured or the call fails.
 */
async function getDrivingDistanceMiles(
  originAddress: string,
  destinationAddress: string
): Promise<number | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn('[TruckloadQuote] GOOGLE_MAPS_API_KEY not configured, cannot calculate distance');
    return null;
  }

  const params = new URLSearchParams({
    origins: originAddress,
    destinations: destinationAddress,
    units: 'imperial',
    key: apiKey,
  });

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('[TruckloadQuote] Google Maps API HTTP error:', res.status);
      return null;
    }

    const data = await res.json() as {
      status: string;
      rows?: Array<{
        elements?: Array<{
          status: string;
          distance?: { value: number };
        }>;
      }>;
    };

    if (data.status !== 'OK') {
      console.error('[TruckloadQuote] Google Maps API error status:', data.status);
      return null;
    }

    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK' || !element.distance) {
      console.error('[TruckloadQuote] No valid distance element in response');
      return null;
    }

    // distance.value is in meters; convert to miles
    const meters = element.distance.value;
    return Math.round((meters / 1609.344) * 10) / 10;
  } catch (err) {
    console.error('[TruckloadQuote] Failed to call Google Maps API:', err);
    return null;
  }
}

export interface TruckloadQuoteRate {
  id: string;
  label: string;
  rate_per_mile: number;
  distance_miles: number;
  freight_total: number;
  freight_per_gallon: number;
  product_price_per_gallon: number;
  landed_cost_per_gallon: number;
  total_gallons: number;
}

export interface TruckloadQuoteResponse {
  rates: TruckloadQuoteRate[];
  total_totes: number;
  total_gallons: number;
  product_price_per_gallon: number;
  distance_miles: number;
  warehouse_address: string;
  settings: Pick<TruckloadSettings, 'min_totes' | 'gallons_per_tote'>;
  distance_unavailable?: boolean;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/shipping/truckload-quote', 'POST');
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

  const parsed = truckloadQuoteSchema.safeParse(body);
  if (!parsed.success) {
    securityLogger.logValidationFailure('/api/shipping/truckload-quote', ip, parsed.error.issues, 'POST');
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  try {
    const { items, shipTo } = parsed.data;
    const settings = await getTruckloadSettings();

    // Count totes in the order
    const toteItems = items.filter((item) => {
      const uom = item.unitOfMeasure?.toLowerCase() ?? '';
      const name = item.name?.toLowerCase() ?? '';
      return uom.includes('tote') || uom.includes('tank') || name.includes('tote');
    });

    const totalTotes = toteItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalGallons = totalTotes * settings.gallons_per_tote;

    // Calculate weighted average product price per gallon across all tote items
    // pricePerUnit is the price per tote; divide by gallons_per_tote to get per-gallon price
    const totalToteValue = toteItems.reduce((sum, item) => {
      const pricePerTote = item.pricePerUnit ?? 0;
      return sum + pricePerTote * item.quantity;
    }, 0);
    const productPricePerGallon = totalGallons > 0
      ? Math.round((totalToteValue / totalGallons) * 10000) / 10000
      : 0;

    // Resolve warehouse address
    const warehouse = await resolveWarehouseAddress(items);
    const warehouseAddress = warehouse
      ? `${warehouse.address_street}, ${warehouse.address_city}, ${warehouse.address_state} ${warehouse.address_zip}`
      : '';

    const destinationAddress = `${shipTo.street}, ${shipTo.city}, ${shipTo.state} ${shipTo.zip}`;

    // Get driving distance
    const distanceMiles = warehouseAddress
      ? await getDrivingDistanceMiles(warehouseAddress, destinationAddress)
      : null;

    const distanceUnavailable = distanceMiles === null;

    // Use a placeholder distance of 0 if unavailable (rates will show $0 until distance is known)
    const effectiveDistance = distanceMiles ?? 0;

    const rates: TruckloadQuoteRate[] = settings.rates.map((rate) => {
      const freightTotal = Math.round(rate.rate_per_mile * effectiveDistance * 100) / 100;
      const freightPerGallon = totalGallons > 0
        ? Math.round((freightTotal / totalGallons) * 10000) / 10000
        : 0;
      const landedCostPerGallon = Math.round((productPricePerGallon + freightPerGallon) * 10000) / 10000;

      return {
        id: rate.id,
        label: rate.label,
        rate_per_mile: rate.rate_per_mile,
        distance_miles: effectiveDistance,
        freight_total: freightTotal,
        freight_per_gallon: freightPerGallon,
        product_price_per_gallon: productPricePerGallon,
        landed_cost_per_gallon: landedCostPerGallon,
        total_gallons: totalGallons,
      };
    });

    const response: TruckloadQuoteResponse = {
      rates,
      total_totes: totalTotes,
      total_gallons: totalGallons,
      product_price_per_gallon: productPricePerGallon,
      distance_miles: effectiveDistance,
      warehouse_address: warehouseAddress,
      settings: {
        min_totes: settings.min_totes,
        gallons_per_tote: settings.gallons_per_tote,
      },
      distance_unavailable: distanceUnavailable || undefined,
    };

    return NextResponse.json(response);
  } catch (error) {
    securityLogger.logError('Failed to fetch truckload quote', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
