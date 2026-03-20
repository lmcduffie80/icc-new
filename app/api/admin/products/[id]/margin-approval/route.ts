import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { sendICCMarginUpdateEmail } from '@/lib/supplier-emails';
import { z } from 'zod';

const marginApprovalSchema = z.object({
  action: z.enum(['approve', 'reject', 'modify']),
  icc_margin_percent: z.number().min(0).max(100).optional(),
  notes: z.string().max(1000).optional(),
});

// POST /api/admin/products/[id]/margin-approval
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('products.update');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json();
    const validationResult = marginApprovalSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { action, icc_margin_percent, notes } = validationResult.data;

    // Get current product
    const product = await queryOne<{
      id: string;
      name: string;
      price: string;
      supplier_price: string;
      icc_margin_percent: string;
      icc_margin_amount: string;
      customer_margin_percent: string;
      customer_margin_amount: string;
      margin_approval_status: string;
    }>(
      `SELECT id, name, price, supplier_price, icc_margin_percent, 
              icc_margin_amount, customer_margin_percent, customer_margin_amount,
              margin_approval_status
       FROM products
       WHERE id = $1`,
      [id]
    );

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Take snapshot of current state for audit log
    const beforeState = { ...product };

    if (action === 'approve') {
      // Approve the margin split
      await query(
        `UPDATE products
         SET margin_approval_status = 'approved',
             margin_approved_at = NOW(),
             margin_approved_by = $1,
             margin_notes = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [auth.session.adminUser.id, notes || null, id]
      );

      // Log to margin history
      await query(
        `INSERT INTO product_margin_history 
         (product_id, action, icc_margin_percent, performed_by, notes)
         VALUES ($1, 'approved', $2, $3, $4)`,
        [id, product.icc_margin_percent, auth.session.adminUser.id, notes || null]
      );

      // Log to audit trail
      await logAction({
        adminUserId: auth.session.adminUser.id,
        action: 'update',
        resourceType: 'product',
        resourceId: id,
        before: beforeState,
        after: { margin_approval_status: 'approved', margin_notes: notes },
      });

      return NextResponse.json({
        success: true,
        message: 'Margin approved successfully',
      });
    } else if (action === 'reject') {
      // Reject the margin split
      await query(
        `UPDATE products
         SET margin_approval_status = 'rejected',
             margin_approved_at = NOW(),
             margin_approved_by = $1,
             margin_notes = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [auth.session.adminUser.id, notes || null, id]
      );

      // Log to margin history
      await query(
        `INSERT INTO product_margin_history 
         (product_id, action, icc_margin_percent, performed_by, notes)
         VALUES ($1, 'rejected', $2, $3, $4)`,
        [id, product.icc_margin_percent, auth.session.adminUser.id, notes || null]
      );

      // Log to audit trail
      await logAction({
        adminUserId: auth.session.adminUser.id,
        action: 'update',
        resourceType: 'product',
        resourceId: id,
        before: beforeState,
        after: { margin_approval_status: 'rejected', margin_notes: notes },
      });

      return NextResponse.json({
        success: true,
        message: 'Margin rejected successfully',
      });
    } else if (action === 'modify') {
      // Modify the margin split with a new percentage
      if (!icc_margin_percent) {
        return NextResponse.json(
          { error: 'icc_margin_percent is required for modify action' },
          { status: 400 }
        );
      }

      const storePrice = parseFloat(product.price);
      const supplierPrice = parseFloat(product.supplier_price);
      const totalMargin = storePrice - supplierPrice;

      // Calculate new margins (as percentage of total margin, not store price)
      const iccMarginAmount = (totalMargin * icc_margin_percent) / 100;
      const customerMarginAmount = totalMargin - iccMarginAmount;
      const customerMarginPercent = (customerMarginAmount / storePrice) * 100;

      // Validate that ICC margin doesn't exceed total margin
      if (iccMarginAmount > totalMargin) {
        return NextResponse.json(
          {
            error: `ICC margin cannot exceed total margin of $${totalMargin.toFixed(2)} (${((totalMargin / storePrice) * 100).toFixed(2)}%)`,
          },
          { status: 400 }
        );
      }

      // Update product with new margin values
      await query(
        `UPDATE products
         SET icc_margin_percent = $1,
             icc_margin_amount = $2,
             customer_margin_percent = $3,
             customer_margin_amount = $4,
             margin_split_percentage = $1,
             margin_approval_status = 'approved',
             margin_approved_at = NOW(),
             margin_approved_by = $5,
             margin_notes = $6,
             updated_at = NOW()
         WHERE id = $7`,
        [
          icc_margin_percent,
          iccMarginAmount,
          customerMarginPercent,
          customerMarginAmount,
          auth.session.adminUser.id,
          notes || null,
          id,
        ]
      );

      // Log to margin history
      await query(
        `INSERT INTO product_margin_history 
         (product_id, action, icc_margin_percent, performed_by, notes)
         VALUES ($1, 'modified', $2, $3, $4)`,
        [id, icc_margin_percent, auth.session.adminUser.id, notes || null]
      );

      // Log to audit trail
      await logAction({
        adminUserId: auth.session.adminUser.id,
        action: 'update',
        resourceType: 'product',
        resourceId: id,
        before: beforeState,
        after: {
          icc_margin_percent,
          icc_margin_amount: iccMarginAmount,
          customer_margin_percent: customerMarginPercent,
          customer_margin_amount: customerMarginAmount,
          margin_approval_status: 'approved',
          margin_notes: notes,
        },
      });

      // Send notification email to supplier
      const supplierData = await queryOne<{ 
        supplier_id: string;
        supplier_name: string;
        supplier_email: string;
      }>(
        `SELECT su.id as supplier_id, su.name as supplier_name, su.email as supplier_email
         FROM products p
         JOIN supplier_users su ON su.id = p.supplier_id
         WHERE p.id = $1`,
        [id]
      );
      
      if (supplierData?.supplier_email) {
        try {
          await sendICCMarginUpdateEmail({
            to: supplierData.supplier_email,
            supplierName: supplierData.supplier_name,
            productName: product.name,
            productUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/supplier/products/${id}`,
            oldIccMarginPercent: parseFloat(product.icc_margin_percent),
            newIccMarginPercent: icc_margin_percent,
            oldCustomerMarginPercent: parseFloat(product.customer_margin_percent),
            newCustomerMarginPercent: customerMarginPercent,
            storePrice: parseFloat(product.price),
            supplierPrice: parseFloat(product.supplier_price),
            notes: notes || null,
          });
        } catch (emailError) {
          console.error('Failed to send ICC margin update email:', emailError);
          // Don't fail the request if email fails
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Margin modified and approved successfully',
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error processing margin approval:', error);
    return NextResponse.json(
      { error: 'Failed to process margin approval' },
      { status: 500 }
    );
  }
}
