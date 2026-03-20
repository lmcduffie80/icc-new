import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { getStoreInfo } from '@/lib/store-info';
import { Resend } from 'resend';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@example.com';

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

interface Address {
  firstName?: string;
  lastName?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zipCode: string;
  email?: string;
  phone?: string;
}

interface Order {
  id: string;
  order_number: string;
  user_id: string;
  status: string;
  shipping_address: Address | string;
  billing_address: Address | string;
  delivery_method: string;
  delivery_fee: string;
  subtotal: string;
  tax: string;
  total: string;
  created_at: string;
  user_email: string;
  user_name: string;
}

interface OrderItem {
  id: string;
  name: string;
  price: string;
  quantity: number;
  unit_of_measure: string | null;
}

// POST /api/admin/invoices/email
export async function POST(request: NextRequest) {
  const auth = await requireAdmin('orders.view');
  if (auth.error) return auth.error;

  const ip = getClientIp(request);

  try {
    const body = await request.json();
    const { orderId, type = 'invoice', email } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: 'Email address is required' }, { status: 400 });
    }

    if (type !== 'invoice' && type !== 'quote') {
      return NextResponse.json({ error: 'Type must be invoice or quote' }, { status: 400 });
    }

    // Fetch order
    const order = await queryOne<Order>(
      `SELECT o.*, u.email as user_email, u.name as user_name
       FROM orders o
       JOIN "user" u ON u.id = o.user_id
       WHERE o.id = $1`,
      [orderId]
    );

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Fetch order items
    const items = await query<OrderItem>(
      `SELECT id, name, price, quantity, unit_of_measure
       FROM order_items
       WHERE order_id = $1
       ORDER BY name`,
      [orderId]
    );

    // Get store info
    const storeInfo = await getStoreInfo();

    // Parse addresses
    const shippingAddress = typeof order.shipping_address === 'string'
      ? JSON.parse(order.shipping_address)
      : order.shipping_address;
    const billingAddress = typeof order.billing_address === 'string'
      ? JSON.parse(order.billing_address)
      : order.billing_address;

    // Import the invoice HTML generation - we'll use a simplified version for email
    // The full invoice will be available via the link

    // Generate invoice URL for email
    const invoiceUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/admin/invoices/generate?orderId=${orderId}&type=${type}`;
    const documentTitle = type === 'quote' ? 'Quote' : 'Invoice';
    const documentNumber = type === 'quote' ? `QT-${order.order_number}` : `INV-${order.order_number}`;

    // Send email
    const resend = getResendClient();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `${documentTitle} ${documentNumber} - Order ${order.order_number}`,
      html: generateInvoiceEmailHTML({
        invoiceUrl,
        documentTitle,
        documentNumber,
        orderNumber: order.order_number,
        storeInfo,
        order,
        items,
        shippingAddress,
        billingAddress,
      }),
      text: generateInvoiceEmailText({
        documentTitle,
        documentNumber,
        orderNumber: order.order_number,
        invoiceUrl,
      }),
    });

    securityLogger.logEvent({
      type: 'admin_action',
      userId: auth.session.adminUser.id,
      ip,
      path: '/api/admin/invoices/email',
      method: 'POST',
      details: {
        orderId,
        orderNumber: order.order_number,
        recipient: email,
        type,
        messageId: result.data?.id,
        success: true,
      },
      severity: 'low',
    });

    return NextResponse.json({
      success: true,
      messageId: result.data?.id,
    });
  } catch (error) {
    console.error('Error sending invoice email:', error);
    securityLogger.logError('Failed to send invoice email', error, ip);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send email' },
      { status: 500 }
    );
  }
}

interface InvoiceEmailData {
  invoiceUrl: string;
  documentTitle: string;
  documentNumber: string;
  orderNumber: string;
  storeInfo: Awaited<ReturnType<typeof getStoreInfo>>;
  order: Order;
  items: OrderItem[];
  shippingAddress: Address;
  billingAddress: Address;
}

function generateInvoiceEmailHTML(data: InvoiceEmailData): string {
  const { invoiceUrl, documentTitle, documentNumber, orderNumber, storeInfo, order, items } = data;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${documentTitle} ${documentNumber}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; background: #f3f4f6; padding: 20px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <a href="https://innovativecropcare.com">
        <img src="https://innovativecropcare.com/logo.png" alt="${storeInfo.store_name} Logo" style="max-height: 50px; width: auto;" />
      </a>
    </div>
    
    <h1 style="color: #059669; font-size: 24px; margin-bottom: 10px;">${documentTitle} ${documentNumber}</h1>
    <p style="color: #6b7280; font-size: 16px; margin-bottom: 20px;">
      Your ${documentTitle.toLowerCase()} for Order ${orderNumber} is attached below.
    </p>
    
    <div style="background: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 5px 0;"><strong>Order Number:</strong> ${orderNumber}</p>
      <p style="margin: 5px 0;"><strong>Total:</strong> ${formatCurrency(order.total)}</p>
      <p style="margin: 5px 0;"><strong>Items:</strong> ${items.length} item(s)</p>
      <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 14px;">
        View the complete ${documentTitle.toLowerCase()} with all details using the link below.
      </p>
    </div>
    
    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <a href="${invoiceUrl}" style="display: inline-block; background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        View ${documentTitle} Online
      </a>
    </div>
    
    <p style="color: #6b7280; font-size: 14px; margin-top: 20px; text-align: center;">
      If you have any questions, please contact ${storeInfo.support_email} or call ${storeInfo.phone}
    </p>
  </div>
</body>
</html>`;
}

function generateInvoiceEmailText(data: {
  documentTitle: string;
  documentNumber: string;
  orderNumber: string;
  invoiceUrl: string;
}): string {
  return `
${data.documentTitle} ${data.documentNumber}

Your ${data.documentTitle.toLowerCase()} for Order ${data.orderNumber} is available at:
${data.invoiceUrl}

Thank you for your business!
`;
}

function formatCurrency(amount: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    parseFloat(amount)
  );
}

