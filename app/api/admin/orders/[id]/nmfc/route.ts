import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';

interface Order {
  id: string;
  metadata: Record<string, unknown> | string;
}

interface OrderMetadata {
  nmfcInfo?: Array<{ shippingType: 'TL' | 'LTL'; number?: string; freightClass?: string }>;
  nmfcNumber?: string;
  [key: string]: unknown;
}

// PUT /api/admin/orders/[id]/nmfc - Update NMFC number for order
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('orders.update_status');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json();
    const { nmfcNumber, nmfcInfo } = body;

    // Support both legacy format (nmfcNumber) and new format (nmfcInfo array)
    if (nmfcInfo) {
      // New format: array of NMFC info
      if (!Array.isArray(nmfcInfo) || nmfcInfo.length === 0) {
        return NextResponse.json(
          { error: 'NMFC info array is required' },
          { status: 400 }
        );
      }

      // Validate each entry
      for (let i = 0; i < nmfcInfo.length; i++) {
        const entry = nmfcInfo[i];
        if (!entry.shippingType || !['TL', 'LTL'].includes(entry.shippingType)) {
          return NextResponse.json(
            { error: `Entry ${i + 1}: Invalid shipping type. Must be 'TL' or 'LTL'` },
            { status: 400 }
          );
        }
        if (entry.shippingType === 'LTL' && (!entry.number || entry.number.trim() === '')) {
          return NextResponse.json(
            { error: `Entry ${i + 1}: NMFC number is required for LTL shipments` },
            { status: 400 }
          );
        }
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

      // Update NMFC info in metadata
      metadata.nmfcInfo = nmfcInfo;
      // Keep legacy nmfcNumber for backward compatibility (use first entry)
      if (nmfcInfo.length > 0) {
        const firstEntry = nmfcInfo[0];
        metadata.nmfcNumber = firstEntry.shippingType === 'TL' ? 'TL' : (firstEntry.number || 'TBD');
      }

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
        nmfcInfo: metadata.nmfcInfo,
        nmfcNumber: metadata.nmfcNumber // Legacy field
      });
    } else if (nmfcNumber) {
      // Legacy format: single NMFC number
      if (typeof nmfcNumber === 'string' && nmfcNumber.trim() === '') {
        return NextResponse.json(
          { error: 'NMFC number is required' },
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

      // Update NMFC number in metadata (legacy format)
      metadata.nmfcNumber = nmfcNumber;
      // Convert to new format for consistency
      if (nmfcNumber === 'TL') {
        metadata.nmfcInfo = [{ shippingType: 'TL', number: undefined }];
      } else {
        metadata.nmfcInfo = [{ shippingType: 'LTL', number: nmfcNumber }];
      }

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
        nmfcNumber: metadata.nmfcNumber,
        nmfcInfo: metadata.nmfcInfo
      });
    } else {
      return NextResponse.json(
        { error: 'Either nmfcNumber or nmfcInfo is required' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error updating NMFC number:', error);
    return NextResponse.json(
      { error: 'Failed to update NMFC number' },
      { status: 500 }
    );
  }
}

