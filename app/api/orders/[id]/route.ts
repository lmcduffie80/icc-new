import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { query, queryOne } from '@/lib/db';
import { getPaymentMethodFromIntent } from '@/lib/stripe';

interface Address {
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
}

interface DbOrder {
  id: string;
  user_id: string;
  order_number: string;
  status: string;
  shipping_address: Address;
  billing_address: Address;
  delivery_method: string;
  delivery_fee: string;
  subtotal: string;
  tax: string;
  tax_rate: string | null;
  total: string;
  stripe_payment_intent_id: string | null;
  payment_status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface DbOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  price: string;
  quantity: number;
  image: string;
  unit_of_measure: string | null;
}

// GET: Fetch a single order by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Fetch the order and verify ownership
    const order = await queryOne<DbOrder>(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
      [id, session.user.id]
    );

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Fetch order items
    const items = await query<DbOrderItem>(
      `SELECT * FROM order_items WHERE order_id = $1`,
      [order.id]
    );

    // Fetch payment method details if available
    let paymentMethod = null;
    if (order.stripe_payment_intent_id) {
      try {
        paymentMethod = await getPaymentMethodFromIntent(order.stripe_payment_intent_id);
      } catch (paymentError) {
        // Log but don't fail the request if payment method fetch fails
        console.error('Error fetching payment method:', paymentError);
        paymentMethod = null;
      }
    }

    // Safely parse numeric fields with fallbacks
    const deliveryFee = parseFloat(order.delivery_fee) || 0;
    const subtotal = parseFloat(order.subtotal) || 0;
    const tax = parseFloat(order.tax) || 0;
    const total = parseFloat(order.total) || 0;
    const taxRate = order.tax_rate ? (parseFloat(order.tax_rate) || null) : null;

    return NextResponse.json({
      order: {
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        shippingAddress: order.shipping_address,
        billingAddress: order.billing_address,
        deliveryMethod: order.delivery_method,
        deliveryFee,
        subtotal,
        tax,
        taxRate,
        total,
        paymentIntentId: order.stripe_payment_intent_id,
        paymentStatus: order.payment_status,
        paymentMethod,
        invoiceMetadata: order.metadata || null,
        createdAt: order.created_at,
        items: items.map((item) => ({
          id: item.id,
          productId: item.product_id,
          name: item.name,
          price: parseFloat(item.price) || 0,
          quantity: item.quantity,
          image: item.image,
          unitOfMeasure: item.unit_of_measure,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { 
        error: 'Failed to fetch order',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

