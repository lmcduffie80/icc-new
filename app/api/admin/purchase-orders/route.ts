import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { query, queryOne } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { sendPOApprovalRequest } from '@/lib/email';
import { getAdminUsers } from '@/lib/admin-auth';
import { z } from 'zod';

const purchaseOrderLineSchema = z.object({
  line_number: z.number().int().positive(),
  item_number: z.string().min(1).max(100).trim(),
  description: z.string().min(1).max(500).trim(),
  need_by_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  quantity: z.number().positive(),
  uom: z.string().min(1).max(50).trim(),
  unit_price: z.number().nonnegative(),
  taxable: z.boolean().default(false),
  // Margin fields (optional - populated when PO is created from products)
  store_price: z.number().nonnegative().optional().nullable(),
  supplier_base_price: z.number().nonnegative().optional().nullable(),
  icc_margin_percent: z.number().min(0).max(100).optional().nullable(),
  icc_margin_amount: z.number().nonnegative().optional().nullable(),
  customer_margin_percent: z.number().min(0).max(100).optional().nullable(),
  customer_margin_amount: z.number().nonnegative().optional().nullable(),
  supplier_share_amount: z.number().nonnegative().optional().nullable(),
});

const shipToAddressSchema = z.object({
  company_name: z.string().min(1).max(255).trim(),
  address1: z.string().min(1).max(255).trim(),
  address2: z.string().max(255).trim().optional().nullable(),
  city: z.string().min(1).max(100).trim(),
  state: z.string().min(1).max(2).trim(),
  zip_code: z.string().min(1).max(20).trim(),
  country: z.string().max(100).trim().optional().nullable(),
});

const purchaseOrderCreateSchema = z.object({
  vendor_id: z.number().int().positive().optional().nullable(),
  supplier_id: z.string().min(1).optional().nullable(),
  order_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  buyer_id: z.number().int().positive().nullable().optional(),
  buyer_name: z.string().min(1).max(255).trim(),
  buyer_user_id: z.string().min(1).max(255).trim().optional().nullable(),
  payment_terms: z.enum(['DUE_UPON_RECEIPT', 'NET_30', 'NET_60', 'NET_90', 'NET_180']).default('NET_30'),
  ship_to_address_id: z.number().int().positive().optional(),
  ship_to_address: shipToAddressSchema.optional(),
  bill_to_address_id: z.number().int().positive(),
  tax_rate: z.number().min(0).max(1).default(0),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'SENT', 'RECEIVED', 'CLOSED', 'CANCELLED']).default('DRAFT'),
  notes: z.string().max(5000).trim().optional().nullable(),
  lines: z.array(purchaseOrderLineSchema).min(1),
}).refine(
  (data) => data.ship_to_address_id || data.ship_to_address,
  {
    message: "Either ship_to_address_id or ship_to_address must be provided",
    path: ["ship_to_address_id"],
  }
).refine(
  (data) => (data.vendor_id !== null && data.vendor_id !== undefined) !== (data.supplier_id !== null && data.supplier_id !== undefined),
  {
    message: "Exactly one of vendor_id or supplier_id must be provided",
    path: ["vendor_id"],
  }
);

