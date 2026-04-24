import { NextRequest, NextResponse } from 'next/server';
import { verifySupplierAuth } from '@/lib/supplier-middleware';
import { supplierProductUpdateSchema, supplierProductUpdateRestrictedSchema } from '@/lib/validation';
import { query, queryOne, pool } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

/**
 * Sync product inventory_count with the sum of all warehouse inventories
 */
async function syncProductInventoryCount(productId: string): Promise<void> {
  // Calculate sum of all warehouse inventories for this product
  const result = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(inventory_count), 0) as total
     FROM product_warehouses
     WHERE product_id = $1`,
    [productId]
  );

  const totalWarehouseInventory = parseInt(result.rows[0]?.total || '0', 10);

  // Get current inventory_count and icc_available_quantity before update for logging
  const currentProduct = await pool.query<{ inventory_count: number; icc_available_quantity: number | null }>(
    `SELECT inventory_count, icc_available_quantity FROM products WHERE id = $1 AND deleted_at IS NULL`,
    [productId]
  );
  const oldInventoryCount = currentProduct.rows[0]?.inventory_count || 0;
  const iccQty = currentProduct.rows[0]?.icc_available_quantity || 0;

  // Update the main product inventory_count; in_stock is true if either warehouse inventory
  // OR the supplier's own icc_available_quantity is positive
  await pool.query(
    `UPDATE products
     SET inventory_count = $1,
         in_stock = ($1 > 0 OR COALESCE(icc_available_quantity, 0) > 0),
         updated_at = NOW()
     WHERE id = $2`,
    [totalWarehouseInventory, productId]
  );
  
  console.log(`[syncProductInventoryCount] Product ${productId}: Synced inventory_count from ${oldInventoryCount} to ${totalWarehouseInventory} (sum of ${result.rows.length} warehouse(s)), icc_available_quantity=${iccQty}`);
}

// GET /api/supplier/products/:id - Get single product
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifySupplierAuth(request);

  if (!authResult.authorized || !authResult.session) {
    return authResult.response!;
  }

  const { id } = await params;
  const supplierId = authResult.session.user.id;

  try {
    const product = await queryOne<{
      id: string;
      name: string;
      category: string;
      description: string | null;
      full_description: string | null;
      price: string;
      supplier_price: string | null;
      sku: string | null;
      unit_of_measure: string | null;
      image: string | null;
      approval_status: string;
      in_stock: boolean;
      inventory_count: number;
      icc_available_quantity: number;
      label_url: string | null;
      sds_url: string | null;
      admin_label_url: string | null;
      attributes: Record<string, unknown>;
      approved_states: string[];
      features: string[];
      specifications: Record<string, string>;
      restricted_use: boolean;
      created_at: string;
      updated_at: string;
      margin_split_percentage: string | null;
      margin_approval_status: string | null;
      margin_approval_notes: string | null;
    }>(
      `SELECT
        id, name, category, description, full_description,
        price, supplier_price, sku, unit_of_measure, image,
        approval_status, in_stock, inventory_count, icc_available_quantity,
        label_url, sds_url, admin_label_url,
        attributes, approved_states, features, specifications,
        restricted_use, created_at, updated_at,
        margin_split_percentage, margin_approval_status, margin_approval_notes
      FROM products
      WHERE id = $1 AND supplier_id = $2 AND deleted_at IS NULL`,
      [id, supplierId]
    );

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Fetch warehouse information for this product
    const warehouses = await query<{
      warehouse_id: string;
      warehouse_name: string;
      inventory_count: number;
    }>(
      `SELECT 
        pw.warehouse_id,
        w.name as warehouse_name,
        pw.inventory_count
      FROM product_warehouses pw
      JOIN warehouses w ON w.id = pw.warehouse_id
      WHERE pw.product_id = $1
      ORDER BY pw.inventory_count DESC`,
      [id]
    );

    return NextResponse.json({ 
      product: {
        ...product,
        warehouses: warehouses || [],
      }
    });
  } catch (error) {
    securityLogger.logError('Failed to fetch supplier product', error, getClientIp(request));
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/supplier/products/:id - Update product
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifySupplierAuth(request);

  if (!authResult.authorized || !authResult.session) {
    return authResult.response!;
  }

  const { id } = await params;
  const supplierId = authResult.session.user.id;
  const ip = getClientIp(request);

  try {
    // Verify product belongs to supplier
    const existing = await queryOne<{
      id: string;
      approval_status: string;
      label_url: string | null;
      margin_split_percentage: string | null;
      margin_approval_status: string | null;
      price: string;
      supplier_price: string;
      supplier_review_status: string | null;
    }>(
      'SELECT id, approval_status, label_url, margin_split_percentage, margin_approval_status, price, supplier_price, supplier_review_status FROM products WHERE id = $1 AND supplier_id = $2 AND deleted_at IS NULL',
      [id, supplierId]
    );

    if (!existing) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // NEW WORKFLOW: If product has supplier_review_status, use restricted update schema
    // Suppliers can only update pricing, inventory, and documents
    if (existing.supplier_review_status !== null) {
      const body = await request.json();
      const validationResult = supplierProductUpdateRestrictedSchema.safeParse({ ...body, id });
      
      if (!validationResult.success) {
        securityLogger.logValidationFailure(
          `/api/supplier/products/${id}`,
          ip,
          validationResult.error.issues,
          'PUT'
        );
        return NextResponse.json(
          { error: 'Validation failed. Only pricing, inventory, and documents can be updated.', details: validationResult.error.issues },
          { status: 400 }
        );
      }

      const data = validationResult.data;
      const updates: Record<string, unknown> = {};
      
      // Only allow restricted fields
      if (data.supplier_price !== undefined) updates.supplier_price = data.supplier_price;
      if (data.margin_split_percentage !== undefined) updates.margin_split_percentage = data.margin_split_percentage;
      if (data.icc_available_quantity !== undefined) updates.icc_available_quantity = data.icc_available_quantity;
      if (data.sds_url !== undefined) updates.sds_url = data.sds_url;
      if (data.label_url !== undefined) updates.label_url = data.label_url;

      // Update supplier_review_status to in_progress if it was pending
      if (existing.supplier_review_status === 'pending_supplier_review') {
        updates.supplier_review_status = 'supplier_in_progress';
      }

      // Track completion status
      if (data.supplier_price !== undefined && data.supplier_price > 0) {
        updates.supplier_pricing_completed = true;
      }
      if (data.icc_available_quantity !== undefined && data.icc_available_quantity >= 0) {
        updates.supplier_inventory_completed = true;
      }
      if (data.sds_url !== undefined || data.label_url !== undefined) {
        updates.supplier_documents_completed = true;
      }

      // Build and execute update query
      if (Object.keys(updates).length > 0) {
        await query(
          `UPDATE products 
           SET ${Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW()
           WHERE id = $1`,
          [id, ...Object.values(updates)]
        );
      }

      // Handle warehouse updates
      if (data.warehouses !== undefined && Array.isArray(data.warehouses)) {
        // Delete existing warehouse assignments
        await query('DELETE FROM product_warehouses WHERE product_id = $1', [id]);
        
        // Insert new warehouse assignments
        for (const wh of data.warehouses) {
          // Verify warehouse belongs to supplier
          const warehouseLink = await queryOne<{ warehouse_id: string }>(
            `SELECT warehouse_id FROM supplier_warehouses 
             WHERE warehouse_id = $1 AND supplier_id = $2`,
            [wh.warehouse_id, supplierId]
          );
          
          if (warehouseLink) {
            await query(
              `INSERT INTO product_warehouses (product_id, warehouse_id, inventory_count)
               VALUES ($1, $2, $3)`,
              [id, wh.warehouse_id, wh.quantity]
            );
          }
        }
        
        // Sync main product inventory_count
        await syncProductInventoryCount(id);
      }

      return NextResponse.json({
        success: true,
        message: 'Product updated successfully',
      });
    }

    // LEGACY WORKFLOW: Original supplier product update logic for products without supplier_review_status
    // If product is published, only allow updating certain fields
    if (existing.approval_status === 'published') {
      const body = await request.json();
      // Only allow updating: price, supplier_price, icc_available_quantity, sds_url, label_url, warehouse_id, icc_margin_percent
      const allowedUpdates: Record<string, unknown> = {};
      if (body.price !== undefined) allowedUpdates.price = body.price;
      if (body.supplier_price !== undefined) allowedUpdates.supplier_price = body.supplier_price;
      if (body.icc_available_quantity !== undefined) allowedUpdates.icc_available_quantity = body.icc_available_quantity;
      if (body.sds_url !== undefined) allowedUpdates.sds_url = body.sds_url;
      if (body.label_url !== undefined) allowedUpdates.label_url = body.label_url;
      if (body.icc_margin_percent !== undefined) allowedUpdates.icc_margin_percent = body.icc_margin_percent;
      
      // Recalculate margins if price, supplier_price, or icc_margin_percent changed
      if (body.price !== undefined || body.supplier_price !== undefined || body.icc_margin_percent !== undefined) {
        // Get current values
        const currentProduct = await queryOne<{ price: string; supplier_price: string; icc_margin_percent: string }>(
          'SELECT price, supplier_price, icc_margin_percent FROM products WHERE id = $1 AND deleted_at IS NULL',
          [id]
        );
        
        if (currentProduct) {
          const storePrice = body.price !== undefined ? body.price : parseFloat(currentProduct.price);
          const supplierPrice = body.supplier_price !== undefined ? body.supplier_price : parseFloat(currentProduct.supplier_price);
          const iccMarginPercent = body.icc_margin_percent !== undefined ? body.icc_margin_percent : (currentProduct.icc_margin_percent ? parseFloat(currentProduct.icc_margin_percent) : null);
          
          if (iccMarginPercent && iccMarginPercent > 0) {
            // `icc_margin_percent` is the ICC share of TOTAL MARGIN (not store price).
            // This matches admin margin-approval and purchase-order calculations.
            const totalMargin = storePrice - supplierPrice;
            const iccMarginAmount = (totalMargin * iccMarginPercent) / 100;
            const customerMarginAmount = totalMargin - iccMarginAmount;
            const customerMarginPercent = storePrice > 0
              ? (customerMarginAmount / storePrice) * 100
              : 0;

            allowedUpdates.icc_margin_amount = iccMarginAmount;
            allowedUpdates.customer_margin_percent = customerMarginPercent;
            allowedUpdates.customer_margin_amount = customerMarginAmount;
            
            // If margin changed, reset margin approval status
            if (body.icc_margin_percent !== undefined && body.icc_margin_percent !== parseFloat(currentProduct.icc_margin_percent || '0')) {
              allowedUpdates.margin_approval_status = 'pending';
            }
          }
        }
      }

      if (Object.keys(allowedUpdates).length === 0 && !body.warehouses && !body.warehouse_id) {
        return NextResponse.json(
          { error: 'No inventory fields to update. Other product fields are managed by administrators.' },
          { status: 400 }
        );
      }

      // Update allowed fields if any
      if (Object.keys(allowedUpdates).length > 0) {
        await query(
          `UPDATE products
           SET ${Object.keys(allowedUpdates).map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW()
           WHERE id = $1`,
          [id, ...Object.values(allowedUpdates)]
        );
      }

      // Handle warehouse update for published products - support multiple warehouses
      if (body.warehouses !== undefined && Array.isArray(body.warehouses)) {
        // New multi-warehouse approach
        const validWarehouses = body.warehouses.filter(
          (wh: { warehouse_id: string; inventory_count: number }) => 
            wh.warehouse_id && wh.warehouse_id.trim() !== ''
        );

        if (validWarehouses.length > 0) {
          // Verify all warehouses belong to supplier
          const warehouseIds = validWarehouses.map((wh: { warehouse_id: string }) => wh.warehouse_id);
          const warehouseLinks = await query<{ warehouse_id: string }>(
            `SELECT warehouse_id FROM supplier_warehouses 
             WHERE warehouse_id = ANY($1) AND supplier_id = $2`,
            [warehouseIds, supplierId]
          );

          const validWarehouseIds = new Set(warehouseLinks.map(w => w.warehouse_id));
          const filteredWarehouses = validWarehouses.filter(
            (wh: { warehouse_id: string }) => validWarehouseIds.has(wh.warehouse_id)
          );

          // Remove existing product_warehouses entries for this product (only supplier's warehouses)
          await query(
            `DELETE FROM product_warehouses 
             WHERE product_id = $1 
             AND warehouse_id IN (
               SELECT warehouse_id FROM supplier_warehouses WHERE supplier_id = $2
             )`,
            [id, supplierId]
          );

          // Insert new warehouse entries
          for (const wh of filteredWarehouses) {
            await query(
              `INSERT INTO product_warehouses (product_id, warehouse_id, inventory_count)
               VALUES ($1, $2, $3)
               ON CONFLICT (product_id, warehouse_id) 
               DO UPDATE SET inventory_count = $3, updated_at = NOW()`,
              [id, wh.warehouse_id, wh.inventory_count || 0]
            );
          }

          // Sync main product inventory_count with sum of warehouse inventories
          await syncProductInventoryCount(id);

          if (process.env.NODE_ENV === 'development') {
            console.log(`Saved ${filteredWarehouses.length} warehouse(s) for published product ${id}`);
          }
        } else {
          // No valid warehouses - remove all warehouse entries for this product
          await query(
            `DELETE FROM product_warehouses 
             WHERE product_id = $1 
             AND warehouse_id IN (
               SELECT warehouse_id FROM supplier_warehouses WHERE supplier_id = $2
             )`,
            [id, supplierId]
          );
          
          // Sync main product inventory_count with sum of warehouse inventories
          await syncProductInventoryCount(id);
        }
      } else if (body.warehouse_id !== undefined) {
        // Backward compatibility: single warehouse_id
        const currentProduct = await queryOne<{ icc_available_quantity: number }>(
          `SELECT icc_available_quantity FROM products WHERE id = $1 AND deleted_at IS NULL`,
          [id]
        );

        if (body.warehouse_id && body.warehouse_id !== '') {
          // Verify warehouse belongs to supplier
          const warehouseLink = await queryOne<{ warehouse_id: string }>(
            `SELECT warehouse_id FROM supplier_warehouses 
             WHERE warehouse_id = $1 AND supplier_id = $2`,
            [body.warehouse_id, supplierId]
          );

          if (warehouseLink) {
            const inventoryCount = body.icc_available_quantity !== undefined
              ? body.icc_available_quantity
              : (currentProduct?.icc_available_quantity || 0);

            // Remove existing warehouse entries for this product
            await query(
              `DELETE FROM product_warehouses 
               WHERE product_id = $1 
               AND warehouse_id IN (
                 SELECT warehouse_id FROM supplier_warehouses WHERE supplier_id = $2
               )`,
              [id, supplierId]
            );

            // Create new warehouse entry
            await query(
              `INSERT INTO product_warehouses (product_id, warehouse_id, inventory_count)
               VALUES ($1, $2, $3)
               ON CONFLICT (product_id, warehouse_id) 
               DO UPDATE SET inventory_count = $3, updated_at = NOW()`,
              [id, body.warehouse_id, inventoryCount]
            );

            // Sync main product inventory_count with sum of warehouse inventories
            await syncProductInventoryCount(id);

            if (process.env.NODE_ENV === 'development') {
              console.log(`Saved warehouse ${body.warehouse_id} for published product ${id}`);
            }
          }
        } else {
          // Remove warehouse if empty
          await query(
            `DELETE FROM product_warehouses 
             WHERE product_id = $1 
             AND warehouse_id IN (
               SELECT warehouse_id FROM supplier_warehouses WHERE supplier_id = $2
             )`,
            [id, supplierId]
          );
          
          // Sync main product inventory_count with sum of warehouse inventories
          await syncProductInventoryCount(id);
        }
      }
    }

    // Revalidate pages after updates
    const { revalidatePath } = await import('next/cache');
    revalidatePath('/supplier/products');
    revalidatePath('/api/supplier/products', 'page');
    revalidatePath('/admin/products');
    revalidatePath('/api/admin/products', 'page');
    console.log('✓ Revalidated /supplier/products and /admin/products pages and API routes after product update');

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: `/api/supplier/products/${id}`,
      method: 'PUT',
      details: {
        action: 'product_updated',
        supplier_id: supplierId,
        product_id: id,
      },
      severity: 'low',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    securityLogger.logError('Failed to update supplier product', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/supplier/products/:id - Delete product
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifySupplierAuth(request);

  if (!authResult.authorized || !authResult.session) {
    return authResult.response!;
  }

  const { id } = await params;
  const supplierId = authResult.session.user.id;
  const ip = getClientIp(request);

  try {
    // Verify product belongs to supplier and get supplier info
    const existing = await queryOne<{ 
      id: string; 
      name: string; 
      approval_status: string;
      deletion_requested_at: string | null;
      supplier_name: string;
      supplier_company: string;
      supplier_email: string;
    }>(
      `SELECT p.id, p.name, p.approval_status, p.deletion_requested_at,
              su.name as supplier_name, su.company_name as supplier_company, su.email as supplier_email
       FROM products p
       JOIN supplier_users su ON su.id = p.supplier_id
       WHERE p.id = $1 AND p.supplier_id = $2 AND p.deleted_at IS NULL`,
      [id, supplierId]
    );

    if (!existing) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Check if deletion already requested
    if (existing.deletion_requested_at) {
      return NextResponse.json({ 
        success: true,
        message: 'Admin has been notified. Once approved, the product will be deleted.',
        pendingApproval: true
      });
    }

    // Mark product for deletion (requires admin approval)
    await queryOne(
      `UPDATE products 
       SET deletion_requested_at = NOW(), updated_at = NOW()
       WHERE id = $1 
       RETURNING id`,
      [id]
    );

    // Import email function
    const { sendProductDeletionRequestNotification } = await import('@/lib/email');

    // Send email notification to admin (non-blocking - log errors but don't fail request)
    try {
      await sendProductDeletionRequestNotification({
        productId: id,
        productName: existing.name,
        supplierName: existing.supplier_name,
        supplierCompany: existing.supplier_company,
        supplierEmail: existing.supplier_email,
        approvalStatus: existing.approval_status,
        ip,
      });
    } catch (emailError) {
      console.error('Failed to send deletion request notification email:', emailError);
      // Log but don't fail the request
      securityLogger.logEvent({
        type: 'admin_action',
        ip,
        path: `/api/supplier/products/${id}`,
        method: 'DELETE',
        details: {
          action: 'product_deletion_request_created',
          error: 'email_notification_failed',
          email_error: emailError instanceof Error ? emailError.message : String(emailError),
        },
        severity: 'medium',
      });
    }

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: `/api/supplier/products/${id}`,
      method: 'DELETE',
      details: {
        action: 'product_deletion_requested',
        supplier_id: supplierId,
        product_id: id,
        product_name: existing.name,
        approval_status: existing.approval_status,
      },
      severity: 'medium',
    });

    return NextResponse.json({ 
      success: true,
      message: 'Deletion request submitted. Admin has been notified and will review your request.',
      pendingApproval: true
    });
  } catch (error) {
    securityLogger.logError('Failed to delete supplier product', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

