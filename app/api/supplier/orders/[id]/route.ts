import { NextRequest, NextResponse } from 'next/server';
import { verifySupplierAuth } from '@/lib/supplier-middleware';
import { query, queryOne } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

// Helper function to convert S3 URLs to proxy URLs for documents
function getDocumentProxyUrl(url: string): string {
  if (!url) return url;
  
  // If already a proxy URL, return as-is
  if (url.includes('/api/images/proxy')) {
    return url;
  }
  
  // Ensure URL has a protocol for parsing
  let fullUrl = url.trim();
  if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
    fullUrl = `https://${fullUrl}`;
  }
  
  // Check if it's an S3 URL by string matching (more reliable)
  // Match patterns like: bucket.s3.region.amazonaws.com, s3.amazonaws.com/bucket, etc.
  // Also check the original URL in case it doesn't have protocol
  const originalUrlLower = url.toLowerCase();
  const fullUrlLower = fullUrl.toLowerCase();
  
  const isS3Url = 
    fullUrlLower.includes('s3.amazonaws.com') ||
    fullUrlLower.includes('.s3.') ||
    fullUrlLower.includes('s3-') ||
    originalUrlLower.includes('s3.amazonaws.com') ||
    originalUrlLower.includes('.s3.') ||
    originalUrlLower.includes('s3-') ||
    (fullUrlLower.includes('amazonaws.com') && (fullUrlLower.includes('.s3.') || fullUrlLower.includes('s3')));
  
  if (isS3Url) {
    // Convert to proxy URL - use the full URL with protocol
    const proxyUrl = `/api/images/proxy?url=${encodeURIComponent(fullUrl)}`;
    return proxyUrl;
  }
  
  // Not an S3 URL, return as-is
  return url;
}

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  price: string;
  quantity: number;
  unit_of_measure: string | null;
  image: string | null;
  total: string;
  documents?: Array<{ name: string; url: string }> | null;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  updated_at: string;
  shipping_state: string | null;
  subtotal: string;
  delivery_fee: string;
  tax: string;
  total: string;
  delivery_method: string;
  tracking_number?: string | null;
  tracking_carrier?: string | null;
}

// GET /api/supplier/orders/[id] - Get a single order for the supplier's products
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifySupplierAuth(request);

  if (!authResult.authorized || !authResult.session) {
    return authResult.response!;
  }

  const supplierId = authResult.session.user.id;

  try {
    const { id } = await params;

    // First, verify that this order contains products from this supplier
    const orderCheck = await queryOne<{ order_id: string }>(
      `SELECT DISTINCT o.id as order_id
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       WHERE o.id = $1 AND p.supplier_id = $2 AND p.deleted_at IS NULL`,
      [id, supplierId]
    );

    if (!orderCheck) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Fetch the order
    const order = await queryOne<Order & { metadata: Record<string, unknown> | string | null }>(
      `SELECT 
        o.id,
        o.order_number,
        o.status,
        o.created_at,
        o.updated_at,
        (o.shipping_address::jsonb)->>'state' as shipping_state,
        o.subtotal,
        o.delivery_fee,
        o.tax,
        o.total,
        o.delivery_method,
        o.metadata
      FROM orders o
      WHERE o.id = $1`,
      [id]
    );

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Extract tracking information from metadata
    let trackingNumber: string | null = null;
    let trackingCarrier: string | null = null;
    
    if (order.metadata) {
      if (typeof order.metadata === 'string') {
        try {
          const metadata = JSON.parse(order.metadata);
          trackingNumber = metadata.tracking_number || null;
          trackingCarrier = metadata.tracking_carrier || null;
        } catch {
          // Metadata is not valid JSON, ignore
        }
      } else if (typeof order.metadata === 'object') {
        const meta = order.metadata as Record<string, unknown>;
        trackingNumber = (meta.tracking_number as string) || null;
        trackingCarrier = (meta.tracking_carrier as string) || null;
      }
    }

    // Fetch order items for this supplier's products only
    const items = await query<OrderItem>(
      `SELECT 
        oi.id,
        oi.order_id,
        oi.product_id,
        oi.name,
        oi.price,
        oi.quantity,
        oi.unit_of_measure,
        oi.image,
        (oi.price * oi.quantity)::text as total
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = $1 AND p.supplier_id = $2 AND p.deleted_at IS NULL`,
      [id, supplierId]
    );

    // Fetch product documents for each item
    const itemsWithDocuments = await Promise.all(
      items.map(async (item) => {
        const product = await queryOne<{
          documents: unknown;
          label_url: string | null;
          admin_label_url: string | null;
          sds_url: string | null;
        }>(
          'SELECT documents, label_url, admin_label_url, sds_url FROM products WHERE id = $1 AND deleted_at IS NULL',
          [item.product_id]
        );

        // Build documents array from documents JSONB and separate URL columns
        let documents: Array<{ name: string; url: string }> = [];

        // Start with existing documents array
        if (product?.documents) {
          if (typeof product.documents === 'string') {
            try {
              documents = JSON.parse(product.documents);
            } catch {
              documents = [];
            }
          } else if (Array.isArray(product.documents)) {
            documents = product.documents;
          }
        }

        // Add SDS URL if it exists and not already in documents
        if (product?.sds_url && !documents.some((doc) => doc.url === product.sds_url)) {
          documents.push({
            name: 'Safety Data Sheet (SDS)',
            url: getDocumentProxyUrl(product.sds_url),
          });
        }

        // Add Label URL (prefer admin_label_url if available, otherwise label_url)
        const labelUrl = product?.admin_label_url || product?.label_url;
        if (labelUrl && !documents.some((doc) => doc.url === labelUrl)) {
          documents.push({
            name: product.admin_label_url ? 'Product Label (Modified)' : 'Product Label',
            url: getDocumentProxyUrl(labelUrl),
          });
        }

        // Convert all document URLs to proxy URLs if they're S3 URLs
        documents = documents.map(doc => ({
          ...doc,
          url: getDocumentProxyUrl(doc.url),
        }));

        return {
          ...item,
          documents: documents.length > 0 ? documents : null,
        };
      })
    );

    return NextResponse.json({
      order: {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        created_at: order.created_at,
        updated_at: order.updated_at,
        customer_name: 'Innovative CropCare',
        shipping_state: order.shipping_state,
        subtotal: order.subtotal,
        delivery_fee: order.delivery_fee,
        tax: order.tax,
        total: order.total,
        delivery_method: order.delivery_method,
        tracking_number: trackingNumber,
        tracking_carrier: trackingCarrier,
        items: itemsWithDocuments,
      },
    });
  } catch (error) {
    securityLogger.logError('Failed to fetch supplier order', error, getClientIp(request));
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

