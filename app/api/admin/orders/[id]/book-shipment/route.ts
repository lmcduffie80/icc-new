import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { query, queryOne } from '@/lib/db';
import { securityLogger } from '@/lib/security-logger';
import { getFreightQuotes, estimateWeightLbs } from '@/lib/freight-quote';
import type { FreightShipFromAddress, FreightShipItem } from '@/lib/freight-quote';
import {
  bookLtlFreight,
  isFreightBookingConfigured,
  type FreightBookingInput,
} from '@/lib/shipboss-freight-booking';

const SHIPBOSS_BASE_URL = 'https://ship.shipboss.io/api/public/v1';
const LTL_WEIGHT_THRESHOLD = 150;

interface OrderRow {
  id: string;
  freight_quote_id: string | null;
  shipping_carrier: string | null;
  delivery_fee: number | null;
  metadata: Record<string, unknown> | null;
  shipping_address: {
    firstName?: string;
    lastName?: string;
    line1: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
    phone?: string;
    email?: string;
  };
  warehouse_id: string | null;
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
  name: string;
  email: string | null;
  phone: string | null;
}

interface ShipBossLabelResponse {
  status: string;
  data?: {
    packages?: Array<{
      tracking_number?: string;
      label?: string;
    }>;
    label_info?: {
      link?: string;
      expires?: string;
    };
    [key: string]: unknown;
  };
  message?: string;
}

