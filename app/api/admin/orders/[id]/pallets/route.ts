import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';

interface Order {
  id: string;
  metadata: Record<string, unknown> | string;
}

interface OrderMetadata {
  palletCount?: number;
  [key: string]: unknown;
}

// PUT /api/admin/orders/[id]/pallets - Update pallet count for order
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('orders.update_status');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json();
    const { palletCount } = body;

    if (palletCount === undefined || palletCount === null) {
      return NextResponse.json(
        { error: 'Pallet count is required' },
        { status: 400 }
      );
    }

    const palletCountNum = typeof palletCount === 'string' 
      ? parseInt(palletCount, 10) 
      : palletCount;

    if (isNaN(palletCountNum) || palletCountNum < 1) {
      return NextResponse.json(
        { error: 'Pallet count must be a positive number' },
        { status: 400 }
      );
    }

    // Get existing order
    const existingOrder = await queryOne<Order>(
      'SELECT id, metadata FROM orders WHERE id = $1',
      [id]
    );

    if (!existingOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Parse existing metadata or create new object
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

    // Update pallet count in metadata
    metadata.palletCount = palletCountNum;

    // Update order with new metadata
    await queryOne<Order>(
      `UPDATE orders
       SET metadata = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, JSON.stringify(metadata)]
    );

    return NextResponse.json({
      success: true,
      palletCount: metadata.palletCount
    });
  } catch (error) {
    console.error('Error updating pallet count:', error);
    return NextResponse.json(
      { error: 'Failed to update pallet count' },
      { status: 500 }
    );
  }
}

