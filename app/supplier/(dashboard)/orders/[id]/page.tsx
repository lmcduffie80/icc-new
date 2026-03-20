import { getSupplierSession } from '@/lib/supplier-auth';
import { redirect, notFound } from 'next/navigation';
import { queryOne, query } from '@/lib/db';
import Link from 'next/link';
import { ArrowLeft, Package, MapPin, Calendar, DollarSign, FileText, Download } from 'lucide-react';
import { StateIcon } from '@/components/state-icon';
import Image from 'next/image';
import { getImageProxyUrl } from '@/lib/image-proxy';

export const dynamic = 'force-dynamic';

// Helper function to convert S3 URLs to proxy URLs for documents
function getDocumentProxyUrl(url: string): string {
  // Check if it's an S3 URL that needs proxying
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
  tracking_number: string | null;
  tracking_carrier: string | null;
}

async function getOrder(supplierId: string, orderId: string): Promise<Order | null> {
  // Verify that this order contains products from this supplier
  const orderCheck = await queryOne<{ order_id: string }>(
    `SELECT DISTINCT o.id as order_id
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE o.id = $1 AND p.supplier_id = $2 AND p.deleted_at IS NULL`,
    [orderId, supplierId]
  );

  if (!orderCheck) {
    return null;
  }

  const dbOrder = await queryOne<Order & { metadata: { tracking_number?: string; tracking_carrier?: string } | null }>(
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
    [orderId]
  );

  if (!dbOrder) {
    return null;
  }

  // Extract tracking information from metadata
  let trackingNumber: string | null = null;
  let trackingCarrier: string | null = null;

  if (dbOrder.metadata) {
    if (typeof dbOrder.metadata === 'string') {
      try {
        const metadata = JSON.parse(dbOrder.metadata) as { tracking_number?: string; tracking_carrier?: string };
        trackingNumber = metadata.tracking_number || null;
        trackingCarrier = metadata.tracking_carrier || null;
      } catch {
        // Metadata is not valid JSON, ignore
      }
    } else if (typeof dbOrder.metadata === 'object') {
      trackingNumber = dbOrder.metadata.tracking_number || null;
      trackingCarrier = dbOrder.metadata.tracking_carrier || null;
    }
  }

  return {
    id: dbOrder.id,
    order_number: dbOrder.order_number,
    status: dbOrder.status,
    created_at: dbOrder.created_at,
    updated_at: dbOrder.updated_at,
    shipping_state: dbOrder.shipping_state,
    subtotal: dbOrder.subtotal,
    delivery_fee: dbOrder.delivery_fee,
    tax: dbOrder.tax,
    total: dbOrder.total,
    delivery_method: dbOrder.delivery_method,
    tracking_number: trackingNumber,
    tracking_carrier: trackingCarrier,
  };
}