/**
 * POST /api/admin/orders/[id]/book-shipment
 *
 * For parcel shipments (<=150 lbs): creates a label via ShipBoss create-label endpoint.
 * For LTL freight (>150 lbs): returns guidance to book via ShipBoss web interface.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const { id } = await params;

  const token = process.env.SHIPPING_ICC;
  if (!token) {
    return NextResponse.json(
      { error: 'ShipBoss is not configured. Set SHIPPING_ICC.' },
      { status: 503 }
    );
  }

  try {
    const order = await queryOne<OrderRow>(
      `SELECT id, freight_quote_id, shipping_carrier, delivery_fee, metadata, shipping_address, warehouse_id
       FROM orders WHERE id = $1`,
      [id]
    );

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!order.freight_quote_id && !order.shipping_carrier) {
      return NextResponse.json(
        { error: 'No freight quote selected for this order. Get live rates and save a rate first.' },
        { status: 422 }
      );
    }

    const meta = order.metadata ?? {};
    const liftgateRequired = meta.liftgate_required === true;
    if (meta.shipboss_booking_id) {
      return NextResponse.json(
        { error: 'This shipment has already been booked.', bookingId: meta.shipboss_booking_id },
        { status: 409 }
      );
    }

    const addr = order.shipping_address;
    if (!addr?.line1 || !addr?.city || !addr?.state || !addr?.zipCode) {
      return NextResponse.json(
        { error: 'Order is missing a complete shipping address' },
        { status: 422 }
      );
    }

    let warehouse: WarehouseRow | null = null;

    // 1. Use warehouse_allocations (authoritative inventory location)
    const allocations = (meta.warehouse_allocations ?? []) as Array<{ warehouse_id: string }>;
    const firstAllocationId = allocations[0]?.warehouse_id;
    if (firstAllocationId) {
      warehouse = await queryOne<WarehouseRow>(
        `SELECT address_street, address_city, address_state, address_zip,
                name, email, phone
         FROM warehouses WHERE id = $1 AND is_active = true`,
        [firstAllocationId]
      );
    }

    // 2. Fall back to order.warehouse_id (admin-assigned primary warehouse)
    if (!warehouse && order.warehouse_id) {
      warehouse = await queryOne<WarehouseRow>(
        `SELECT address_street, address_city, address_state, address_zip,
                name, email, phone
         FROM warehouses WHERE id = $1 AND is_active = true`,
        [order.warehouse_id]
      );
    }

    // 3. product_warehouses: covers orders that predate warehouse_allocations metadata
    if (!warehouse) {
      warehouse = await queryOne<WarehouseRow>(
        `SELECT w.address_street, w.address_city, w.address_state, w.address_zip,
                w.name, w.email, w.phone
         FROM order_items oi
         JOIN product_warehouses pw ON pw.product_id = oi.product_id
         JOIN warehouses w ON w.id = pw.warehouse_id AND w.is_active = true
         WHERE oi.order_id = $1
         ORDER BY pw.updated_at DESC
         LIMIT 1`,
        [id]
      );
    }

    // 4. Last resort: oldest active warehouse
    if (!warehouse) {
      warehouse = await queryOne<WarehouseRow>(
        `SELECT address_street, address_city, address_state, address_zip,
                name, email, phone
         FROM warehouses WHERE is_active = true ORDER BY created_at ASC LIMIT 1`
      );
    }
    if (!warehouse) {
      return NextResponse.json(
        { error: 'No active warehouse found to ship from' },
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
    const shipFrom: FreightShipFromAddress = {
      street: warehouse.address_street,
      city: warehouse.address_city,
      state: warehouse.address_state,
      zip: warehouse.address_zip,
    };

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

    const weightLbs = estimateWeightLbs(items);
    const isLtl = weightLbs > LTL_WEIGHT_THRESHOLD;

    // LTL freight: ShipBoss public API does not support booking LTL.
    // Attempt headless browser automation, fall back to manual web booking.
    if (isLtl) {
      const freshRates = await getFreightQuotes(items, shipTo, shipFrom, liftgateRequired);
      const savedCarrier = order.shipping_carrier?.toUpperCase();
      const matchedRate =
        (savedCarrier
          ? freshRates.find((r) => r.carrier.toUpperCase() === savedCarrier)
          : null) ?? freshRates[0];

      if (matchedRate) {
        await query(
          `UPDATE orders SET freight_quote_id = $1, updated_at = NOW() WHERE id = $2`,
          [matchedRate.quoteId, id]
        );
      }

      // If web automation credentials are configured, attempt headless booking
      if (isFreightBookingConfigured()) {
        console.log('[book-shipment] LTL detected — attempting headless browser booking...');

        const cleanPhoneLtl = (raw: string | null | undefined, fallback: string) => {
          if (!raw) return fallback;
          const digits = raw.replace(/\s*(ext\.?|x)\s*\d+$/i, '').replace(/\D/g, '');
          return digits || fallback;
        };

        const freightInput: FreightBookingInput = {
          fromAddress: {
            name: warehouse.name,
            street: warehouse.address_street,
            city: warehouse.address_city,
            state: warehouse.address_state,
            zip: warehouse.address_zip,
            country: 'US',
            phone: cleanPhoneLtl(warehouse.phone, '8005551234'),
            email: warehouse.email ?? 'shipping@innovativecropcare.com',
          },
          toAddress: {
            name:
              [addr.firstName, addr.lastName].filter(Boolean).join(' ') || 'Customer',
            street: addr.line1,
            city: addr.city,
            state: addr.state,
            zip: addr.zipCode,
            country: addr.country ?? 'US',
            phone: cleanPhoneLtl(addr.phone, '0000000000'),
            email: addr.email ?? '',
          },
          packages: items.map((item) => {
            const uom = item.unitOfMeasure?.toLowerCase() ?? '';
            const isTote = uom.includes('tote') || uom.includes('tank');
            // Use estimateWeightLbs for a single unit so tote/tank defaults (2,200 lbs)
            // and carton weights are resolved consistently with the freight-quote library.
            const unitWeight = estimateWeightLbs([{ ...item, quantity: 1 }]);
            return {
              weight: Math.max(1, Math.round(unitWeight * item.quantity)),
              length: item.cartonLength ? Math.round(item.cartonLength) : 48,
              width: item.cartonWidth ? Math.round(item.cartonWidth) : (isTote ? 48 : 40),
              height: item.cartonHeight ? Math.round(item.cartonHeight) : (isTote ? 60 : 48),
              quantity: item.quantity,
              commodity: item.name ?? 'General Freight',
              freightClass: item.freightClass ? parseInt(item.freightClass, 10) : 70,
            };
          }),
          pickupDate: new Date().toISOString().split('T')[0],
        };

        const bookingResult = await bookLtlFreight(freightInput);

        if (bookingResult.success) {
          const bookingId =
            bookingResult.trackingNumber ?? bookingResult.shipmentId ?? `ltl-${Date.now()}`;

          const updatedMeta = {
            ...meta,
            shipboss_booking_id: bookingId,
            shipboss_booked_at: new Date().toISOString(),
            ...(bookingResult.trackingNumber
              ? { tracking_number: bookingResult.trackingNumber }
              : {}),
            ...(bookingResult.billOfLadingUrl
              ? { bol_url: bookingResult.billOfLadingUrl }
              : {}),
            ...(bookingResult.carrier
              ? { booked_carrier: bookingResult.carrier }
              : {}),
            booking_method: 'automated_web',
          };

          await query(
            `UPDATE orders SET metadata = $1, updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(updatedMeta), id]
          );

          const ip =
            request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip') ||
            'unknown';

          securityLogger.logEvent({
            type: 'admin_action',
            ip,
            path: `/api/admin/orders/${id}/book-shipment`,
            method: 'POST',
            details: {
              action: 'book_ltl_shipment_automated',
              orderId: id,
              bookingId,
              carrier: bookingResult.carrier,
              shipmentId: bookingResult.shipmentId,
            },
            userId: authResult.session?.admin_user_id,
            severity: 'medium',
          });

          return NextResponse.json({
            success: true,
            bookingId,
            trackingNumber: bookingResult.trackingNumber ?? null,
            bolUrl: bookingResult.billOfLadingUrl ?? null,
            carrier: bookingResult.carrier ?? null,
            automated: true,
          });
        }

        // Automation failed — fall through to manual fallback
        console.warn(
          '[book-shipment] Automated LTL booking failed, falling back to manual:',
          bookingResult.error
        );
      }

      // Fallback: direct admin to book via ShipBoss web UI
      return NextResponse.json(
        {
          error: isFreightBookingConfigured()
            ? 'Automated booking failed. Please book through the ShipBoss web interface.'
            : 'LTL freight shipments must be booked through the ShipBoss web interface.',
          ltlBookingRequired: true,
          bookingUrl: 'https://ship.shipboss.io/ship',
          quoteId: matchedRate?.quoteId ?? order.freight_quote_id,
          carrier: matchedRate?.carrier ?? order.shipping_carrier,
        },
        { status: 422 }
      );
    }

    // Parcel: fetch fresh rates and use create-label endpoint
    const freshRates = await getFreightQuotes(items, shipTo, shipFrom, liftgateRequired);
    const savedCarrier = order.shipping_carrier?.toUpperCase();
    const matchedRate =
      (savedCarrier
        ? freshRates.find((r) => r.carrier.toUpperCase() === savedCarrier)
        : null) ?? freshRates[0];

    if (!matchedRate) {
      return NextResponse.json(
        { error: 'No shipping rates available for this order at this time. Please try again.' },
        { status: 422 }
      );
    }

    await query(
      `UPDATE orders SET freight_quote_id = $1, shipping_carrier = $2, updated_at = NOW() WHERE id = $3`,
      [matchedRate.quoteId, matchedRate.carrier, id]
    );

    const cleanPhone = (raw: string | null | undefined, fallback: string) => {
      if (!raw) return fallback;
      const digits = raw.replace(/\s*(ext\.?|x)\s*\d+$/i, '').replace(/\D/g, '');
      return digits || fallback;
    };

    const itemWithDims = items.find((i) => {
      const uom = i.unitOfMeasure?.toLowerCase() ?? '';
      const isTote = uom.includes('tote') || uom.includes('tank');
      return !isTote && i.cartonLength && i.cartonWidth && i.cartonHeight;
    });

    // Extract service_code from quoteId (format: "parcel:CARRIER:SERVICE_CODE")
    // or fall back to serviceCode field, then service name as last resort
    const serviceCode =
      matchedRate.serviceCode ??
      (matchedRate.quoteId.startsWith('parcel:') ? matchedRate.quoteId.split(':')[2] : undefined) ??
      matchedRate.service;

    const labelRequestBody = {
      addresses: {
        from: {
          address_1: warehouse.address_street,
          city: warehouse.address_city,
          state: warehouse.address_state,
          zip: warehouse.address_zip,
          country: 'US',
          name: warehouse.name,
          phone: cleanPhone(warehouse.phone, '8005551234'),
          contact_email: warehouse.email ?? 'shipping@innovativecropcare.com',
        },
        to: {
          address_1: addr.line1,
          city: addr.city,
          state: addr.state,
          zip: addr.zipCode,
          country: addr.country ?? 'US',
          name: [addr.firstName, addr.lastName].filter(Boolean).join(' ') || 'Customer',
          phone: cleanPhone(addr.phone, '0000000000'),
          contact_email: addr.email ?? '',
        },
      },
      packages: [
        {
          weight: Math.max(1, Math.round(weightLbs)),
          length: itemWithDims?.cartonLength ? Math.round(itemWithDims.cartonLength) : 12,
          width: itemWithDims?.cartonWidth ? Math.round(itemWithDims.cartonWidth) : 12,
          height: itemWithDims?.cartonHeight ? Math.round(itemWithDims.cartonHeight) : 12,
          quantity: 1,
          ...(liftgateRequired ? { liftgate: true } : {}),
        },
      ],
      ship_date: new Date().toISOString().split('T')[0],
      carrier: matchedRate.carrier,
      service_code: serviceCode,
      label_type: 'PDF',
      package_type: 'CUSTOMER_PACKAGING',
      test: process.env.NODE_ENV !== 'production',
    };

    console.log('[book-shipment] Creating parcel label via create-label endpoint');
    console.log('[book-shipment] Request body:', JSON.stringify(labelRequestBody, null, 2));

    const res = await fetch(`${SHIPBOSS_BASE_URL}/create-label`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(labelRequestBody),
    });

    const text = await res.text();
    console.log(`[book-shipment] create-label response status: ${res.status}`);
    console.log(`[book-shipment] create-label raw response:`, text.slice(0, 500));

    if (text.trimStart().startsWith('<!DOCTYPE')) {
      throw new Error(
        'ShipBoss returned an HTML error page. This may indicate a service outage. Please try again later.'
      );
    }

    let parsed: ShipBossLabelResponse;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        `ShipBoss returned an unexpected response (HTTP ${res.status}): ${text.slice(0, 200)}`
      );
    }

    if (!res.ok || parsed.status !== 'success') {
      console.error('[book-shipment] create-label error:', res.status, parsed);
      throw new Error(
        `ShipBoss label creation failed (${res.status}): ${parsed.message ?? text}`
      );
    }

    const trackingNumber = parsed.data?.packages?.[0]?.tracking_number ?? null;
    const labelUrl = parsed.data?.label_info?.link ?? null;
    const bookingId = trackingNumber ?? `label-${Date.now()}`;

    const updatedMeta = {
      ...meta,
      shipboss_booking_id: bookingId,
      shipboss_booked_at: new Date().toISOString(),
      ...(trackingNumber ? { tracking_number: trackingNumber } : {}),
      ...(labelUrl ? { shipboss_label_url: labelUrl } : {}),
    };

    await query(
      `UPDATE orders SET metadata = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(updatedMeta), id]
    );

    const ip =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown';

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: `/api/admin/orders/${id}/book-shipment`,
      method: 'POST',
      details: {
        action: 'book_shipment',
        orderId: id,
        bookingId,
        carrier: matchedRate.carrier,
        service: matchedRate.service,
      },
      userId: authResult.session?.admin_user_id,
      severity: 'medium',
    });

    return NextResponse.json({
      success: true,
      bookingId,
      trackingNumber,
      labelUrl,
    });
  } catch (error) {
    const ip =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown';
    securityLogger.logError('book_shipment_failed', error, ip);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to book shipment' },
      { status: 500 }
    );
  }
}
