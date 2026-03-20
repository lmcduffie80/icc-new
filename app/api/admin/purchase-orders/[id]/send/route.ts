import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { query, queryOne } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { generatePDFWithPDFShift } from '@/lib/pdf-generation';
import { generateTermsHTML } from '@/lib/terms-formatter';
import { Resend } from 'resend';

const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@example.com';

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }
  return new Resend(apiKey);
}

interface PurchaseOrder {
  id: number;
  po_number: string;
  vendor_id: number | null;
  supplier_id: string | null;
  order_date: string;
  buyer_name: string;
  payment_terms: string;
  ship_to_address_id: number;
  bill_to_address_id: number;
  currency: string;
  tax_rate: number;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  notes: string | null;
}

interface Address {
  id: number;
  type: string;
  company_name: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  zip_code: string;
  country: string;
}

interface Vendor {
  id: number;
  vendor_number: string;
  name: string;
}

interface Supplier {
  id: string;
  supplier_number: string | null;
  name: string;
  company_name: string;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
}

interface LineItem {
  id: number;
  purchase_order_id: number;
  line_number: number;
  item_number: string;
  description: string;
  need_by_date: string | null;
  quantity: number;
  uom: string;
  unit_price: number;
  taxable: boolean;
  line_total: number;
}

/**
 * Generate HTML for Purchase Order Terms and Conditions
 */
async function generateTermsAndConditionsHTML(): Promise<string> {
  // Fetch active terms from database
  const terms = await queryOne<{
    title: string;
    content: string;
  }>(
    'SELECT title, content FROM terms_and_conditions WHERE is_active = true'
  );
  
  if (!terms) {
    // Fallback to default if no terms in database
    throw new Error('No active terms and conditions found in database');
  }
  
  // Use the formatter to generate HTML from database content
  return generateTermsHTML(terms.title, terms.content);
}

