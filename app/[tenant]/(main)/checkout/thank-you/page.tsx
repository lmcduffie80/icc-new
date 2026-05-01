'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { PriceWithUnit } from '@/components/ui/price-with-unit';
import { formatPrice } from '@/lib/utils';
import { getImageProxyUrl } from '@/lib/image-proxy';
import {
  CheckCircle,
  Package,
  Truck,
  Clock,
  XCircle,
  ArrowLeft,
  Copy,
  Loader2,
  ShoppingBag,
  MapPin,
  CreditCard,
} from 'lucide-react';

type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

type OrderItem = {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  price: number;
  image: string | null;
  unitOfMeasure?: string | null;
};

type Order = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: OrderStatus;
  total: number;
  subtotal: number;
  tax: number;
  taxRate?: number | null;
  deliveryFee: number;
  deliveryMethod: string;
  items: OrderItem[];
  paymentIntentId?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
  invoiceMetadata?: {
    invoice_url: string;
    invoice_state: string;
    invoice_uploaded_at: string;
    invoice_filename: string;
    invoice_file_type: string;
  } | null;
  trackingNumber?: string | null;
  trackingCarrier?: string | null;
  shippingAddress: {
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
};

const statusConfig: Record<OrderStatus, { label: string; icon: React.ElementType; color: string }> = {
  pending: {
    label: 'Pending',
    icon: Clock,
    color: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  },
  processing: {
    label: 'Processing',
    icon: Package,
    color: 'text-primary bg-blue-50 border-blue-200',
  },
  shipped: {
    label: 'Shipped',
    icon: Truck,
    color: 'text-purple-600 bg-purple-50 border-purple-200',
  },
  delivered: {
    label: 'Delivered',
    icon: CheckCircle,
    color: 'text-primary bg-green-50 border-green-200',
  },
  cancelled: {
    label: 'Cancelled',
    icon: XCircle,
    color: 'text-red-600 bg-red-50 border-red-200',
  },
};

