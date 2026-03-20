import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { getFreightQuotesCached, isShipBossConfigured, FreightTooHeavyError } from '@/lib/freight-quote';
import type { FreightShipFromAddress, FreightShipItem } from '@/lib/freight-quote';
import { allocateItemsToWarehousesFIFO } from '@/lib/warehouse-allocation';
import { queryOne } from '@/lib/db';

const shippingQuoteSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().max(200).optional(),
        unitOfMeasure: z.string().max(50).nullable().optional(),
        quantity: z.number().int().positive().max(100000),
        productId: z.string().uuid().optional(),
      })
    )
    .min(1)
    .max(500),
  shipTo: z.object({
    street: z.string().min(1).max(200),
    city: z.string().min(1).max(100),
    state: z.string().length(2),
    zip: z.string().min(5).max(10),
    country: z.string().length(2).optional(),
  }),
});

interface WarehouseRow {
  id: string;
  address_street: string;
  address_city: string;
  address_state: string;
  address_zip: string;
}

async function resolveWarehouseAddress(
  items: z.infer<typeof shippingQuoteSchema>['items']
): Promise<FreightShipFromAddress | null> {
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
      console.warn('[shipping/quote] FIFO allocation failed, falling back to default warehouse:', err);
    }
  }

  let row: WarehouseRow | null = null;

  if (warehouseId) {
    row = await queryOne<WarehouseRow>(
      `SELECT id, address_street, address_city, address_state, address_zip
       FROM warehouses WHERE id = $1 AND is_active = true`,
      [warehouseId]
    );
  }

  if (!row) {
    row = await queryOne<WarehouseRow>(
      `SELECT id, address_street, address_city, address_state, address_zip
       FROM warehouses WHERE is_active = true ORDER BY created_at ASC LIMIT 1`
    );
  }

  if (!row) return null;

  return {
    street: row.address_street,
    city: row.address_city,
    state: row.address_state,
    zip: row.address_zip,
  };
}

// POST /api/shipping/quote
// Returns live ShipBoss shipping rates for a customer's cart during checkout
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/shipping/quote', 'POST');
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

  const parsed = shippingQuoteSchema.safeParse(body);
  if (!parsed.success) {
    securityLogger.logValidationFailure('/api/shipping/quote', ip, parsed.error.issues, 'POST');
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  if (!isShipBossConfigured()) {
    return NextResponse.json(
      { error: 'Shipping quotes are not available at this time.' },
      { status: 503 }
    );
  }

  try {
    const { items, shipTo } = parsed.data;

    const shipFrom = await resolveWarehouseAddress(items);
    if (!shipFrom) {
      return NextResponse.json(
        { error: 'Unable to determine ship-from location. Please contact support.' },
        { status: 422 }
      );
    }

    const freightItems: (FreightShipItem & { productId?: string })[] = items.map((item) => ({
      name: item.name,
      unitOfMeasure: item.unitOfMeasure,
      quantity: item.quantity,
      productId: item.productId,
    }));

    const rates = await getFreightQuotesCached(freightItems, shipTo, shipFrom);

    return NextResponse.json({ rates });
  } catch (error) {
    if (error instanceof FreightTooHeavyError) {
      return NextResponse.json(
        {
          error: error.message,
          code: 'FREIGHT_TOO_HEAVY',
          weightLbs: error.weightLbs,
        },
        { status: 422 }
      );
    }
    securityLogger.logError('Failed to fetch shipping quote', error, ip);
    return NextResponse.json({ error: 'Unable to fetch shipping rates. Please check your address and try again.' }, { status: 500 });
  }
}
