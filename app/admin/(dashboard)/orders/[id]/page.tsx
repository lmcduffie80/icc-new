import { getAdminSession } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Package, MapPin, CreditCard, Truck, FileText, Download, Receipt, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OrderActions } from './order-actions';
import { StatusSelector } from './status-selector';
import { BOLEmailButton } from './bol-email-button';
import { NMFCInfoBox } from './nmfc-info-box';
import { PalletInfoBox } from './pallet-info-box';
import { WarehouseSelector } from './warehouse-selector';
import { ShippingEditor } from './shipping-editor';
import { getEstimatedShippingFee } from '@/lib/shipping-estimate';
import { getImageProxyUrl } from '@/lib/image-proxy';

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

interface InvoiceMetadata {
  invoice_url?: string;
  invoice_state?: string;
  invoice_uploaded_at?: string;
  invoice_filename?: string;
  invoice_file_type?: string;
  nmfcNumber?: string; // Legacy: single NMFC number
  nmfcInfo?: Array<{ number?: string; shippingType: 'TL' | 'LTL' }>; // New: array of NMFC info
  palletCount?: number;
  manual_shipping?: boolean;
  warehouse_id?: string | null;
  warehouse_allocations?: Array<{
    warehouse_id: string;
    warehouse_name: string;
    items?: Array<{
      product_id: string;
      quantity: number;
    }>;
  }>;
  partially_fulfilled?: boolean;
  partial_fulfillment_date?: string;
  partial_fulfillment_warnings?: string[];
  tracking_number?: string;
  tracking_carrier?: string;
  tracking_added_at?: string;
  shipboss_booking_id?: string;
  shipboss_booked_at?: string;
  shipboss_label_url?: string;
}

interface Order {
  id: string;
  user_id: string;
  order_number: string;
  status: string;
  shipping_address: {
    firstName?: string;
    lastName?: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
    phone?: string;
    email?: string;
  };
  billing_address: {
    firstName?: string;
    lastName?: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
    phone?: string;
    email?: string;
  };
  delivery_method: string;
  delivery_fee: string;
  subtotal: string;
  tax: string;
  total: string;
  stripe_payment_intent_id: string | null;
  payment_status: string | null;
  paymentMethod?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
  metadata: InvoiceMetadata | null;
  warehouse_id: string | null;
  freight_quote_id: string | null;
  created_at: string;
  updated_at: string;
  user_email: string;
  user_name: string;
}

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  price: string;
  quantity: number;
  image: string | null;
  documents?: Array<{ name: string; url: string }> | null;
  original_product_id?: string | null;
  allocated_product_id?: string | null;
  supplier_id?: string | null;
  warehouse_entry_date?: string | null;
  supplier_company?: string | null;
  // Product shipping fields (joined from products table)
  product_nmfc_number?: string | null;
  product_freight_class?: string | null;
  product_minimum_order_qty?: number | null;
}

async function getOrder(id: string): Promise<Order | null> {
  return queryOne<Order>(
    `SELECT o.*, u.email as user_email, u.name as user_name
     FROM orders o
     JOIN "user" u ON u.id = o.user_id
     WHERE o.id = $1`,
    [id]
  );
}

