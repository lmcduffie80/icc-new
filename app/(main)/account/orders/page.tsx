'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { PriceWithUnit } from '@/components/ui/price-with-unit';
import { ArrowLeft, Package, Truck, CheckCircle, Clock, XCircle, Loader2, Copy } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { getImageProxyUrl } from '@/lib/image-proxy';

type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

type OrderItem = {
  id: string;
  productId: string;
  name: string; 
  quantity: number;
  price: number;
  image: string;
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

const statusConfig = {
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

export default function OrdersPage() {
  const router = useRouter();
  const { user, isPending: isAuthPending } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthPending && !user) {
      router.push('/auth/sign-in');
    }
  }, [user, isAuthPending, router]);

  useEffect(() => {
    if (user) {
      fetchOrders();
    }
  }, [user]);

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/orders');
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }
      const data = await response.json();
      setOrders(data.orders);
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError('Unable to load your orders. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isAuthPending || isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
          <span className="text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/account"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Account
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">My Orders</h1>
          <p className="text-muted-foreground mt-1">
            View and track all your orders
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
            <p className="text-red-600">{error}</p>
            <Button variant="outline" className="mt-4" onClick={fetchOrders}>
              Try Again
            </Button>
          </div>
        )}

        {/* Orders List */}
        {!error && orders.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No orders yet</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              When you place an order, it will appear here. Start shopping to see your orders!
            </p>
            <Button asChild>
              <Link href="/shop">Browse Products</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const status = statusConfig[order.status];
              const StatusIcon = status.icon;

              return (
                <div
                  key={order.id}
                  className="bg-card border border-border rounded-xl overflow-hidden"
                >
                  {/* Order Header */}
                  <div className="p-6 border-b border-border bg-muted/30">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-6">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">
                            Order Number
                          </p>
                          <p className="font-mono font-medium">{order.orderNumber}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">
                            Date
                          </p>
                          <p className="font-medium">
                            {new Date(order.createdAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">
                            Total
                          </p>
                          <p className="font-medium">{formatPrice(order.total)}</p>
                        </div>
                        {order.trackingNumber && (
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">
                              Tracking Number
                            </p>
                            <div className="flex items-center gap-2">
                              <p className="font-mono font-medium text-sm">{order.trackingNumber}</p>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(order.trackingNumber!);
                                }}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                title="Copy tracking number"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {order.trackingCarrier && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {order.trackingCarrier}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${status.color}`}>
                        <StatusIcon className="h-4 w-4" />
                        {status.label}
                      </div>
                    </div>
                  </div>

                  {/* Order Items */}
                  <div className="p-6">
                    <div className="space-y-4">
                      {order.items.map((item) => {
                        // AGGRESSIVE S3 URL DETECTION: Convert ANY URL containing amazonaws.com to proxy
                        // This prevents Next.js Image errors for all S3 URL formats
                        let imageUrl: string;
                        if (!item.image) {
                          imageUrl = '/placeholder.png';
                        } else if (item.image.includes('/api/images/proxy')) {
                          // Already a proxy URL
                          imageUrl = item.image;
                        } else if (item.image.includes('amazonaws.com')) {
                          // S3 URL - convert to proxy immediately
                          imageUrl = `/api/images/proxy?url=${encodeURIComponent(item.image)}`;
                        } else {
                          // Try getImageProxyUrl first, then fallback to original
                          imageUrl = getImageProxyUrl(item.image) || item.image;
                        }
                        
                        return (
                          <div key={item.id} className="flex items-center gap-4">
                            <div className="h-16 w-16 rounded-lg bg-muted overflow-hidden flex-shrink-0 relative">
                              <Image
                                src={imageUrl}
                                alt={item.name}
                                fill
                                className="object-cover"
                                unoptimized={true}
                              />
                            </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium truncate">{item.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              Qty: {item.quantity} × <PriceWithUnit price={item.price} unitOfMeasure={item.unitOfMeasure} />
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">
                              {formatPrice(item.quantity * item.price)}
                            </p>
                          </div>
                        </div>
                        );
                      })}
                    </div>

                    {/* Order Actions */}
                    <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-border">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/checkout/thank-you?orderId=${order.id}`}>
                          View Details
                        </Link>
                      </Button>
                      {order.status === 'shipped' && order.trackingNumber && (
                        <Button size="sm" asChild>
                          <a 
                            href={
                              order.trackingCarrier?.toLowerCase().includes('ups') ? 
                                `https://www.ups.com/track?tracknum=${order.trackingNumber}` :
                              order.trackingCarrier?.toLowerCase().includes('fedex') ?
                                `https://www.fedex.com/fedextrack/?trknbr=${order.trackingNumber}` :
                              order.trackingCarrier?.toLowerCase().includes('usps') ?
                                `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${order.trackingNumber}` :
                              order.trackingCarrier?.toLowerCase().includes('dhl') ?
                                `https://www.dhl.com/en/express/tracking.html?AWB=${order.trackingNumber}` :
                              '#'
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Track Order
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