function getTrackingUrl(carrier: string, trackingNumber: string): string {
  const c = carrier.toLowerCase();
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${trackingNumber}`;
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
  if (c.includes('usps')) return `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${trackingNumber}`;
  if (c.includes('dhl')) return `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`;
  return '#';
}

function getItemImageUrl(image: string | null | undefined): string {
  if (!image) return '/placeholder.png';
  return getImageProxyUrl(image, 128) || image;
}

function ThankYouContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedTracking, setCopiedTracking] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setError('No order ID provided.');
      setIsLoading(false);
      return;
    }

    const fetchOrder = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/orders/${orderId}`);
        if (response.status === 401) {
          window.location.href = `/auth/sign-in?redirect=/checkout/thank-you?orderId=${orderId}`;
          return;
        }
        if (!response.ok) {
          throw new Error('Order not found.');
        }
        const data = await response.json();
        setOrder(data.order);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load order details.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

  const copyTracking = async (trackingNumber: string) => {
    await navigator.clipboard.writeText(trackingNumber);
    setCopiedTracking(true);
    setTimeout(() => setCopiedTracking(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
          <span className="text-muted-foreground">Loading order details...</span>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 mb-4">
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Order Not Found</h1>
          <p className="text-muted-foreground mb-6">
            {error || 'We could not find this order.'}
          </p>
          <Button asChild>
            <Link href="/account/orders">View All Orders</Link>
          </Button>
        </div>
      </div>
    );
  }

  const status = statusConfig[order.status] ?? statusConfig.pending;
  const StatusIcon = status.icon;
  const addr = order.shippingAddress;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">

        {/* Back link */}
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Orders
        </Link>

        {/* Confirmation header */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-semibold text-green-900 mb-2">Order Confirmed!</h1>
          <p className="text-green-700 mb-1">
            Thank you for your order. We&apos;ll send you a confirmation email shortly.
          </p>
          <p className="text-sm text-green-600 font-mono font-medium">
            Order #{order.orderNumber}
          </p>
        </div>

        {/* Order summary card */}
        <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
          {/* Header */}
          <div className="p-6 border-b border-border bg-muted/30">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Order Number</p>
                  <p className="font-mono font-medium">{order.orderNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Date Placed</p>
                  <p className="font-medium">
                    {new Date(order.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
                  <p className="font-medium">{formatPrice(order.total)}</p>
                </div>
              </div>
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${status.color}`}>
                <StatusIcon className="h-4 w-4" />
                {status.label}
              </div>
            </div>
          </div>

          {/* Tracking */}
          {order.trackingNumber && (
            <div className="px-6 py-4 border-b border-border bg-blue-50/50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Tracking Number</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-sm">{order.trackingNumber}</span>
                    <button
                      onClick={() => copyTracking(order.trackingNumber!)}
                      className="text-muted-foreground hover:text-foreground transition-colors hover:cursor-pointer"
                      title="Copy tracking number"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {copiedTracking && (
                      <span className="text-xs text-green-600">Copied!</span>
                    )}
                  </div>
                  {order.trackingCarrier && (
                    <p className="text-xs text-muted-foreground mt-0.5">{order.trackingCarrier}</p>
                  )}
                </div>
                {order.trackingCarrier && (
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={getTrackingUrl(order.trackingCarrier, order.trackingNumber)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Truck className="h-3.5 w-3.5 mr-1.5" />
                      Track Shipment
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Items */}
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Items Ordered
              </h2>
            </div>
            <div className="space-y-4">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-lg bg-white border border-border overflow-hidden flex-shrink-0 relative">
                    <Image
                      src={getItemImageUrl(item.image)}
                      alt={item.name}
                      fill
                      className="object-contain p-1"
                      unoptimized={true}
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.src = '/placeholder.png';
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium truncate">{item.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Qty: {item.quantity} ×{' '}
                      <PriceWithUnit price={item.price} unitOfMeasure={item.unitOfMeasure} />
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatPrice(item.quantity * item.price)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Order totals */}
            <div className="mt-6 pt-6 border-t border-border space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPrice(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {order.deliveryMethod === 'pickup' ? 'Pickup' : 'Shipping'}
                </span>
                <span>
                  {order.deliveryFee === 0 ? 'Free' : formatPrice(order.deliveryFee)}
                </span>
              </div>
              {order.tax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Tax{order.taxRate ? ` (${(order.taxRate * 100).toFixed(2)}%)` : ''}
                  </span>
                  <span>{formatPrice(order.tax)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold pt-2 border-t border-border">
                <span>Total</span>
                <span>{formatPrice(order.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Shipping & Payment info */}
        <div className="grid sm:grid-cols-2 gap-6 mb-8">
          {/* Shipping address */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Shipping Address
              </h2>
            </div>
            <address className="not-italic text-sm space-y-0.5">
              {(addr.firstName || addr.lastName) && (
                <p className="font-medium">
                  {[addr.firstName, addr.lastName].filter(Boolean).join(' ')}
                </p>
              )}
              <p>{addr.line1}</p>
              {addr.line2 && <p>{addr.line2}</p>}
              <p>
                {addr.city}, {addr.state} {addr.zipCode}
              </p>
              {addr.country && <p>{addr.country}</p>}
              {addr.phone && (
                <p className="text-muted-foreground mt-1">{addr.phone}</p>
              )}
            </address>
          </div>

          {/* Payment info */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Payment
              </h2>
            </div>
            {order.paymentMethod ? (
              <div className="text-sm space-y-1">
                <p className="font-medium capitalize">
                  {order.paymentMethod.brand} ending in {order.paymentMethod.last4}
                </p>
                <p className="text-muted-foreground">
                  Expires {order.paymentMethod.expMonth}/{order.paymentMethod.expYear}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Payment information unavailable</p>
            )}
            {order.paymentStatus && (
              <p className="text-xs text-muted-foreground mt-2 capitalize">
                Status: {order.paymentStatus.replace(/_/g, ' ')}
              </p>
            )}

            {/* Invoice */}
            {order.invoiceMetadata?.invoice_url && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Invoice</p>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={order.invoiceMetadata.invoice_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Download Invoice
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/shop">
              <ShoppingBag className="h-4 w-4 mr-2" />
              Continue Shopping
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/account/orders">View All Orders</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ThankYouPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
            <span className="text-muted-foreground">Loading...</span>
          </div>
        </div>
      }
    >
      <ThankYouContent />
    </Suspense>
  );
}