async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  const items = await query<OrderItem>(
    `SELECT 
      oi.*,
      su.company_name as supplier_company
    FROM order_items oi
    LEFT JOIN supplier_users su ON su.id = oi.supplier_id
    WHERE oi.order_id = $1`,
    [orderId]
  );
  
  // Fetch product documents and shipping fields for each item
  const itemsWithDocuments = await Promise.all(
    items.map(async (item) => {
      const product = await queryOne<{
        documents: Array<{ name: string; url: string }> | null;
        label_url: string | null;
        admin_label_url: string | null;
        sds_url: string | null;
        nmfc_number: string | null;
        freight_class: string | null;
        freight_class_ai_suggestion: string | null;
        minimum_order_qty: number | null;
      }>(
        'SELECT documents, label_url, admin_label_url, sds_url, nmfc_number, freight_class, freight_class_ai_suggestion, minimum_order_qty FROM products WHERE id = $1',
        [item.product_id]
      );
      
      // Build documents array from documents JSONB and separate URL columns
      // This matches the logic in app/api/products/[id]/route.ts
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
      if (product?.sds_url && !documents.some(doc => doc.url === product.sds_url)) {
        documents.push({
          name: 'Safety Data Sheet (SDS)',
          url: getDocumentProxyUrl(product.sds_url),
        });
      }
      
      // Add Label URL (prefer admin_label_url if available, otherwise label_url)
      const labelUrl = product?.admin_label_url || product?.label_url;
      if (labelUrl && !documents.some(doc => doc.url === labelUrl)) {
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
        product_nmfc_number: product?.nmfc_number ?? null,
        product_freight_class: product?.freight_class ?? product?.freight_class_ai_suggestion ?? null,
        product_minimum_order_qty: product?.minimum_order_qty ?? null,
      };
    })
  );
  
  return itemsWithDocuments;
}

/**
 * Compute a suggested NMFCInfo array from order items.
 * Uses the first item's product data (single-product orders are the common case).
 * If quantity >= minimum_order_qty → TL; otherwise → LTL with NMFC number and freight class.
 */
