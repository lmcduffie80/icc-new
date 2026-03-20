import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { getStoreInfo } from '@/lib/store-info';
import { generatePDFWithPDFShift } from '@/lib/pdf-generation';
import { getLogoDataURI } from '@/lib/logo-utils';

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

// GET /api/admin/invoices/generate?orderId=xxx&type=invoice|quote
export async function GET(request: NextRequest) {
  const auth = await requireAdmin('orders.view');
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('orderId');
  const type = searchParams.get('type') || 'invoice'; // 'invoice' or 'quote'
  const download = searchParams.get('download') === 'true'; // If true, generate PDF for download

  if (!orderId) {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
  }

  if (type !== 'invoice' && type !== 'quote') {
    return NextResponse.json({ error: 'Type must be invoice or quote' }, { status: 400 });
  }

  try {
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

    // Generate HTML invoice/quote
    const html = generateInvoiceHTML({
      order,
      items,
      storeInfo,
      shippingAddress,
      billingAddress,
      type: type as 'invoice' | 'quote',
    });

    // If download=true, generate PDF using PDFShift
    if (download) {
      try {
        const pdfBuffer = await generatePDFWithPDFShift(html);
        const filename = `${type}-${order.order_number}.pdf`;
        
        return new NextResponse(new Uint8Array(pdfBuffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'private, no-cache',
          },
        });
      } catch (pdfError) {
        console.error('Error generating PDF with PDFShift:', pdfError);
        // Fallback to HTML if PDF generation fails
        const filename = `${type}-${order.order_number}.html`;
        return new NextResponse(html, {
          headers: {
            'Content-Type': 'text/html',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        });
      }
    }

    // Return HTML for viewing (browsers can print to PDF using Print > Save as PDF)
    const filename = `${type}-${order.order_number}.html`;
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error generating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to generate invoice' },
      { status: 500 }
    );
  }
}

interface InvoiceData {
  order: Order;
  items: OrderItem[];
  storeInfo: Awaited<ReturnType<typeof getStoreInfo>>;
  shippingAddress: Address;
  billingAddress: Address;
  type: 'invoice' | 'quote';
}

function generateInvoiceHTML(data: InvoiceData): string {
  const { order, items, storeInfo, shippingAddress, billingAddress, type } = data;
  const isQuote = type === 'quote';
  const documentTitle = isQuote ? 'Quote' : 'Invoice';
  const documentNumber = isQuote ? `QT-${order.order_number}` : `INV-${order.order_number}`;

  const formatCurrency = (amount: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      parseFloat(amount)
    );

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  const itemsHTML = items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.name}</td>
      <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e5e7eb;">${item.quantity}${item.unit_of_measure ? ` ${item.unit_of_measure}` : ''}</td>
      <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb;">${formatCurrency(item.price)}</td>
      <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb;">${formatCurrency((parseFloat(item.price) * item.quantity).toString())}</td>
    </tr>
  `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${documentTitle} ${documentNumber}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background: #ffffff;
      padding: 40px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid #059669;
    }
    .company-info {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      gap: 20px;
    }
    .logo-container {
      flex-shrink: 0;
    }
    .logo-container img {
      max-height: 60px;
      width: auto;
      object-fit: contain;
    }
    .company-details p {
      color: #6b7280;
      font-size: 14px;
      margin: 2px 0;
    }
    .document-info {
      text-align: right;
    }
    .document-info h2 {
      font-size: 24px;
      color: #1f2937;
      margin-bottom: 8px;
    }
    .document-info p {
      color: #6b7280;
      font-size: 14px;
      margin: 2px 0;
    }
    .details-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-bottom: 40px;
    }
    .section {
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
    }
    .section h3 {
      color: #059669;
      font-size: 16px;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .section p {
      margin: 4px 0;
      font-size: 14px;
      color: #374151;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    thead {
      background: #f3f4f6;
    }
    th {
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #374151;
      border-bottom: 2px solid #e5e7eb;
    }
    th:last-child,
    td:last-child {
      text-align: right;
    }
    th:nth-child(2),
    td:nth-child(2) {
      text-align: center;
    }
    tbody tr:hover {
      background: #f9fafb;
    }
    .totals {
      margin-left: auto;
      width: 300px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .totals-row:last-child {
      border-bottom: none;
    }
    .totals-row.total {
      font-size: 18px;
      font-weight: 700;
      color: #059669;
      margin-top: 8px;
      padding-top: 12px;
      border-top: 2px solid #059669;
    }
    .footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
    }
    @media print {
      body {
        padding: 20px;
      }
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="company-info">
        <div class="logo-container">
          <img src="${getLogoDataURI()}" alt="${storeInfo.store_name} Logo" />
        </div>
        <div class="company-details">
          <p>${storeInfo.address_street}</p>
          <p>${storeInfo.address_city}, ${storeInfo.address_state} ${storeInfo.address_zip}</p>
          <p>Phone: ${storeInfo.phone}</p>
          <p>Email: ${storeInfo.email}</p>
        </div>
      </div>
      <div class="document-info">
        <h2>${documentTitle}</h2>
        <p><strong>${documentNumber}</strong></p>
        <p>Date: ${formatDate(order.created_at)}</p>
        <p>Order #: ${order.order_number}</p>
        ${isQuote ? '<p style="color: #f59e0b; font-weight: 600;">QUOTE - NOT AN INVOICE</p>' : ''}
      </div>
    </div>

    <div class="details-section">
      <div class="section">
        <h3>Bill To</h3>
        <p><strong>${billingAddress.firstName || ''} ${billingAddress.lastName || ''}</strong></p>
        <p>${billingAddress.line1}</p>
        ${billingAddress.line2 ? `<p>${billingAddress.line2}</p>` : ''}
        <p>${billingAddress.city}, ${billingAddress.state} ${billingAddress.zipCode}</p>
        ${billingAddress.email ? `<p>${billingAddress.email}</p>` : ''}
        ${billingAddress.phone ? `<p>${billingAddress.phone}</p>` : ''}
      </div>
      <div class="section">
        <h3>Ship To</h3>
        <p><strong>${shippingAddress.firstName || ''} ${shippingAddress.lastName || ''}</strong></p>
        <p>${shippingAddress.line1}</p>
        ${shippingAddress.line2 ? `<p>${shippingAddress.line2}</p>` : ''}
        <p>${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.zipCode}</p>
        ${shippingAddress.email ? `<p>${shippingAddress.email}</p>` : ''}
        ${shippingAddress.phone ? `<p>${shippingAddress.phone}</p>` : ''}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Quantity</th>
          <th>Unit Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row">
        <span>Subtotal:</span>
        <span>${formatCurrency(order.subtotal)}</span>
      </div>
      <div class="totals-row">
        <span>Delivery (${order.delivery_method}):</span>
        <span>${formatCurrency(order.delivery_fee)}</span>
      </div>
      <div class="totals-row">
        <span>Tax:</span>
        <span>${formatCurrency(order.tax)}</span>
      </div>
      <div class="totals-row total">
        <span>Total:</span>
        <span>${formatCurrency(order.total)}</span>
      </div>
    </div>

    <div class="footer">
      <p>Thank you for your business!</p>
      <p>For questions, please contact ${storeInfo.support_email} or call ${storeInfo.phone}</p>
      ${isQuote ? '<p style="margin-top: 10px; color: #f59e0b;"><strong>This is a quote and not a binding invoice.</strong></p>' : ''}
    </div>
  </div>
</body>
</html>`;
}

