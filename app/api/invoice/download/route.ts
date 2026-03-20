import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { queryOne } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { getKeyFromUrl, getFileFromS3 } from '@/lib/s3';

interface InvoiceMetadata {
  invoice_url: string;
  invoice_filename: string;
  invoice_file_type: string;
}

interface OrderWithMetadata {
  id: string;
  user_id: string;
  metadata: InvoiceMetadata | null;
}

// GET /api/invoice/download?orderId=xxx
// Downloads the invoice file by proxying from S3
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const isAdmin = searchParams.get('admin') === 'true';

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    let order: OrderWithMetadata | null = null;

    if (isAdmin) {
      // Admin access - verify admin auth
      const adminAuth = await requireAdmin('orders.view');
      if (adminAuth.error) {
        return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
      }

      order = await queryOne<OrderWithMetadata>(
        'SELECT id, user_id, metadata FROM orders WHERE id = $1',
        [orderId]
      );
    } else {
      // Customer access - verify customer auth and ownership
      const session = await auth.api.getSession({
        headers: await headers(),
      });

      if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      order = await queryOne<OrderWithMetadata>(
        'SELECT id, user_id, metadata FROM orders WHERE id = $1 AND user_id = $2',
        [orderId, session.user.id]
      );
    }

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Handle metadata - it could be a string (from DB) or already parsed
    let metadata: InvoiceMetadata | null = null;
    if (order.metadata) {
      if (typeof order.metadata === 'string') {
        try {
          metadata = JSON.parse(order.metadata);
        } catch {
          console.error('Failed to parse invoice metadata');
          return NextResponse.json({ error: 'Invalid invoice metadata' }, { status: 500 });
        }
      } else {
        metadata = order.metadata;
      }
    }

    if (!metadata?.invoice_url) {
      return NextResponse.json({ error: 'No invoice found for this order' }, { status: 404 });
    }

    // Extract the S3 key from the stored URL
    const s3Key = getKeyFromUrl(metadata.invoice_url);
    if (!s3Key) {
      console.error('Failed to extract S3 key from URL:', metadata.invoice_url);
      return NextResponse.json({ error: 'Invalid invoice URL' }, { status: 500 });
    }

    // Fetch the file directly from S3 using AWS SDK (works with private buckets)
    const file = await getFileFromS3(s3Key);

    if (!file) {
      console.error('Failed to fetch file from S3, key:', s3Key);
      return NextResponse.json({ error: 'Failed to fetch invoice from storage' }, { status: 500 });
    }

    // Return the file with proper headers for download
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        'Content-Type': metadata.invoice_file_type || file.contentType,
        'Content-Disposition': `attachment; filename="${metadata.invoice_filename || 'invoice'}"`,
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (error) {
    console.error('Error downloading invoice:', error);
    return NextResponse.json({ error: 'Failed to download invoice' }, { status: 500 });
  }
}