// GET /api/admin/purchase-orders - List all purchase orders
export async function GET(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const ip = getClientIp(request);

  try {
    const purchaseOrders = await query<{
      id: number;
      po_number: string;
      vendor_id: number;
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
      vendor_name: string;
    }>(
      `SELECT po.id, po.po_number, po.vendor_id, po.order_date, po.buyer_id, po.buyer_name, po.buyer_user_id,
              po.payment_terms, po.ship_to_address_id, po.bill_to_address_id, po.currency, po.tax_rate,
              po.subtotal_amount, po.tax_amount, po.total_amount, po.status, po.notes, po.created_at, po.updated_at,
              v.name as vendor_name
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id = po.vendor_id
       ORDER BY po.created_at DESC`
    );

    return NextResponse.json(purchaseOrders);
  } catch (error) {
    securityLogger.logError('Failed to fetch purchase orders', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/admin/purchase-orders - Create a new purchase order
export async function POST(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const ip = getClientIp(request);

  try {
    const body = await request.json();
    
    // Validate input
    const validationResult = purchaseOrderCreateSchema.safeParse(body);
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        '/api/admin/purchase-orders',
        ip,
        validationResult.error.issues,
        'POST'
      );
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const {
      vendor_id,
      supplier_id,
      order_date,
      buyer_id,
      buyer_name,
      buyer_user_id,
      payment_terms,
      ship_to_address_id,
      ship_to_address,
      bill_to_address_id,
      tax_rate,
      status,
      notes,
      lines,
    } = validationResult.data;

    // Validate vendor or supplier exists (exactly one must be provided)
    // vendorName kept for future PO display/export functionality
    if (vendor_id) {
    const vendor = await queryOne<{ id: number; name: string }>(
      'SELECT id, name FROM vendors WHERE id = $1',
      [vendor_id]
    );
    if (!vendor) {
      return NextResponse.json(
        { error: 'Vendor not found' },
        { status: 400 }
      );
      }
      // vendorName = vendor.name;
    } else if (supplier_id) {
      const supplier = await queryOne<{ id: string; name: string; company_name: string }>(
        'SELECT id, name, company_name FROM supplier_users WHERE id = $1',
        [supplier_id]
      );
      if (!supplier) {
        return NextResponse.json(
          { error: 'Supplier not found' },
          { status: 400 }
        );
      }
      // vendorName = supplier.company_name || supplier.name; // Unused - keeping for future reference
    }

    // Handle ship-to address - create new if manual address provided, otherwise validate existing
    let finalShipToAddressId: number;
    if (ship_to_address) {
      // Create new ship-to address
      const newAddress = await queryOne<{ id: number }>(
        `INSERT INTO addresses (type, company_name, address1, address2, city, state, zip_code, country)
         VALUES ('SHIP_TO', $1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          ship_to_address.company_name,
          ship_to_address.address1,
          ship_to_address.address2 || null,
          ship_to_address.city,
          ship_to_address.state,
          ship_to_address.zip_code,
          ship_to_address.country || 'United States',
        ]
      );
      if (!newAddress) {
        return NextResponse.json(
          { error: 'Failed to create ship-to address' },
          { status: 500 }
        );
      }
      finalShipToAddressId = newAddress.id;
    } else if (ship_to_address_id) {
      // Validate existing ship-to address
      const shipToAddress = await queryOne<{ id: number }>(
        'SELECT id FROM addresses WHERE id = $1',
        [ship_to_address_id]
      );
      if (!shipToAddress) {
        return NextResponse.json(
          { error: 'Ship-to address not found' },
          { status: 400 }
        );
      }
      finalShipToAddressId = ship_to_address_id;
    } else {
      return NextResponse.json(
        { error: 'Ship-to address is required' },
        { status: 400 }
      );
    }

    const billToAddress = await queryOne<{ id: number }>(
      'SELECT id FROM addresses WHERE id = $1',
      [bill_to_address_id]
    );
    if (!billToAddress) {
      return NextResponse.json(
        { error: 'Bill-to address not found' },
        { status: 400 }
      );
    }

    // Validate buyer_id if provided
    if (buyer_id) {
      const buyer = await queryOne<{ id: number }>(
        'SELECT id FROM buyers WHERE id = $1',
        [buyer_id]
      );
      if (!buyer) {
        return NextResponse.json(
          { error: 'Buyer not found' },
          { status: 400 }
        );
      }
    }

    // Start transaction - create PO and lines
    // Note: po_number is auto-generated by trigger
    const purchaseOrder = await queryOne<{
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
    }>(
      `INSERT INTO purchase_orders 
       (vendor_id, supplier_id, order_date, buyer_id, buyer_name, buyer_user_id, payment_terms, 
        ship_to_address_id, bill_to_address_id, currency, tax_rate, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, po_number, vendor_id, supplier_id, order_date, buyer_id, buyer_name, buyer_user_id,
                 payment_terms, ship_to_address_id, bill_to_address_id, currency, tax_rate,
                 subtotal_amount, tax_amount, total_amount, status, notes, created_at, updated_at`,
      [
        vendor_id || null,
        supplier_id || null,
        order_date,
        buyer_id || null,
        buyer_name,
        buyer_user_id || null,
        payment_terms,
        finalShipToAddressId,
        bill_to_address_id,
        'USD',
        tax_rate,
        status,
        notes || null,
      ]
    );

    if (!purchaseOrder) {
      return NextResponse.json(
        { error: 'Failed to create purchase order' },
        { status: 500 }
      );
    }

    // Insert line items
    for (const line of lines) {
      await query(
        `INSERT INTO purchase_order_lines 
         (purchase_order_id, line_number, item_number, description, need_by_date, 
          quantity, uom, unit_price, taxable,
          store_price, icc_margin_percent, icc_margin_amount,
          customer_margin_percent, customer_margin_amount, supplier_share_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          purchaseOrder.id,
          line.line_number,
          line.item_number,
          line.description,
          line.need_by_date || null,
          line.quantity,
          line.uom,
          line.unit_price,
          line.taxable,
          line.store_price || null,
          line.icc_margin_percent || null,
          line.icc_margin_amount || null,
          line.customer_margin_percent || null,
          line.customer_margin_amount || null,
          line.supplier_share_amount || null,
        ]
      );
    }

    // Fetch the complete PO with updated totals (triggers recalculate totals)
    const completePO = await queryOne<{
      id: number;
      po_number: string;
      vendor_id: number;
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
    }>(
      `SELECT id, po_number, vendor_id, order_date, buyer_id, buyer_name, buyer_user_id,
              payment_terms, ship_to_address_id, bill_to_address_id, currency, tax_rate,
              subtotal_amount, tax_amount, total_amount, status, notes, created_at, updated_at
       FROM purchase_orders
       WHERE id = $1`,
      [purchaseOrder.id]
    );

    // Check if PO requires approval based on $25,000 threshold
    if (completePO && completePO.total_amount >= 25000) {
      // If not already submitted, update status to SUBMITTED to trigger approval
      if (completePO.status === 'DRAFT') {
        await query(
          'UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2',
          ['SUBMITTED', completePO.id]
        );
        completePO.status = 'SUBMITTED';
        
        // Get vendor name for email
        const vendor = await queryOne<{ name: string }>(
          'SELECT name FROM vendors WHERE id = $1',
          [completePO.vendor_id]
        );
        
        // Send approval notification emails to all admins
        try {
          const admins = await getAdminUsers();
          const approvalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/purchase-orders/${completePO.id}/approve`;
          
          const emailPromises = admins
            .filter(admin => admin.email)
            .map(admin => sendPOApprovalRequest({
              to: admin.email!,
              subject: `Purchase Order ${completePO.po_number} Requires Approval`,
              poNumber: completePO.po_number,
              vendorName: vendor?.name || 'Unknown Vendor',
              submittedBy: authResult.session?.admin_name || completePO.buyer_name || 'Unknown',
              submittedAt: new Date().toLocaleString('en-US', { 
                timeZone: 'America/New_York',
                dateStyle: 'medium',
                timeStyle: 'short'
              }),
              totalAmount: Number(completePO.total_amount),
              approvalUrl,
              ip,
              isResubmission: false, // New PO, not a resubmission
              changedFields: [],
            }));
          
          // Don't await - send emails in background
          Promise.allSettled(emailPromises).then(results => {
            const failed = results.filter(r => r.status === 'rejected').length;
            if (failed > 0) {
              securityLogger.logError(
                `Failed to send ${failed} approval notification email(s)`,
                new Error(`${failed} email(s) failed`),
                ip
              );
            }
          });
        } catch (error) {
          securityLogger.logError('Failed to send approval notification emails', error, ip);
        }
        
        securityLogger.logEvent({
          type: 'admin_action',
          ip,
          path: '/api/admin/purchase-orders',
          method: 'POST',
          details: {
            action: 'po_submitted_for_approval',
            po_id: completePO.id,
            po_number: completePO.po_number,
            total_amount: completePO.total_amount,
            threshold: 25000,
            status_updated: 'DRAFT -> SUBMITTED',
            trigger_action: 'AFTER UPDATE trigger created approval request',
            reason: 'PO amount exceeds $25,000 approval threshold',
            approval_emails_sent: true,
          },
          severity: 'medium',
        });
      }
    }

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: '/api/admin/purchase-orders',
      method: 'POST',
      details: {
        action: 'purchase_order_created',
        po_id: completePO?.id,
        po_number: completePO?.po_number,
        vendor_id,
      },
      severity: 'low',
    });

    return NextResponse.json(completePO, { status: 201 });
  } catch (error) {
    securityLogger.logError('Failed to create purchase order', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

