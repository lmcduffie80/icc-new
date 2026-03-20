import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { query, queryOne } from '@/lib/db';
import { getFreightQuotes, isShipBossConfigured, FreightTooHeavyError } from '@/lib/freight-quote';
import type { FreightShipFromAddress, FreightShipItem } from '@/lib/freight-quote';

interface OrderRow {
  id: string;
  shipping_address: {
    line1: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
  };
  warehouse_id: string | null;
  metadata: Record<string, unknown> | string | null;
}

interface WarehouseAllocation {
  warehouse_id: string;
}

interface OrderItemRow {
  product_id: string;
  name: string;
  quantity: number;
  unit_of_measure: string | null;
  carton_length: string | null;
  carton_width: string | null;
  carton_height: string | null;
  carton_weight_lbs: string | null;
  net_content_weight_lbs: string | null;
  nmfc_number: string | null;
  freight_class: string | null;
}

interface WarehouseRow {
  address_street: string;
  address_city: string;
  address_state: string;
  address_zip: string;
}

// GET /api/admin/orders/[id]/shipping-rates
// Returns live ShipBoss shipping rates for an order
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const { id } = await params;

  try {
    // Fetch order with shipping address
    const order = await queryOne<OrderRow>(
      `SELECT id, shipping_address, warehouse_id, metadata FROM orders WHERE id = $1`,
      [id]
    );

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const configured = isShipBossConfigured();

    // Parse shipping address
    const addr = order.shipping_address;
    if (!addr?.line1 || !addr?.city || !addr?.state || !addr?.zipCode) {
      return NextResponse.json(
        { error: 'Order is missing a complete shipping address' },
        { status: 422 }
      );
    }

    const shipTo = {
      street: addr.line1,
      city: addr.city,
      state: addr.state,
      zip: addr.zipCode,
      country: addr.country ?? 'US',
    };

    // Resolve ship-from warehouse using the same 4-step logic as book-shipment and page.tsx
    let shipFrom: FreightShipFromAddress | undefined;

    // Parse metadata (may be a string or object depending on DB driver)
    const meta: Record<string, unknown> =
      typeof order.metadata === 'string'
        ? (() => { try { return JSON.parse(order.metadata); } catch { return {}; } })()
        : (order.metadata ?? {});

    // 1. Use warehouse_allocations (authoritative inventory location)
    const allocations = (meta.warehouse_allocations ?? []) as WarehouseAllocation[];
    const firstAllocationId = allocations[0]?.warehouse_id;
    if (firstAllocationId) {
      const wh = await queryOne<WarehouseRow>(
        `SELECT address_street, address_city, address_state, address_zip
         FROM warehouses WHERE id = $1 AND is_active = true`,
        [firstAllocationId]
      );
      if (wh) {
        shipFrom = { street: wh.address_street, city: wh.address_city, state: wh.address_state, zip: wh.address_zip };
      }
    }

    // 2. Fall back to order.warehouse_id (admin-assigned primary warehouse)
    if (!shipFrom && order.warehouse_id) {
      const wh = await queryOne<WarehouseRow>(
        `SELECT address_street, address_city, address_state, address_zip
         FROM warehouses WHERE id = $1 AND is_active = true`,
        [order.warehouse_id]
      );
      if (wh) {
        shipFrom = { street: wh.address_street, city: wh.address_city, state: wh.address_state, zip: wh.address_zip };
      }
    }

    // 3. product_warehouses: covers orders that predate warehouse_allocations metadata
    if (!shipFrom) {
      const wh = await queryOne<WarehouseRow>(
        `SELECT w.address_street, w.address_city, w.address_state, w.address_zip
         FROM order_items oi
         JOIN product_warehouses pw ON pw.product_id = oi.product_id
         JOIN warehouses w ON w.id = pw.warehouse_id AND w.is_active = true
         WHERE oi.order_id = $1
         ORDER BY pw.updated_at DESC
         LIMIT 1`,
        [id]
      );
      if (wh) {
        shipFrom = { street: wh.address_street, city: wh.address_city, state: wh.address_state, zip: wh.address_zip };
      }
    }

    // 4. Last resort: oldest active warehouse
    if (!shipFrom) {
      const wh = await queryOne<WarehouseRow>(
        `SELECT address_street, address_city, address_state, address_zip
         FROM warehouses WHERE is_active = true ORDER BY created_at ASC LIMIT 1`
      );
      if (wh) {
        shipFrom = { street: wh.address_street, city: wh.address_city, state: wh.address_state, zip: wh.address_zip };
      }
    }

    if (!shipFrom) {
      return NextResponse.json(
        { error: 'No active warehouse found. Please assign a warehouse to this order or ensure at least one warehouse is active.' },
        { status: 422 }
      );
    }

    // Fetch order items with product carton dimensions and NMFC classification
    const itemRows = await query<OrderItemRow>(
      `SELECT
         oi.product_id,
         oi.name,
         oi.quantity,
         p.unit_of_measure,
         p.carton_length,
         p.carton_width,
         p.carton_height,
         p.carton_weight_lbs,
         (p.attributes->>'weight')::numeric AS net_content_weight_lbs,
         p.nmfc_number,
         p.freight_class
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1`,
      [id]
    );

    const items: FreightShipItem[] = itemRows.map((row) => ({
      name: row.name,
      unitOfMeasure: row.unit_of_measure,
      quantity: row.quantity,
      cartonLength: row.carton_length ? parseFloat(row.carton_length) : null,
      cartonWidth: row.carton_width ? parseFloat(row.carton_width) : null,
      cartonHeight: row.carton_height ? parseFloat(row.carton_height) : null,
      cartonWeightLbs: row.carton_weight_lbs
        ? parseFloat(row.carton_weight_lbs)
        : row.net_content_weight_lbs
        ? parseFloat(row.net_content_weight_lbs)
        : null,
      nmfcNumber: row.nmfc_number ?? null,
      freightClass: row.freight_class ?? null,
    }));

    const liftgateRequired = meta.liftgate_required === true;
    const rates = await getFreightQuotes(items, shipTo, shipFrom, liftgateRequired);

    return NextResponse.json({ rates, configured, liftgateRequired });
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
    console.error('[shipping-rates] Error fetching rates:', error);
    return NextResponse.json({ error: 'Failed to fetch shipping rates' }, { status: 500 });
  }
}
