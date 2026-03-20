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

const purchaseOrderUpdateSchema = z.object({
  vendor_id: z.number().int().positive().optional(),
  order_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  buyer_name: z.string().min(1).max(255).trim().optional(),
  payment_terms: z.enum(['DUE_UPON_RECEIPT', 'NET_30', 'NET_60', 'NET_90', 'NET_180']).optional(),
  ship_to_address_id: z.number().int().positive().optional(),
  ship_to_address: shipToAddressSchema.optional(),
  bill_to_address_id: z.number().int().positive().optional(),
  tax_rate: z.number().min(0).max(1).optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'SENT', 'RECEIVED', 'CLOSED', 'CANCELLED']).optional(),
  notes: z.string().max(5000).trim().optional().nullable(),
  lines: z.array(purchaseOrderLineSchema).optional(),
}).refine(
  (data) => !data.ship_to_address_id || !data.ship_to_address,
  {
    message: "Cannot provide both ship_to_address_id and ship_to_address",
    path: ["ship_to_address_id"],
  }
);

// GET /api/admin/purchase-orders/[id] - Get a single purchase order
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
  
  // Validate id is a valid number
  // Handle case where id might have extra characters (e.g., "1:1" from source maps)
  const cleanId = id.split(':')[0].trim();
  const poId = parseInt(cleanId, 10);
  if (isNaN(poId) || poId <= 0) {
    return NextResponse.json({ error: 'Invalid purchase order ID', received: id }, { status: 400 });
  }

  try {
    const po = await queryOne<{
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
       WHERE po.id = $1`,
      [poId]
    );

    if (!po) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    // Fetch line items
    const lineItems = await query<{
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
      store_price: number | null;
      icc_margin_percent: number | null;
      icc_margin_amount: number | null;
      customer_margin_percent: number | null;
      customer_margin_amount: number | null;
      supplier_share_amount: number | null;
    }>(
      `SELECT id, purchase_order_id, line_number, item_number, description, need_by_date,
              quantity, uom, unit_price, taxable, line_total,
              store_price, icc_margin_percent, icc_margin_amount,
              customer_margin_percent, customer_margin_amount, supplier_share_amount
       FROM purchase_order_lines
       WHERE purchase_order_id = $1
       ORDER BY line_number`,
      [poId]
    );

    // Fetch addresses
    const shipToAddress = await queryOne<{
      id: number;
      type: string;
      company_name: string;
      address1: string;
      address2: string | null;
      city: string;
      state: string;
      zip_code: string;
      country: string;
    }>(
      'SELECT id, type, company_name, address1, address2, city, state, zip_code, country FROM addresses WHERE id = $1',
      [po.ship_to_address_id]
    );

    const billToAddress = await queryOne<{
      id: number;
      type: string;
      company_name: string;
      address1: string;
      address2: string | null;
      city: string;
      state: string;
      zip_code: string;
      country: string;
    }>(
      'SELECT id, type, company_name, address1, address2, city, state, zip_code, country FROM addresses WHERE id = $1',
      [po.bill_to_address_id]
    );

    return NextResponse.json({
      ...po,
      lines: lineItems,
      ship_to_address: shipToAddress,
      bill_to_address: billToAddress,
    });
  } catch (error) {
    securityLogger.logError('Failed to fetch purchase order', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/purchase-orders/[id] - Update a purchase order
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const ip = getClientIp(request);
  const { id } = await params;
  
  // Validate id is a valid number
  // Handle case where id might have extra characters (e.g., "1:1" from source maps)
  const cleanId = id.split(':')[0].trim();
  const poId = parseInt(cleanId, 10);
  if (isNaN(poId) || poId <= 0) {
    return NextResponse.json({ error: 'Invalid purchase order ID', received: id }, { status: 400 });
  }

  try {
    const body = await request.json();
    
    // Validate input
    const validationResult = purchaseOrderUpdateSchema.safeParse(body);
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        `/api/admin/purchase-orders/${poId}`,
        ip,
        validationResult.error.issues,
        'PUT'
      );
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const updateData = validationResult.data;

    // Check if PO exists
    const existingPO = await queryOne<{ id: number; status: string; buyer_user_id: string | null }>(
      'SELECT id, status, buyer_user_id FROM purchase_orders WHERE id = $1',
      [poId]
    );

    if (!existingPO) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    const oldStatus = existingPO.status;
    const isStatusChangeToSubmitted = updateData.status === 'SUBMITTED' && oldStatus !== 'SUBMITTED';

    // Build update query dynamically first to determine what fields are changing
    const preliminaryUpdateFields: string[] = [];
    
    if (updateData.vendor_id !== undefined) preliminaryUpdateFields.push('vendor_id');
    if (updateData.order_date !== undefined) preliminaryUpdateFields.push('order_date');
    if (updateData.buyer_name !== undefined) preliminaryUpdateFields.push('buyer_name');
    if (updateData.payment_terms !== undefined) preliminaryUpdateFields.push('payment_terms');
    if (updateData.tax_rate !== undefined) preliminaryUpdateFields.push('tax_rate');
    if (updateData.status !== undefined) preliminaryUpdateFields.push('status');
    if (updateData.notes !== undefined) preliminaryUpdateFields.push('notes');
    if (updateData.ship_to_address || updateData.ship_to_address_id !== undefined) preliminaryUpdateFields.push('ship_to_address_id');
    if (updateData.bill_to_address_id !== undefined) preliminaryUpdateFields.push('bill_to_address_id');
    if (updateData.lines && updateData.lines.length > 0) preliminaryUpdateFields.push('lines');

    // Track if we're editing a PO that requires re-approval
    const isEditingSubmittedPO = oldStatus === 'SUBMITTED' && preliminaryUpdateFields.length > 0 && !isStatusChangeToSubmitted;
    const needsReapproval = ['APPROVED', 'SENT'].includes(oldStatus) && preliminaryUpdateFields.length > 0;

    // Handle ship-to address if provided
    let finalShipToAddressId: number | undefined;
    if (updateData.ship_to_address) {
      // Create new ship-to address
      const newAddress = await queryOne<{ id: number }>(
        `INSERT INTO addresses (type, company_name, address1, address2, city, state, zip_code, country)
         VALUES ('SHIP_TO', $1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          updateData.ship_to_address.company_name,
          updateData.ship_to_address.address1,
          updateData.ship_to_address.address2 || null,
          updateData.ship_to_address.city,
          updateData.ship_to_address.state,
          updateData.ship_to_address.zip_code,
          updateData.ship_to_address.country || 'United States',
        ]
      );
      if (newAddress) {
        finalShipToAddressId = newAddress.id;
      }
    } else if (updateData.ship_to_address_id) {
      finalShipToAddressId = updateData.ship_to_address_id;
    }

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: unknown[] = [];
    let paramIndex = 1;

    if (updateData.vendor_id !== undefined) {
      updateFields.push(`vendor_id = $${paramIndex++}`);
      updateValues.push(updateData.vendor_id);
    }
    if (updateData.order_date !== undefined) {
      updateFields.push(`order_date = $${paramIndex++}`);
      updateValues.push(updateData.order_date);
    }
    if (updateData.buyer_name !== undefined) {
      updateFields.push(`buyer_name = $${paramIndex++}`);
      updateValues.push(updateData.buyer_name);
    }
    if (updateData.payment_terms !== undefined) {
      updateFields.push(`payment_terms = $${paramIndex++}`);
      updateValues.push(updateData.payment_terms);
    }
    if (finalShipToAddressId !== undefined) {
      updateFields.push(`ship_to_address_id = $${paramIndex++}`);
      updateValues.push(finalShipToAddressId);
    }
    if (updateData.bill_to_address_id !== undefined) {
      updateFields.push(`bill_to_address_id = $${paramIndex++}`);
      updateValues.push(updateData.bill_to_address_id);
    }
    if (updateData.tax_rate !== undefined) {
      updateFields.push(`tax_rate = $${paramIndex++}`);
      updateValues.push(updateData.tax_rate);
    }
    // If editing an APPROVED or SENT PO, reset to SUBMITTED for re-approval
    if (needsReapproval) {
      updateFields.push(`status = $${paramIndex++}`);
      updateValues.push('SUBMITTED');
      
      // Cancel any existing approval request for clean state
      await query(
        `UPDATE po_approval_requests 
         SET status = 'CANCELLED', updated_at = NOW()
         WHERE purchase_order_id = $1 AND status = 'PENDING'`,
        [poId]
      );
    } else if (updateData.status !== undefined) {
      updateFields.push(`status = $${paramIndex++}`);
      updateValues.push(updateData.status);
    }
    // Set buyer_user_id when submitting (if not already set)
    if (isStatusChangeToSubmitted && !existingPO.buyer_user_id && authResult.session) {
      updateFields.push(`buyer_user_id = $${paramIndex++}`);
      updateValues.push(authResult.session.admin_user_id);
    }
    if (updateData.notes !== undefined) {
      updateFields.push(`notes = $${paramIndex++}`);
      updateValues.push(updateData.notes);
    }

    // Update PO if there are fields to update
    if (updateFields.length > 0) {
      updateFields.push(`updated_at = NOW()`);
      updateValues.push(poId);

      await query(
        `UPDATE purchase_orders SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
        updateValues
      );
    }

    // Update line items if provided
    if (updateData.lines && updateData.lines.length > 0) {
      // Delete existing lines
      await query('DELETE FROM purchase_order_lines WHERE purchase_order_id = $1', [poId]);

      // Insert new lines
      for (const line of updateData.lines) {
        await query(
          `INSERT INTO purchase_order_lines 
           (purchase_order_id, line_number, item_number, description, need_by_date, quantity, uom, unit_price, taxable,
            store_price, icc_margin_percent, icc_margin_amount, customer_margin_percent, customer_margin_amount, supplier_share_amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            poId,
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
    }

    // Fetch updated PO with vendor name
    const updatedPO = await queryOne<{
      id: number;
      po_number: string;
      vendor_id: number;
      vendor_name: string;
      order_date: string;
      buyer_name: string;
      payment_terms: string;
      ship_to_address_id: number;
      bill_to_address_id: number;
      tax_rate: number;
      subtotal_amount: number;
      tax_amount: number;
      total_amount: number;
      status: string;
      notes: string | null;
    }>(
      `SELECT po.id, po.po_number, po.vendor_id, v.name as vendor_name, po.order_date, po.buyer_name, po.payment_terms,
              po.ship_to_address_id, po.bill_to_address_id, po.tax_rate,
              po.subtotal_amount, po.tax_amount, po.total_amount, po.status, po.notes
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id = po.vendor_id
       WHERE po.id = $1`,
      [poId]
    );

    // Trigger approval workflow if:
    // 1. Status explicitly changed to SUBMITTED, OR
    // 2. Editing any fields on already-SUBMITTED PO, OR
    // 3. Reset from APPROVED/SENT back to SUBMITTED
    const shouldTriggerApprovalNotification = isStatusChangeToSubmitted || isEditingSubmittedPO || needsReapproval;
    
    // Send approval notification emails to all admins
    if (shouldTriggerApprovalNotification && updatedPO) {
      try {
        const admins = await getAdminUsers();
        const approvalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/purchase-orders/${poId}/approve`;
        
        // Determine if this is a resubmission
        const isResubmission = isEditingSubmittedPO || needsReapproval;
        
        // Determine email subject based on context
        const subject = isResubmission 
          ? `Purchase Order ${updatedPO.po_number} Updated - Re-Review Required`
          : `Purchase Order ${updatedPO.po_number} Requires Approval`;
        
        // Send email to each admin
        const emailPromises = admins
          .filter(admin => admin.email) // Only send to admins with email addresses
          .map(admin => sendPOApprovalRequest({
            to: admin.email!,
            subject,
            poNumber: updatedPO.po_number,
            vendorName: updatedPO.vendor_name || 'Unknown Vendor',
            submittedBy: authResult.session?.admin_name || updatedPO.buyer_name || 'Unknown',
            submittedAt: new Date().toLocaleString('en-US', { 
              timeZone: 'America/New_York',
              dateStyle: 'medium',
              timeStyle: 'short'
            }),
            totalAmount: Number(updatedPO.total_amount),
            approvalUrl,
            ip,
            isResubmission,
            changedFields: preliminaryUpdateFields,
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
        // Log error but don't fail the request
        securityLogger.logError('Failed to send approval notification emails', error, ip);
      }
    }

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: `/api/admin/purchase-orders/${poId}`,
      method: 'PUT',
      details: {
        poId: poId,
        poNumber: updatedPO?.po_number,
        updatedFields: preliminaryUpdateFields,
        oldStatus,
        newStatus: updatedPO?.status,
        approvalNotificationSent: shouldTriggerApprovalNotification,
        editType: isEditingSubmittedPO 
          ? 'resubmission_while_submitted' 
          : needsReapproval 
            ? 'resubmission_from_approved_sent' 
            : 'normal_update',
        wasResetToSubmitted: needsReapproval,
      },
      severity: 'low',
    });

    return NextResponse.json({
      success: true,
      purchaseOrder: updatedPO,
    });
  } catch (error) {
    securityLogger.logError('Failed to update purchase order', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