async function getOrderItems(supplierId: string, orderId: string): Promise<OrderItem[]> {
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
    [orderId, supplierId]
  );

  // Fetch product documents for each item
  const itemsWithDocuments = await Promise.all(
    items.map(async (item) => {
      const product = await queryOne<{
        documents: Array<{ name: string; url: string }> | null;
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

      // Helper to check if URL matches (handles both original and proxy URLs)
      const urlMatches = (url1: string, url2: string): boolean => {
        if (!url1 || !url2) return false;
        // Normalize URLs for comparison (remove protocol, proxy prefix, etc.)
        const normalize = (u: string) => {
          let normalized = u;
          // Remove proxy prefix if present
          if (normalized.includes('/api/images/proxy?url=')) {
            try {
              const decoded = decodeURIComponent(normalized.split('url=')[1]);
              normalized = decoded;
            } catch {
              // Ignore decode errors
            }
          }
          // Remove protocol
          normalized = normalized.replace(/^https?:\/\//, '');
          return normalized;
        };
        return normalize(url1) === normalize(url2);
      };

      // Add SDS URL if it exists and not already in documents
      if (product?.sds_url && !documents.some((doc) => urlMatches(doc.url, product.sds_url!))) {
        documents.push({
          name: 'Safety Data Sheet (SDS)',
          url: getDocumentProxyUrl(product.sds_url),
        });
      }

      // Add Label URL (prefer admin_label_url if available, otherwise label_url)
      const labelUrl = product?.admin_label_url || product?.label_url;
      if (labelUrl && !documents.some((doc) => urlMatches(doc.url, labelUrl))) {
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

  return itemsWithDocuments;
}

export default async function SupplierOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSupplierSession();

  if (!session) {
    redirect('/supplier/login');
  }

  const { id } = await params;
  const [order, items] = await Promise.all([
    getOrder(session.user.id, id),
    getOrderItems(session.user.id, id),
  ]);

  if (!order) {
    notFound();
  }

  const formatCurrency = (amount: string | number): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    shipped: 'bg-purple-100 text-purple-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  // Calculate supplier subtotal (only items from this supplier)
  const supplierSubtotal = items.reduce((sum, item) => sum + parseFloat(item.total), 0);

  // Calculate total number of totes for price per gallon
  const totalTotes = items.reduce((sum, item) => {
    if (item.unit_of_measure && item.unit_of_measure.toLowerCase() === 'tote') {
      return sum + item.quantity;
    }
    return sum;
  }, 0);

  let pricePerGallon: number | null = null;
  if (totalTotes > 0) {
    const totalGallons = totalTotes * 265;
    pricePerGallon = supplierSubtotal / totalGallons;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/supplier/orders"
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Orders
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">
            Order #{order.order_number}
          </h1>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
              statusColors[order.status] || 'bg-slate-100 text-slate-800'
            }`}
          >
            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
          </span>
        </div>
        <p className="mt-1 text-slate-500">
          Placed on {new Date(order.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Order Items */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Package className="h-5 w-5" />
                Your Products in This Order
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {items.map((item) => {
                const imageUrl = item.image
                  ? getImageProxyUrl(item.image) || item.image
                  : '/placeholder.png';
                const isS3Image =
                  item.image?.includes('s3.amazonaws.com') ||
                  item.image?.includes('.s3.') ||
                  imageUrl.includes('/api/images/proxy');

                return (
                  <div key={item.id} className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        <Image
                          src={imageUrl}
                          alt={item.name}
                          fill
                          sizes="80px"
                          className="object-cover"
                          unoptimized={isS3Image}
                        />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-slate-900">{item.name}</h3>
                        <div className="mt-2 space-y-1 text-sm text-slate-600">
                          <p>
                            Quantity: {item.quantity}
                            {item.unit_of_measure && (
                              <span className="ml-1 text-slate-500">
                                ({item.unit_of_measure})
                              </span>
                            )}
                          </p>
                          <p>Price per unit: {formatCurrency(item.price)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900">
                          {formatCurrency(item.total)}
                        </p>
                      </div>
                    </div>

                    {/* Product Documents */}
                    {item.documents && item.documents.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <h3 className="mb-2 text-sm font-semibold text-slate-700">
                          Product Documents
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {item.documents.map((doc, docIndex) => (
                            <a
                              key={docIndex}
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                            >
                              <FileText className="h-4 w-4 text-slate-500" />
                              <span>{doc.name}</span>
                              <Download className="h-3 w-3 text-slate-400" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Order Details Sidebar */}
        <div className="space-y-6">
          {/* Shipping Destination */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <MapPin className="h-5 w-5" />
              Shipping Destination
            </h2>
            {order.shipping_state ? (
              <div className="flex justify-center">
                <StateIcon stateCode={order.shipping_state} size="lg" />
              </div>
            ) : (
              <p className="text-sm text-slate-500">State not specified</p>
            )}
          </div>

          {/* Tracking Information */}
          {order.tracking_number && (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Package className="h-5 w-5" />
                Tracking Information
              </h2>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="font-medium text-slate-900">Tracking Number</p>
                  <p className="font-mono text-slate-600">{order.tracking_number}</p>
                </div>
                {order.tracking_carrier && (
                  <div>
                    <p className="font-medium text-slate-900">Carrier</p>
                    <p className="text-slate-600">{order.tracking_carrier}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Order Summary */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <DollarSign className="h-5 w-5" />
              Your Products Summary
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Subtotal (your products)</span>
                <span className="font-medium text-slate-900">
                  {formatCurrency(supplierSubtotal)}
                </span>
              </div>
              {pricePerGallon !== null && (
                <div className="border-t border-slate-200 pt-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Price per gallon</span>
                    <span className="font-medium text-slate-900">
                      {formatCurrency(pricePerGallon)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Based on {totalTotes} tote{totalTotes !== 1 ? 's' : ''} (265 gal each)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Order Details */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Calendar className="h-5 w-5" />
              Order Details
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-slate-600">Delivery Method</p>
                <p className="font-medium capitalize text-slate-900">
                  {order.delivery_method}
                </p>
              </div>
              <div>
                <p className="text-slate-600">Order Date</p>
                <p className="font-medium text-slate-900">
                  {new Date(order.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              {order.updated_at !== order.created_at && (
                <div>
                  <p className="text-slate-600">Last Updated</p>
                  <p className="font-medium text-slate-900">
                    {new Date(order.updated_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