// POST /api/admin/purchase-orders/[id]/send
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const ip = getClientIp(request);
  const { id } = await params;

  try {
    const body = await request.json();
    const { to, subject, message } = body;

    if (!to || !subject) {
      return NextResponse.json(
        { error: 'Email address and subject are required' },
        { status: 400 }
      );
    }

    // Fetch purchase order
    const po = await queryOne<PurchaseOrder>(
      `SELECT id, po_number, vendor_id, supplier_id, order_date, buyer_name, payment_terms,
              ship_to_address_id, bill_to_address_id, currency, tax_rate,
              subtotal_amount, tax_amount, total_amount, status, notes
       FROM purchase_orders
       WHERE id = $1`,
      [id]
    );

    if (!po) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    // Fetch vendor or supplier
    let vendor: Vendor | null = null;
    let supplier: Supplier | null = null;
    let vendorOrSupplierName: string;

    if (po.vendor_id) {
      vendor = await queryOne<Vendor>(
        'SELECT id, vendor_number, name FROM vendors WHERE id = $1',
        [po.vendor_id]
      );

      if (!vendor) {
        return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
      }
      vendorOrSupplierName = vendor.name;
    } else if (po.supplier_id) {
      supplier = await queryOne<Supplier>(
        'SELECT id, supplier_number, name, company_name, address_street, address_city, address_state, address_zip FROM supplier_users WHERE id = $1',
        [po.supplier_id]
      );

      if (!supplier) {
        return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
      }
      vendorOrSupplierName = supplier.company_name || supplier.name;
    } else {
      return NextResponse.json({ error: 'Purchase order must have either a vendor or supplier' }, { status: 400 });
    }

    // Fetch addresses
    const billToAddress = await queryOne<Address>(
      'SELECT id, type, company_name, address1, address2, city, state, zip_code, country FROM addresses WHERE id = $1',
      [po.bill_to_address_id]
    );

    const shipToAddress = await queryOne<Address>(
      'SELECT id, type, company_name, address1, address2, city, state, zip_code, country FROM addresses WHERE id = $1',
      [po.ship_to_address_id]
    );

    if (!billToAddress || !shipToAddress) {
      return NextResponse.json({ error: 'Address not found' }, { status: 404 });
    }

    // Fetch line items
    const lineItems = await query<LineItem>(
      `SELECT id, purchase_order_id, line_number, item_number, description, need_by_date,
              quantity, uom, unit_price, taxable, line_total
       FROM purchase_order_lines
       WHERE purchase_order_id = $1
       ORDER BY line_number`,
      [id]
    );

    if (!lineItems || lineItems.length === 0) {
      return NextResponse.json({ error: 'No line items found' }, { status: 404 });
    }

    // Format payment terms
    const formatPaymentTerms = (terms: string) => {
      return terms.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    // Format currency
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: po.currency || 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    };

    // Format date
    const formatDate = (dateString: string) => {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    };

    // Generate HTML for PDF
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Purchase Order ${po.po_number}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
      color: #333;
      font-size: 12px;
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
      border-bottom: 2px solid #059669;
      padding-bottom: 20px;
    }
    .header-left h1 {
      margin: 0;
      color: #059669;
      font-size: 28px;
      font-weight: bold;
    }
    .header-right {
      text-align: right;
    }
    .po-number {
      font-size: 18px;
      font-weight: bold;
      color: #333;
      margin-bottom: 5px;
    }
    .po-date {
      color: #666;
    }
    .addresses {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }
    .address-box {
      width: 48%;
      border: 1px solid #ddd;
      padding: 15px;
      background-color: #f9fafb;
    }
    .address-box h3 {
      margin: 0 0 10px 0;
      font-size: 14px;
      font-weight: bold;
      color: #059669;
      border-bottom: 1px solid #ddd;
      padding-bottom: 5px;
    }
    .address-box p {
      margin: 3px 0;
      line-height: 1.6;
    }
    .address-company {
      font-weight: bold;
      font-size: 13px;
      margin-bottom: 5px;
    }
    .vendor-info {
      margin-bottom: 20px;
    }
    .vendor-info p {
      margin: 3px 0;
    }
    .vendor-label {
      font-weight: bold;
      color: #666;
    }
    .line-items {
      margin-bottom: 30px;
    }
    .line-items h3 {
      margin: 0 0 15px 0;
      font-size: 16px;
      font-weight: bold;
      color: #333;
      border-bottom: 2px solid #059669;
      padding-bottom: 5px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    thead {
      background-color: #059669;
      color: white;
    }
    th {
      padding: 10px;
      text-align: left;
      font-weight: bold;
      font-size: 11px;
    }
    td {
      padding: 8px 10px;
      border-bottom: 1px solid #ddd;
      font-size: 11px;
    }
    tbody tr:hover {
      background-color: #f9fafb;
    }
    .text-right {
      text-align: right;
    }
    .text-center {
      text-align: center;
    }
    .totals {
      margin-top: 20px;
      margin-left: auto;
      width: 300px;
    }
    .totals table {
      margin: 0;
    }
    .totals td {
      border: none;
      padding: 5px 10px;
    }
    .totals td:first-child {
      text-align: right;
      font-weight: bold;
      width: 60%;
    }
    .totals td:last-child {
      text-align: right;
      width: 40%;
    }
    .total-row {
      font-weight: bold;
      font-size: 14px;
      border-top: 2px solid #333;
      padding-top: 8px;
    }
    .notes {
      margin-top: 30px;
      padding: 15px;
      background-color: #f9fafb;
      border: 1px solid #ddd;
    }
    .notes h3 {
      margin: 0 0 10px 0;
      font-size: 14px;
      font-weight: bold;
      color: #333;
    }
    .notes p {
      margin: 0;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>PURCHASE ORDER</h1>
      <div class="vendor-info">
        ${vendor ? `
          <p><span class="vendor-label">Vendor:</span> ${vendor.name}</p>
          <p><span class="vendor-label">Vendor Number:</span> ${vendor.vendor_number}</p>
        ` : supplier ? `
          <p><span class="vendor-label">Supplier:</span> ${supplier.company_name || supplier.name}</p>
          ${supplier.supplier_number ? `<p><span class="vendor-label">Supplier Number:</span> ${supplier.supplier_number}</p>` : ''}
          ${supplier.address_street ? `<p>${supplier.address_street}</p>` : ''}
          ${(supplier.address_city || supplier.address_state || supplier.address_zip) ? `<p>${[supplier.address_city, supplier.address_state, supplier.address_zip].filter(Boolean).join(', ')}</p>` : ''}
        ` : ''}
      </div>
    </div>
    <div class="header-right">
      <div class="po-number">PO Number: ${po.po_number}</div>
      <div class="po-date">Date: ${formatDate(po.order_date)}</div>
      <div style="margin-top: 10px;">
        <p style="margin: 3px 0;"><strong>Buyer:</strong> ${po.buyer_name}</p>
        <p style="margin: 3px 0;"><strong>Payment Terms:</strong> ${formatPaymentTerms(po.payment_terms)}</p>
      </div>
    </div>
  </div>

  <div class="addresses">
    <div class="address-box">
      <h3>BILL TO:</h3>
      <p class="address-company">${billToAddress.company_name}</p>
      <p>${billToAddress.address1}</p>
      ${billToAddress.address2 ? `<p>${billToAddress.address2}</p>` : ''}
      <p>${billToAddress.city}, ${billToAddress.state} ${billToAddress.zip_code}</p>
      ${billToAddress.country && billToAddress.country !== 'United States' ? `<p>${billToAddress.country}</p>` : ''}
    </div>
    <div class="address-box">
      <h3>SHIP TO:</h3>
      <p class="address-company">${shipToAddress.company_name}</p>
      <p>${shipToAddress.address1}</p>
      ${shipToAddress.address2 ? `<p>${shipToAddress.address2}</p>` : ''}
      <p>${shipToAddress.city}, ${shipToAddress.state} ${shipToAddress.zip_code}</p>
      ${shipToAddress.country && shipToAddress.country !== 'United States' ? `<p>${shipToAddress.country}</p>` : ''}
    </div>
  </div>

  <div class="line-items">
    <h3>Line Items</h3>
    <table>
      <thead>
        <tr>
          <th>Line</th>
          <th>Item Number</th>
          <th>Description</th>
          <th class="text-center">Need By</th>
          <th class="text-right">Qty</th>
          <th>UOM</th>
          <th class="text-right">Unit Price</th>
          <th class="text-center">Tax</th>
          <th class="text-right">Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineItems.map(item => `
          <tr>
            <td>${item.line_number}</td>
            <td>${item.item_number}</td>
            <td>${item.description}</td>
            <td class="text-center">${item.need_by_date ? formatDate(item.need_by_date) : '—'}</td>
            <td class="text-right">${item.quantity.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}</td>
            <td>${item.uom}</td>
            <td class="text-right">${formatCurrency(item.unit_price)}</td>
            <td class="text-center">${item.taxable ? 'Yes' : 'No'}</td>
            <td class="text-right">${formatCurrency(item.line_total)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div class="totals">
    <table>
      <tr>
        <td>Subtotal:</td>
        <td>${formatCurrency(po.subtotal_amount)}</td>
      </tr>
      <tr>
        <td>Tax (${(po.tax_rate * 100).toFixed(2)}%):</td>
        <td>${formatCurrency(po.tax_amount)}</td>
      </tr>
      <tr class="total-row">
        <td>TOTAL:</td>
        <td>${formatCurrency(po.total_amount)}</td>
      </tr>
    </table>
  </div>

  ${po.notes ? `
  <div class="notes">
    <h3>Notes</h3>
    <p>${po.notes}</p>
  </div>
  ` : ''}
</body>
</html>
    `;

    // Generate Terms and Conditions HTML from database
    const termsHTML = await generateTermsAndConditionsHTML();

    // Generate PDFs using PDFShift
    const pdfBuffer = await generatePDFWithPDFShift(html);
    const termsPDFBuffer = await generatePDFWithPDFShift(termsHTML);

    // Send email with PDF attachments
    const resend = getResendClient();
    const emailResult = await resend.emails.send({
      from: FROM_EMAIL,
      to: to,
      subject: subject,
      html: message || `
        <h2>Purchase Order ${po.po_number}</h2>
        <p>Dear ${vendorOrSupplierName},</p>
        <p>Please find attached Purchase Order ${po.po_number} dated ${formatDate(po.order_date)}.</p>
        <p><strong>Total Amount:</strong> ${formatCurrency(po.total_amount)}</p>
        <p><strong>Payment Terms:</strong> ${formatPaymentTerms(po.payment_terms)}</p>
        <p>Please acknowledge receipt of this purchase order at your earliest convenience.</p>
        <p>Thank you,<br>${po.buyer_name}</p>
      `,
      attachments: [
        {
          filename: `${po.po_number}.pdf`,
          content: pdfBuffer.toString('base64'),
        },
        {
          filename: `Terms-and-Conditions.pdf`,
          content: termsPDFBuffer.toString('base64'),
        },
      ],
    });

    if (emailResult.error) {
      securityLogger.logError('Failed to send PO email', emailResult.error, ip);
      return NextResponse.json(
        { error: 'Failed to send email', details: emailResult.error },
        { status: 500 }
      );
    }

    // Log success
    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: `/api/admin/purchase-orders/${id}/send`,
      method: 'POST',
      details: {
        poId: id,
        poNumber: po.po_number,
        recipient: to,
        messageId: emailResult.data?.id,
      },
      severity: 'low',
    });

    return NextResponse.json({
      success: true,
      messageId: emailResult.data?.id,
      message: 'Purchase order sent successfully',
    });
  } catch (error) {
    securityLogger.logError('Failed to send PO', error, ip);
    console.error('Error sending PO:', error);
    return NextResponse.json(
      { error: 'Failed to send purchase order' },
      { status: 500 }
    );
  }
}

