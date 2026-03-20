import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';
import { logAction } from '@/lib/audit';

interface Order {
  id: string;
  delivery_fee: string;
  total: string;
  subtotal: string;
  tax: string;
  metadata: Record<string, unknown> | string;
}

interface OrderMetadata {
  manual_shipping?: boolean;
  manual_shipping_set_by?: string;
  manual_shipping_set_at?: string;
  original_shipping_fee?: string;
  [key: string]: unknown;
}

// PUT /api/admin/orders/[id]/shipping - Update shipping cost (admin only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('orders.update');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json();
    const { deliveryFee, freightQuoteId, shippingCarrier } = body;

    if (deliveryFee === undefined || deliveryFee === null) {
      return NextResponse.json(
        { error: 'Delivery fee is required' },
        { status: 400 }
      );
    }

    const deliveryFeeNum = parseFloat(deliveryFee);
    if (isNaN(deliveryFeeNum) || deliveryFeeNum < 0) {
      return NextResponse.json(
        { error: 'Delivery fee must be a valid number >= 0' },
        { status: 400 }
      );
    }

    // Get existing order
    const existingOrder = await queryOne<Order>('SELECT * FROM orders WHERE id = $1', [id]);

    if (!existingOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Calculate new total
    const subtotal = parseFloat(existingOrder.subtotal);
    const tax = parseFloat(existingOrder.tax);
    const newTotal = subtotal + deliveryFeeNum + tax;

    // Parse existing metadata
    let metadata: OrderMetadata = {};
    if (typeof existingOrder.metadata === 'string') {
      try {
        metadata = JSON.parse(existingOrder.metadata) as OrderMetadata;
      } catch {
        metadata = {};
      }
    } else if (existingOrder.metadata) {
      metadata = existingOrder.metadata as OrderMetadata;
    }

    // Mark shipping as manually set by admin
    metadata.manual_shipping = true;
    metadata.manual_shipping_set_by = auth.session.adminUser.id;
    metadata.manual_shipping_set_at = new Date().toISOString();
    metadata.original_shipping_fee = existingOrder.delivery_fee;

    // Build the SET clause — optionally update freight_quote_id and shipping_carrier
    // when the admin selected a live ShipBoss rate
    const extraSets: string[] = [];
    const extraParams: unknown[] = [];
    let paramIdx = 5;

    if (freightQuoteId && typeof freightQuoteId === 'string') {
      extraSets.push(`freight_quote_id = $${paramIdx++}`);
      extraParams.push(freightQuoteId);
    }
    if (shippingCarrier && typeof shippingCarrier === 'string') {
      extraSets.push(`shipping_carrier = $${paramIdx++}`);
      extraParams.push(shippingCarrier);
    }

    const extraSetClause = extraSets.length > 0 ? ', ' + extraSets.join(', ') : '';

    // Update order with new shipping fee and recalculated total
    const order = await queryOne<Order>(
      `UPDATE orders 
       SET delivery_fee = $1, 
           total = $2,
           metadata = $3,
           updated_at = NOW()
           ${extraSetClause}
       WHERE id = $4
       RETURNING *`,
      [deliveryFeeNum, newTotal, JSON.stringify(metadata), id, ...extraParams]
    );

    // Log the action
    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'update_shipping',
      resourceType: 'order',
      resourceId: id,
      before: { 
        delivery_fee: existingOrder.delivery_fee,
        total: existingOrder.total,
      },
      after: { 
        delivery_fee: order!.delivery_fee,
        total: order!.total,
      },
    });

    return NextResponse.json(order);
  } catch (error) {
    console.error('Error updating shipping cost:', error);
    return NextResponse.json(
      { error: 'Failed to update shipping cost' },
      { status: 500 }
    );
  }
}

