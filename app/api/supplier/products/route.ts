import { NextRequest, NextResponse } from 'next/server';
import { verifySupplierAuth } from '@/lib/supplier-middleware';
import { supplierProductCreateSchema } from '@/lib/validation';
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

  // Update the main product inventory_count
  await pool.query(
    `UPDATE products
     SET inventory_count = $1,
         in_stock = $1 > 0,
         updated_at = NOW()
     WHERE id = $2`,
    [totalWarehouseInventory, productId]
  );
}

// GET /api/supplier/products - Get all products for the supplier
export async function GET(request: NextRequest) {
  const authResult = await verifySupplierAuth(request);

  if (!authResult.authorized || !authResult.session) {
    return authResult.response!;
  }

  const supplierId = authResult.session.user.id;

  try {
    const products = await query<{
      id: string;
      name: string;
      category: string;
      description: string | null;
      price: string;
      approval_status: string;
      sku: string | null;
      in_stock: boolean;
      inventory_count: number;
      icc_available_quantity: number;
      label_url: string | null;
      sds_url: string | null;
      admin_label_url: string | null;
      created_at: string;
      updated_at: string;
      margin_split_percentage: string | null;
      margin_approval_status: string | null;
      margin_approval_notes: string | null;
    }>(
      `SELECT
        id, name, category, description, price, approval_status,
        sku, in_stock, inventory_count, icc_available_quantity,
        label_url, sds_url, admin_label_url, created_at, updated_at,
        margin_split_percentage, margin_approval_status, margin_approval_notes
      FROM products
      WHERE supplier_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC`,
      [supplierId]
    );

    return NextResponse.json({ products });
  } catch (error) {
    securityLogger.logError('Failed to fetch supplier products', error, getClientIp(request));
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/supplier/products - DEPRECATED: Product creation managed by administrators
// Suppliers can no longer create products directly. Products are now created by admins and assigned to suppliers
export async function POST(request: NextRequest) {
  const authResult = await verifySupplierAuth(request);

  if (!authResult.authorized || !authResult.session) {
    return authResult.response!;
  }

  const ip = getClientIp(request);

  // Product creation is now managed by administrators only - log the blocked attempt
  securityLogger.logEvent({
    type: 'admin_action',
    ip,
    path: '/api/supplier/products',
    method: 'POST',
    details: {
      action: 'blocked_supplier_product_creation',
      supplier_id: authResult.session.user.id,
      reason: 'New workflow: admins create products and assign to suppliers',
    },
    severity: 'low',
  });

  return NextResponse.json(
    { 
      error: 'Suppliers can no longer create products directly. Products are assigned by admins.',
      details: 'Please contact your administrator to have products assigned to you.'
    },
    { status: 403 }
  );

  /* LEGACY CODE - Kept for reference if needed for migration
  try {
    const body = await request.json();

    // Log incoming request for debugging
    console.log('Supplier product creation request from:', supplierId);
    try {
      console.log('Request body:', JSON.stringify(body, null, 2));
    } catch {
      console.log('Request body: [Unable to stringify]');
    }

    // Validate input
    const validationResult = supplierProductCreateSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('Validation failed for supplier product:', validationResult.error.issues);
      try {
        securityLogger.logValidationFailure(
          '/api/supplier/products',
          ip,
          validationResult.error.issues,
          'POST'
        );
      } catch {
        // Ignore security logging errors in test environment
      }
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Determine margin approval status based on whether margin is provided
    const hasMargin = data.margin_split_percentage !== undefined && data.margin_split_percentage !== null;
    const marginApprovalStatus = hasMargin ? 'pending' : null;
    const marginSubmittedAt = hasMargin ? new Date().toISOString() : null;

    // Create product with pending status
    const product = await queryOne<{
      id: string;
      name: string;
      approval_status: string;
    }>(
      `INSERT INTO products (
        supplier_id, name, category, description, full_description,
        price, supplier_price, sku, unit_of_measure, image,
        in_stock, inventory_count, attributes, approved_states,
        features, specifications, restricted_use, icc_available_quantity,
        label_url, sds_url, label_template_id, approval_status,
        margin_split_percentage, icc_margin_percent, margin_approval_status, margin_submitted_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 'pending', $22, $22, $23, $24)
      RETURNING id, name, approval_status`,
      [
        supplierId,
        data.name,
        data.category,
        data.description,
        data.full_description || null,
        data.price,
        data.supplier_price || data.price,
        data.sku || null,
        data.unit_of_measure || null,
        data.image || null,
        true,
        0,
        JSON.stringify(data.attributes || {}),
        data.approved_states || [],
        data.features || [],
        JSON.stringify(data.specifications || {}),
        data.restricted_use || false,
        data.icc_available_quantity || 0,
        data.label_url || null,
        data.sds_url || null,
        data.label_template_id || null,
        data.margin_split_percentage ?? null,
        marginApprovalStatus,
        marginSubmittedAt,
      ]
    );
    
    // Log margin history if margin was submitted
    if (data.icc_margin_percent && product) {
      await query(
        `INSERT INTO product_margin_history (product_id, action, icc_margin_percent, performed_by, notes)
         VALUES ($1, 'submitted', $2, $3, 'Initial margin submission')`,
        [product.id, data.icc_margin_percent, supplierId]
      );
    }

    if (!product) {
      throw new Error('Failed to create product');
    }

    // Create product_warehouses entries - support multiple warehouses
    if (data.warehouses !== undefined && Array.isArray(data.warehouses)) {
      // New multi-warehouse approach
      const validWarehouses = data.warehouses.filter(
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

        // Insert warehouse entries
        for (const wh of filteredWarehouses) {
          await query(
            `INSERT INTO product_warehouses (product_id, warehouse_id, inventory_count)
             VALUES ($1, $2, $3)
             ON CONFLICT (product_id, warehouse_id) 
             DO UPDATE SET inventory_count = $3, updated_at = NOW()`,
            [product.id, wh.warehouse_id, wh.inventory_count || 0]
          );
        }

        // Sync main product inventory_count with sum of warehouse inventories
        await syncProductInventoryCount(product.id);
      } else {
        // No valid warehouses - set inventory_count directly to icc_available_quantity
        await query(
          `UPDATE products 
           SET inventory_count = $1, in_stock = $1 > 0
           WHERE id = $2`,
          [data.icc_available_quantity || 0, product.id]
        );
      }
    } else if (data.warehouse_id) {
      // Backward compatibility: single warehouse_id
      // Verify warehouse belongs to supplier
      const warehouseLink = await queryOne<{ warehouse_id: string }>(
        `SELECT warehouse_id FROM supplier_warehouses 
         WHERE warehouse_id = $1 AND supplier_id = $2`,
        [data.warehouse_id, supplierId]
      );

      if (warehouseLink) {
        // Create or update product_warehouses entry with ICC quantity
        await query(
          `INSERT INTO product_warehouses (product_id, warehouse_id, inventory_count)
           VALUES ($1, $2, $3)
           ON CONFLICT (product_id, warehouse_id) 
           DO UPDATE SET inventory_count = $3, updated_at = NOW()`,
          [product.id, data.warehouse_id, data.icc_available_quantity || 0]
        );
        
        // Sync main product inventory_count with sum of warehouse inventories
        await syncProductInventoryCount(product.id);
      } else {
        // Warehouse not found or doesn't belong to supplier
        // Set inventory_count directly to icc_available_quantity if no warehouse
        await query(
          `UPDATE products 
           SET inventory_count = $1, in_stock = $1 > 0
           WHERE id = $2`,
          [data.icc_available_quantity || 0, product.id]
        );
      }
    } else {
      // No warehouse assigned - set inventory_count directly to icc_available_quantity
      await query(
        `UPDATE products 
         SET inventory_count = $1, in_stock = $1 > 0
         WHERE id = $2`,
        [data.icc_available_quantity || 0, product.id]
      );
    }

    // Record approval history
    await query(
      `INSERT INTO product_approval_history (product_id, action, performed_by, notes)
       VALUES ($1, 'submitted', $2, 'Product submitted for approval')`,
      [product.id, supplierId]
    );

    // Record margin approval history if margin was submitted
    if (hasMargin) {
      await query(
        `INSERT INTO margin_approval_history (product_id, action, performed_by, performer_type, margin_split_percentage, notes)
         VALUES ($1, 'submitted', $2, 'supplier', $3, 'Margin split submitted for approval')`,
        [product.id, supplierId, data.margin_split_percentage]
      );
    }

    // TODO: Send notification email to admin about new product submission
    // This would be implemented in a separate email service function

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: '/api/supplier/products',
      method: 'POST',
      details: {
        action: 'product_created',
        supplier_id: supplierId,
        product_id: product.id,
        product_name: product.name,
      },
      severity: 'low',
    });

    return NextResponse.json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        approval_status: product.approval_status,
      },
    }, { status: 201 });
  } catch (error) {
    securityLogger.logError('Failed to create supplier product', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
  END OF LEGACY CODE */
}

