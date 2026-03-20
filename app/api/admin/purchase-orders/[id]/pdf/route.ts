import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { query, queryOne } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { generatePDFWithPDFShift } from '@/lib/pdf-generation';

interface PurchaseOrder {
  id: number;
  po_number: string;
  vendor_id: number | null;
  supplier_id: string | null;
  order_date: string;
  buyer_id: number | null;
  buyer_name: string;
  buyer_user_id: string | null;
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
  created_at: string;
  updated_at: string;
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
  is_default: boolean;
}

interface Vendor {
  id: number;
  vendor_number: string;
  name: string;
}

interface Supplier {
  id: string;
  supplier_number: string;
  company_name: string;
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

// GET /api/admin/purchase-orders/[id]/pdf
export async function GET(
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
    // Fetch purchase order
    const po = await queryOne<PurchaseOrder>(
      `SELECT id, po_number, vendor_id, supplier_id, order_date, buyer_id, buyer_name, buyer_user_id,
              payment_terms, ship_to_address_id, bill_to_address_id, currency, tax_rate,
              subtotal_amount, tax_amount, total_amount, status, notes, created_at, updated_at
       FROM purchase_orders
       WHERE id = $1`,
      [id]
    );

    if (!po) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    // Fetch vendor or supplier based on which one is set
    let vendorOrSupplierName: string;
    let vendorOrSupplierNumber: string;

    if (po.vendor_id) {
      const vendor = await queryOne<Vendor>(
        'SELECT id, vendor_number, name FROM vendors WHERE id = $1',
        [po.vendor_id]
      );

      if (!vendor) {
        return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
      }
      vendorOrSupplierName = vendor.name;
      vendorOrSupplierNumber = vendor.vendor_number;
    } else if (po.supplier_id) {
      const supplier = await queryOne<Supplier>(
        'SELECT id, supplier_number, company_name FROM supplier_users WHERE id = $1',
        [po.supplier_id]
      );

      if (!supplier) {
        return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
      }
      vendorOrSupplierName = supplier.company_name;
      vendorOrSupplierNumber = supplier.supplier_number || '';
    } else {
      return NextResponse.json({ error: 'No vendor or supplier assigned to purchase order' }, { status: 400 });
    }

    // Fetch addresses
    const billToAddress = await queryOne<Address>(
      'SELECT id, type, company_name, address1, address2, city, state, zip_code, country, is_default FROM addresses WHERE id = $1',
      [po.bill_to_address_id]
    );

    const shipToAddress = await queryOne<Address>(
      'SELECT id, type, company_name, address1, address2, city, state, zip_code, country, is_default FROM addresses WHERE id = $1',
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

    // Generate HTML
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
    .terms {
      margin-top: 30px;
      padding: 15px;
      background-color: #f9fafb;
      border: 1px solid #ddd;
      font-size: 10px;
    }
    .terms h3 {
      margin: 0 0 10px 0;
      font-size: 14px;
      font-weight: bold;
      color: #333;
    }
    .terms p {
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
        <p><span class="vendor-label">${po.supplier_id ? 'Supplier' : 'Vendor'}:</span> ${vendorOrSupplierName}</p>
        <p><span class="vendor-label">${po.supplier_id ? 'Supplier' : 'Vendor'} Number:</span> ${vendorOrSupplierNumber}</p>
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

    // Generate PDF using PDFShift
    const pdfBuffer = await generatePDFWithPDFShift(html);

    // Return PDF
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${po.po_number}.pdf"`,
      },
    });
  } catch (error) {
    securityLogger.logError('Failed to generate PO PDF', error, ip);
    console.error('Error generating PO PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}