function computeNmfcSuggestion(
  items: OrderItem[]
): Array<{ shippingType: 'TL' | 'LTL'; number?: string; freightClass?: string }> | null {
  if (!items.length) return null;

  // Use the first item as the representative product
  const item = items[0];
  const { quantity, product_nmfc_number, product_freight_class, product_minimum_order_qty } = item;

  const isTl =
    product_minimum_order_qty !== null &&
    product_minimum_order_qty !== undefined &&
    quantity >= product_minimum_order_qty;

  if (isTl) {
    return [{ shippingType: 'TL' }];
  }

  return [{
    shippingType: 'LTL',
    number: product_nmfc_number ?? undefined,
    freightClass: product_freight_class ?? undefined,
  }];
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Check permissions first - redirect should not be in try-catch
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('orders.view')) {
    redirect('/admin');
  }

  try {
    const { id } = await params;

    const [order, items] = await Promise.all([getOrder(id), getOrderItems(id)]);

    if (!order) {
      notFound();
    }

    // Fetch warehouse for ship-from address display (same 3-step resolution as book-shipment route)
    interface WarehouseAddress {
      name: string;
      address_street: string;
      address_city: string;
      address_state: string;
      address_zip: string;
    }

    let bookingWarehouse: WarehouseAddress | null = null;
    const warehouseMeta = typeof order.metadata === 'object' && order.metadata !== null ? order.metadata : {};

    // 1. Use warehouse_allocations (authoritative inventory location)
    const warehouseAllocations = (warehouseMeta.warehouse_allocations ?? []) as Array<{ warehouse_id: string }>;
    const firstAllocationId = warehouseAllocations[0]?.warehouse_id;
    if (firstAllocationId) {
      bookingWarehouse = await queryOne<WarehouseAddress>(
        `SELECT name, address_street, address_city, address_state, address_zip
         FROM warehouses WHERE id = $1 AND is_active = true`,
        [firstAllocationId]
      );
    }

    // 2. Fall back to order.warehouse_id (admin-assigned primary warehouse)
    if (!bookingWarehouse && order.warehouse_id) {
      bookingWarehouse = await queryOne<WarehouseAddress>(
        `SELECT name, address_street, address_city, address_state, address_zip
         FROM warehouses WHERE id = $1 AND is_active = true`,
        [order.warehouse_id]
      );
    }

    // 3. product_warehouses: covers orders that predate warehouse_allocations metadata
    if (!bookingWarehouse) {
      bookingWarehouse = await queryOne<WarehouseAddress>(
        `SELECT w.name, w.address_street, w.address_city, w.address_state, w.address_zip
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
    if (!bookingWarehouse) {
      bookingWarehouse = await queryOne<WarehouseAddress>(
        `SELECT name, address_street, address_city, address_state, address_zip
         FROM warehouses WHERE is_active = true ORDER BY created_at ASC LIMIT 1`
      );
    }

    // Calculate estimated shipping fee based on historical data
    const estimatedShippingFee = await getEstimatedShippingFee(
      order.delivery_method,
      parseFloat(order.subtotal),
      order.shipping_address?.state
    );

    // Check if shipping was manually set
    let isManualShipping = false;
    if (order.metadata && typeof order.metadata === 'string') {
      try {
        const metadata = JSON.parse(order.metadata);
        isManualShipping = metadata.manual_shipping === true;
      } catch {
        // Metadata is not valid JSON, ignore
      }
    } else if (order.metadata && typeof order.metadata === 'object') {
      isManualShipping = order.metadata.manual_shipping === true;
    }

  const formatCurrency = (amount: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      parseFloat(amount)
    );

  const formatAddress = (address: Order['shipping_address']) => {
    const parts = [
      address.line1,
      address.line2,
      `${address.city}, ${address.state} ${address.zipCode}`,
      address.country || 'US',
    ].filter(Boolean);
    return parts.join(', ');
  };

  const formatCardBrand = (brand: string) => {
    const brands: Record<string, string> = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'American Express',
      discover: 'Discover',
      diners: 'Diners Club',
      jcb: 'JCB',
      unionpay: 'UnionPay',
    };
    return brands[brand.toLowerCase()] || brand;
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Link
            href="/admin/orders"
            className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Orders
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">
              Order #{order.order_number}
            </h1>
            <StatusSelector
              orderId={order.id}
              currentStatus={order.status}
              permissions={session.permissions}
            />
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
        <OrderActions order={order} permissions={session.permissions} />
      </div>

      <div className="space-y-6">
        {/* Row 1: Order Items + Order Summary */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Order Items */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-slate-200 bg-white h-full">
              <div className="border-b border-slate-200 px-6 py-4">
                <h2 className="text-lg flex items-center gap-2 font-semibold text-slate-900">
                  <Package className="h-5 w-5" />
                  Order Items
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {items.map((item) => (
                  <div key={item.id} className="p-4">
                    <div className="flex items-center gap-4 mb-3">
                      <div className="relative h-16 w-16 overflow-hidden rounded-lg bg-slate-100">
                        {item.image ? (() => {
                          const imageUrl = getImageProxyUrl(item.image) || item.image || '/placeholder.png';
                          const isS3Image = item.image?.includes('s3.amazonaws.com') || item.image?.includes('.s3.') || imageUrl.includes('/api/images/proxy');
                          return (
                            <Image
                              src={imageUrl}
                              alt={item.name}
                              fill
                              sizes="64px"
                              className="object-cover"
                              unoptimized={isS3Image}
                            />
                          );
                        })() : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package className="h-6 w-6 text-slate-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{item.name}</p>
                        <p className="text-sm text-slate-500">Qty: {item.quantity}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-slate-900">
                          {formatCurrency(item.price)}
                        </p>
                        <p className="text-sm text-slate-500">
                          Total: {formatCurrency((parseFloat(item.price) * item.quantity).toString())}
                        </p>
                      </div>
                    </div>

                    {/* Product Documents */}
                    {item.documents && item.documents.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <h3 className="text-sm font-semibold text-slate-700 mb-2">Product Documents</h3>
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

                    {/* FIFO Allocation Info */}
                    {item.original_product_id && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <h3 className="text-sm font-semibold text-slate-700 mb-2">Allocation Details (FIFO)</h3>
                        <div className="space-y-2 text-sm">
                          {item.original_product_id !== item.allocated_product_id && (
                            <div className="rounded-md bg-amber-50 border border-amber-200 p-2">
                              <p className="text-amber-800 font-medium">⚠️ Product Substitution</p>
                              <p className="text-amber-700 text-xs mt-1">
                                Original product unavailable, allocated like product from supplier
                              </p>
                            </div>
                          )}
                          {item.supplier_company && (
                            <div className="flex justify-between">
                              <span className="text-slate-500">Supplier:</span>
                              <span className="font-medium text-slate-900">{item.supplier_company}</span>
                            </div>
                          )}
                          {item.warehouse_entry_date && (
                            <div className="flex justify-between">
                              <span className="text-slate-500">Warehouse Entry:</span>
                              <span className="font-medium text-slate-900">
                                {new Date(item.warehouse_entry_date).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </span>
                            </div>
                          )}
                          {item.allocated_product_id && (
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-400">Allocated Product ID:</span>
                              <span className="font-mono text-slate-600">{item.allocated_product_id.slice(0, 8)}...</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 h-fit">
            <h2 className="text-lg mb-4 font-semibold text-slate-900">Order Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium">{formatCurrency(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Delivery ({order.delivery_method})</span>
                  {isManualShipping && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Manual
                    </span>
                  )}
                </div>
                <span className="font-medium">{formatCurrency(order.delivery_fee)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Tax</span>
                <span className="font-medium">{formatCurrency(order.tax)}</span>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-900">Total</span>
                  <span className="text-lg font-bold text-slate-900">
                    {formatCurrency(order.total)}
                  </span>
                </div>
              </div>
            </div>

            {/* Shipping Cost Editor (Admin Only) */}
            {session.permissions.includes('orders.update') && (
              <div className="mt-6 pt-6 border-t border-slate-200">
                <ShippingEditor
                  orderId={order.id}
                  currentShippingFee={parseFloat(order.delivery_fee)}
                  deliveryMethod={order.delivery_method}
                  estimatedShippingFee={estimatedShippingFee}
                  isManualShipping={isManualShipping}
                  freightQuoteId={order.freight_quote_id}
                  isBooked={!!order.metadata?.shipboss_booking_id}
                  shipFromAddress={bookingWarehouse ? {
                    name: bookingWarehouse.name,
                    street: bookingWarehouse.address_street,
                    city: bookingWarehouse.address_city,
                    state: bookingWarehouse.address_state,
                    zip: bookingWarehouse.address_zip,
                  } : null}
                  shipToAddress={order.shipping_address ? {
                    name: [order.shipping_address.firstName, order.shipping_address.lastName].filter(Boolean).join(' ') || 'Customer',
                    street: order.shipping_address.line1,
                    city: order.shipping_address.city,
                    state: order.shipping_address.state,
                    zip: order.shipping_address.zipCode,
                    country: order.shipping_address.country ?? 'US',
                  } : null}
                  liftgateRequired={
                    typeof order.metadata === 'object' && order.metadata !== null
                      ? (order.metadata as Record<string, unknown>).liftgate_required === true
                      : false
                  }
                />
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Customer + Payment */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Customer */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg mb-4 flex items-center gap-2 font-semibold text-slate-900">
              <CreditCard className="h-5 w-5" />
              Customer
            </h2>
            <div className="space-y-2">
              <p className="font-medium text-slate-900">{order.user_name || 'Unknown'}</p>
              <p className="text-sm text-slate-500">{order.user_email}</p>
              <Link
                href={`/admin/users/${order.user_id}`}
                className="inline-block text-sm text-emerald-600 hover:text-emerald-700"
              >
                View customer profile →
              </Link>
            </div>
          </div>

          {/* Payment Information */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg mb-4 flex items-center gap-2 font-semibold text-slate-900">
              <CreditCard className="h-5 w-5" />
              Payment Information
            </h2>
            <div className="space-y-2 text-sm">
              {order.paymentMethod ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Card</span>
                    <span className="font-medium text-slate-900">
                      {formatCardBrand(order.paymentMethod.brand)} •••• {order.paymentMethod.last4}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Expires</span>
                    <span className="font-medium text-slate-900">
                      {order.paymentMethod.expMonth.toString().padStart(2, '0')}/{order.paymentMethod.expYear}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-slate-500">No payment method information available</p>
              )}
              {order.payment_status && (
                <div className="flex justify-between pt-2 border-t border-slate-200">
                  <span className="text-slate-500">Status</span>
                  <span className={`font-medium ${
                    order.payment_status === 'succeeded' ? 'text-primary' :
                    order.payment_status === 'failed' ? 'text-red-600' :
                    order.payment_status === 'refunded' ? 'text-orange-600' :
                    'text-slate-900'
                  }`}>
                    {order.payment_status.charAt(0).toUpperCase() + order.payment_status.slice(1)}
                  </span>
                </div>
              )}
              {order.stripe_payment_intent_id && (
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-slate-500 text-xs">Payment Intent ID</span>
                  <p className="font-mono text-xs text-slate-600 break-all">{order.stripe_payment_intent_id}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Row 3: Shipping + Billing Addresses */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Shipping Address */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg mb-4 flex items-center gap-2 font-semibold text-slate-900">
              <Truck className="h-5 w-5" />
              Shipping Address
            </h2>
            <div className="space-y-1 text-sm">
              {(order.shipping_address.firstName || order.shipping_address.lastName) && (
                <p className="font-medium text-slate-900">
                  {order.shipping_address.firstName} {order.shipping_address.lastName}
                </p>
              )}
              <p className="text-slate-500">{formatAddress(order.shipping_address)}</p>
              {order.shipping_address.phone && (
                <p className="text-slate-500">{order.shipping_address.phone}</p>
              )}
              {order.shipping_address.email && (
                <p className="text-slate-500">{order.shipping_address.email}</p>
              )}
            </div>
          </div>

          {/* Billing Address */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg mb-4 flex items-center gap-2 font-semibold text-slate-900">
              <MapPin className="h-5 w-5" />
              Billing Address
            </h2>
            <div className="space-y-1 text-sm">
              {(order.billing_address.firstName || order.billing_address.lastName) && (
                <p className="font-medium text-slate-900">
                  {order.billing_address.firstName} {order.billing_address.lastName}
                </p>
              )}
              <p className="text-slate-500">{formatAddress(order.billing_address)}</p>
              {order.billing_address.phone && (
                <p className="text-slate-500">{order.billing_address.phone}</p>
              )}
              {order.billing_address.email && (
                <p className="text-slate-500">{order.billing_address.email}</p>
              )}
            </div>
          </div>
        </div>

        {/* Row 4: Tracking Information (conditional) */}
        {(order.status === 'shipped' || order.status === 'delivered') && (() => {
          let trackingNumber: string | undefined;
          let trackingCarrier: string | undefined;
          let trackingAddedAt: string | undefined;

          if (order.metadata) {
            if (typeof order.metadata === 'string') {
              try {
                const metadata = JSON.parse(order.metadata);
                trackingNumber = metadata.tracking_number;
                trackingCarrier = metadata.tracking_carrier;
                trackingAddedAt = metadata.tracking_added_at;
              } catch {
                // Invalid JSON, ignore
              }
            } else if (typeof order.metadata === 'object') {
              trackingNumber = order.metadata.tracking_number;
              trackingCarrier = order.metadata.tracking_carrier;
              trackingAddedAt = order.metadata.tracking_added_at;
            }
          }

          if (trackingNumber) {
            return (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="text-lg mb-4 flex items-center gap-2 font-semibold text-slate-900">
                  <Truck className="h-5 w-5" />
                  Tracking Information
                </h2>
                <div className="flex flex-wrap gap-6 text-sm">
                  <div>
                    <span className="text-slate-500">Tracking Number</span>
                    <p className="font-mono font-medium text-slate-900 mt-1">{trackingNumber}</p>
                  </div>
                  {trackingCarrier && (
                    <div>
                      <span className="text-slate-500">Carrier</span>
                      <p className="font-medium text-slate-900 mt-1">{trackingCarrier}</p>
                    </div>
                  )}
                  {trackingAddedAt && (
                    <div>
                      <span className="text-slate-500">Added</span>
                      <p className="font-medium text-slate-900 mt-1">
                        {new Date(trackingAddedAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          }
          return null;
        })()}

        {/* Row 5: Shipping Logistics (NMFC, Pallet, Warehouse) */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* NMFC Information */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <NMFCInfoBox
              orderId={order.id}
              currentNMFC={order.metadata?.nmfcNumber || null}
              currentNMFCInfo={order.metadata?.nmfcInfo || null}
              warehouseAllocations={order.metadata?.warehouse_allocations}
              suggestedNMFCInfo={
                !order.metadata?.nmfcInfo && !order.metadata?.nmfcNumber
                  ? computeNmfcSuggestion(items)
                  : null
              }
            />
          </div>

          {/* Pallet Count */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <PalletInfoBox
              orderId={order.id}
              currentPalletCount={order.metadata?.palletCount || null}
            />
          </div>

          {/* Warehouse Selector */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <WarehouseSelector
              orderId={order.id}
              currentWarehouseId={order.warehouse_id || null}
              warehouseAllocations={order.metadata?.warehouse_allocations}
            />
          </div>
        </div>

        {/* Row 6: Documents (Invoice/Quote, BOL, Uploaded Invoice) */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Invoice / Quote Actions */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg mb-4 flex items-center gap-2 font-semibold text-slate-900">
              <FileText className="h-5 w-5" />
              Invoice / Quote
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <a
                    href={`/api/admin/invoices/generate?orderId=${order.id}&type=invoice`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Invoice
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <a
                    href={`/api/admin/invoices/generate?orderId=${order.id}&type=quote`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Receipt className="h-4 w-4 mr-1" />
                    Quote
                  </a>
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <a
                    href={`/api/admin/invoices/generate?orderId=${order.id}&type=invoice&download=true`}
                    download={`invoice-${order.order_number}.pdf`}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <a
                    href={`/api/admin/invoices/generate?orderId=${order.id}&type=quote&download=true`}
                    download={`quote-${order.order_number}.pdf`}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </a>
                </Button>
              </div>
            </div>
          </div>

          {/* Bill of Lading */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg mb-4 flex items-center gap-2 font-semibold text-slate-900">
              <ClipboardList className="h-5 w-5" />
              Bill of Lading
            </h2>
            <div className="space-y-3">
              <BOLEmailButton orderId={order.id} orderNumber={order.order_number} />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <a
                    href={`/api/admin/orders/${order.id}/bill-of-lading`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ClipboardList className="h-4 w-4 mr-1" />
                    View
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <a
                    href={`/api/admin/orders/${order.id}/bill-of-lading?download=true`}
                    download={`BOL-${order.order_number}.pdf`}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </a>
                </Button>
              </div>
            </div>
          </div>

          {/* Uploaded Invoice (if exists) */}
          {order.metadata ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg mb-4 flex items-center gap-2 font-semibold text-slate-900">
                <FileText className="h-5 w-5" />
                Uploaded Invoice
              </h2>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">{order.metadata?.invoice_filename || 'Invoice'}</p>
                  {order.metadata?.invoice_state && (
                    <p className="text-slate-500 mt-1">
                      State: {order.metadata.invoice_state}
                    </p>
                  )}
                  {order.metadata?.invoice_uploaded_at && (
                    <p className="text-slate-500">
                      Uploaded: {new Date(order.metadata.invoice_uploaded_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  )}
                </div>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <a
                    href={`/api/invoice/download?orderId=${order.id}&admin=true`}
                    download={order.metadata?.invoice_filename}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg mb-4 flex items-center gap-2 font-semibold text-slate-900">
                <FileText className="h-5 w-5" />
                Uploaded Invoice
              </h2>
              <p className="text-sm text-slate-500">No invoice uploaded</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  } catch (error) {
    // Don't log NEXT_REDIRECT as an error - it's expected behavior
    if (error && typeof error === 'object' && 'digest' in error && 
        typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) {
      // Re-throw redirect errors without logging
      throw error;
    }
    console.error('❌ Order Detail Page Error:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack');
    throw error; // Re-throw to show error page
  }
}

