import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { queryOne, query } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { sendLabelModificationEmail } from '@/lib/supplier-emails';
import { randomBytes } from 'crypto';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { getDocumentProxyUrl } from '@/lib/s3';
import { classifyNmfc } from '@/lib/nmfc-classifier';

interface ProductAttributes {
  activeIngredients: string;
  epaSignalWord: string;
  epaRegistrationNumber: string;
  applicationRateRange: string;
  containerSizes: string;
  availabilityDate: string;
}

interface ProductDocument {
  name: string;
  url: string;
}

interface Product {
  id: string;
  name: string;
  category: string;
  description: string | null;
  full_description: string | null;
  sku: string | null;
  price: string;
  original_price: string | null;
  msrp: string | null;
  unit_of_measure: string | null;
  image: string | null;
  in_stock: boolean;
  inventory_count: number;
  rating: string | null;
  review_count: number | null;
  minimum_order_qty: number | null;
  next_available_quantity: number | null;
  next_available_date: string | null;
  attributes: ProductAttributes | null;
  approved_states: string[] | null;
  features: string[] | null;
  specifications: Record<string, string> | null;
  documents: ProductDocument[] | null;
  restricted_use: boolean;
  created_at: string;
  updated_at: string;
  supplier_id?: string | null;
  supplier_price?: string | null;
  label_url?: string | null;
  admin_label_url?: string | null;
  approval_status?: string;
  icc_margin_percent?: string | null;
  icc_margin_amount?: string | null;
  customer_margin_percent?: string | null;
  customer_margin_amount?: string | null;
  margin_split_percentage?: string | null;
  margin_approval_status?: string | null;
  margin_approved_at?: string | null;
  margin_approved_by?: string | null;
  margin_notes?: string | null;
  nmfc_number?: string | null;
  freight_class?: string | null;
  carton_length?: string | null;
  carton_width?: string | null;
  carton_height?: string | null;
  carton_weight_lbs?: string | null;
  nmfc_ai_suggestion?: string | null;
  nmfc_ai_reasoning?: string | null;
  nmfc_ai_status?: string | null;
  freight_class_ai_suggestion?: string | null;
  truckload_eligible?: boolean;
  gallons_per_case?: number | null;
  cases_per_pallet?: number | null;
  bulk_density_lbs_per_gallon?: number | null;
}

interface SupplierUser {
  id: string;
  email: string;
  name: string;
  company_name: string;
}

// Helper function to extract label URL from documents array
function extractLabelUrl(documents: ProductDocument[] | null): string | null {
  if (!documents || !Array.isArray(documents)) {
    return null;
  }
  const labelDoc = documents.find(
    (doc) => doc.name && doc.url && doc.name.toLowerCase().includes('label')
  );
  return labelDoc?.url || null;
}

// GET /api/admin/products/[id] - Get a single product
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireAdmin('products.view');
    console.log('[GET PRODUCT] requireAdmin completed:', { hasError: !!auth.error });
  } catch (error) {
    console.error('[GET PRODUCT] requireAdmin threw error:', error);
    return NextResponse.json({ error: 'Authentication error' }, { status: 500 });
  }
  
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    console.log('[GET PRODUCT] Fetching product:', id);
    
    const product = await queryOne<Product & { sds_url?: string | null; label_url?: string | null; admin_label_url?: string | null }>(
    `SELECT id, name, category, description, full_description, sku, price, original_price, msrp,
            unit_of_measure, image, in_stock, inventory_count, rating, review_count,
            minimum_order_qty, next_available_quantity, 
            next_available_date::text as next_available_date,
            attributes, approved_states, features, specifications, documents, restricted_use,
            sds_url, label_url, admin_label_url,
            supplier_id, supplier_price, approval_status,
            icc_margin_percent, icc_margin_amount,
            customer_margin_percent, customer_margin_amount,
            margin_split_percentage,
            margin_approval_status, margin_approved_at, margin_approved_by, margin_notes,
            compared_to,
            nmfc_number, freight_class, carton_length, carton_width, carton_height, carton_weight_lbs,
            nmfc_ai_suggestion, nmfc_ai_reasoning, nmfc_ai_status, freight_class_ai_suggestion,
            gallons_per_case, cases_per_pallet, bulk_density_lbs_per_gallon,
            created_at, updated_at
     FROM products WHERE id = $1 AND deleted_at IS NULL`, 
    [id]
  );

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  // Merge sds_url and label_url into documents array if they exist
  // Convert existing document URLs to proxy URLs if they're S3 URLs
  const documents: ProductDocument[] = Array.isArray(product.documents) 
    ? product.documents.map(doc => ({
        ...doc,
        url: getDocumentProxyUrl(doc.url) || doc.url,
      }))
    : [];
  
  // Add SDS document if sds_url exists and not already in documents (convert to proxy URL)
  if (product.sds_url) {
    const sdsProxyUrl = getDocumentProxyUrl(product.sds_url) || product.sds_url;
    const sdsExists = documents.some(doc => 
      doc.url === product.sds_url || 
      doc.url === sdsProxyUrl ||
      doc.name?.toLowerCase().includes('sds')
    );
    
    if (!sdsExists) {
      documents.push({
        name: 'Safety Data Sheet (SDS)',
        url: sdsProxyUrl,
      });
    }
  }
  
  // Add Label document - prefer admin_label_url if it exists (admin-modified version), otherwise use label_url
  const labelUrl = product.admin_label_url || product.label_url;
  if (labelUrl) {
    const labelProxyUrl = getDocumentProxyUrl(labelUrl) || labelUrl;
    const labelExists = documents.some(doc => 
      doc.url === product.label_url || 
      doc.url === product.admin_label_url ||
      doc.url === labelProxyUrl ||
      doc.name?.toLowerCase().includes('label')
    );
    
    if (!labelExists) {
      documents.push({
        name: product.admin_label_url ? 'Product Label (Admin Modified)' : 'Product Label',
        url: labelProxyUrl,
      });
    }
  }

    // Return product with merged documents
    return NextResponse.json({
      ...product,
      documents: documents.length > 0 ? documents : null,
    });
  } catch (error) {
    console.error('[GET PRODUCT] Error fetching product:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}

// PUT /api/admin/products/[id] - Update a product
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('products.update');
  if (auth.error) return auth.error;

  const { id } = await params;
  const ip = getClientIp(request);

  try {
    // Get the existing product for audit log
    const existingProduct = await queryOne<Product>(
      `SELECT id, name, category, description, full_description, sku, price, original_price, msrp,
              unit_of_measure, image, in_stock, inventory_count, rating, review_count,
              minimum_order_qty, next_available_quantity, 
              next_available_date::text as next_available_date,
              attributes, approved_states, features, specifications, documents, restricted_use,
              supplier_id, supplier_price, approval_status,
              icc_margin_percent, icc_margin_amount,
              customer_margin_percent, customer_margin_amount,
              margin_approval_status, margin_approved_at, margin_approved_by, margin_notes,
              carton_length, carton_width, carton_height, carton_weight_lbs,
              truckload_eligible,
              created_at, updated_at
       FROM products WHERE id = $1 AND deleted_at IS NULL`, 
      [id]
    );

    if (!existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      name,
      category,
      description,
      full_description,
      sku,
      price,
      original_price,
      msrp,
      unit_of_measure,
      image,
      // in_stock, // Not used - automatically calculated from inventory_count
      inventory_count,
      rating,
      review_count,
      minimum_order_qty,
      next_available_quantity,
      next_available_date,
      attributes,
      approved_states,
      features,
      specifications,
      documents,
      sds_url,
      restricted_use,
      icc_margin_percent,
      supplier_id,
      compared_to,
      nmfc_number,
      freight_class,
      carton_length,
      carton_width,
      carton_height,
      carton_weight_lbs,
      truckload_eligible,
      gallons_per_case,
      cases_per_pallet,
      bulk_density_lbs_per_gallon,
    } = body;

    // Check for duplicate SKU (exclude the current product)
    if (sku) {
      const existingSku = await query<{ id: string }>(
        `SELECT id FROM products WHERE sku = $1 AND id != $2 AND deleted_at IS NULL LIMIT 1`,
        [sku, id]
      );
      if (existingSku.length > 0) {
        return NextResponse.json(
          { error: `Item number "${sku}" is already in use. Please choose a different SKU.` },
          { status: 409 }
        );
      }
    }

    // Check if product has any warehouse entries
    const warehouseCount = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM product_warehouses WHERE product_id = $1`,
      [id]
    );
    const hasWarehouseEntries = warehouseCount && parseInt(warehouseCount.count || '0', 10) > 0;
    
    // If warehouses exist, inventory_count MUST be the sum of warehouse inventories (no manual override)
    // If no warehouses, use the provided inventory_count or keep existing
    let finalInventoryCount: number;
    let inventoryToCheck: number;
    
    if (hasWarehouseEntries) {
      // Sync from warehouses - ignore any manually provided inventory_count
      const warehouseTotal = await queryOne<{ total: string }>(
        `SELECT COALESCE(SUM(inventory_count), 0) as total
         FROM product_warehouses
         WHERE product_id = $1`,
        [id]
      );
      finalInventoryCount = warehouseTotal ? parseInt(warehouseTotal.total || '0', 10) : 0;
      inventoryToCheck = finalInventoryCount;
    } else {
      // No warehouses - use provided value or keep existing
      finalInventoryCount = inventory_count !== undefined ? inventory_count : existingProduct.inventory_count;
      inventoryToCheck = finalInventoryCount || 0;
    }
    
    // For supplier products, also consider icc_available_quantity
    let finalInStock = inventoryToCheck > 0;
    if (existingProduct.supplier_id) {
      const supplierProduct = await queryOne<{ icc_available_quantity: number | null }>(
        'SELECT icc_available_quantity FROM products WHERE id = $1',
        [id]
      );
      const iccQty = supplierProduct?.icc_available_quantity || 0;
      finalInStock = inventoryToCheck > 0 || iccQty > 0;
    }

    // Calculate margins if icc_margin_percent is being updated
    let iccMarginAmount = undefined;
    let customerMarginPercent = undefined;
    let customerMarginAmount = undefined;
    let marginSplitPercentage = undefined;
    let marginApprovalStatus = undefined;
    let marginSubmittedAt = undefined;

    // Extracts a plain YYYY-MM-DD string from any date representation (string,
    // Date object, or locale string like "Wed Apr 23 2025 00:00:00 GMT-0400").
    // Guards against pg-types returning DATE columns as JS Date objects when
    // the query uses SELECT * without an explicit ::text cast.
    function sanitizeDateParam(value: unknown): string | null {
      if (value === null || value === undefined || value === '') return null;
      if (value instanceof Date) return value.toISOString().split('T')[0];
      const match = String(value).match(/(\d{4}-\d{2}-\d{2})/);
      return match ? match[1] : null;
    }

    // Helper to normalize margin values for comparison
    function normalizeMarginValue(value: string | number | null | undefined): number {
      if (value === null || value === undefined || value === '') {
        return 0;
      }
      const num = parseFloat(String(value));
      return isNaN(num) ? 0 : num;
    }

    // Check if margin-related fields are actually changing
    const iccMarginChanged = icc_margin_percent !== undefined && 
      normalizeMarginValue(icc_margin_percent).toFixed(2) !== normalizeMarginValue(existingProduct.icc_margin_percent).toFixed(2);

    // Use a 0.005 tolerance to avoid false positives from floating-point drift when
    // the form converts total → per-gallon → total (e.g. $16.00 → $0.0604/gal → $16.01).
    const priceChanged = price !== undefined &&
      Math.abs(normalizeMarginValue(price) - normalizeMarginValue(existingProduct.price)) >= 0.005;

    // The admin form submits the supplier cost as `original_price`, and the UPDATE
    // below mirrors that value into `supplier_price`. Detect changes against the
    // existing supplier_price so we know when to recompute margin dollar amounts.
    const supplierPriceChanged = original_price !== undefined &&
      Math.abs(normalizeMarginValue(original_price) - normalizeMarginValue(existingProduct.supplier_price)) >= 0.005;

    // If price or supplier_price is intentionally changed for a product with
    // approved margins, reset margin approval to 'pending' so the new numbers
    // enter the re-approval workflow.
    if ((priceChanged || supplierPriceChanged) && existingProduct.supplier_price && existingProduct.margin_approval_status === 'approved') {
      marginApprovalStatus = 'pending';
    }

    if (iccMarginChanged) {
      // Validate: Cannot change approved margins through product edit
      if (existingProduct.margin_approval_status === 'approved') {
        return NextResponse.json(
          { error: 'Margin has been approved and locked. Use Margin Approval page to modify.' },
          { status: 400 }
        );
      }

      // Validate: Only for supplier products
      if (!existingProduct.supplier_price) {
        return NextResponse.json(
          { error: 'Cannot set ICC margin for non-supplier products' },
          { status: 400 }
        );
      }

      // Calculate margin values using the new inputs
      const storePrice = price !== undefined ? parseFloat(String(price)) : parseFloat(existingProduct.price);
      const supplierPrice = original_price !== undefined
        ? parseFloat(String(original_price))
        : parseFloat(existingProduct.supplier_price);
      const totalMargin = storePrice - supplierPrice;

      iccMarginAmount = (totalMargin * icc_margin_percent) / 100;
      customerMarginAmount = totalMargin - iccMarginAmount;
      customerMarginPercent = storePrice > 0 ? (customerMarginAmount / storePrice) * 100 : 0;

      // Sync to margin_split_percentage for supplier view
      marginSplitPercentage = icc_margin_percent;

      // Set margin status to pending for approval workflow
      marginApprovalStatus = 'pending';
      marginSubmittedAt = new Date().toISOString();
    } else if ((priceChanged || supplierPriceChanged) && existingProduct.supplier_price && existingProduct.icc_margin_percent) {
      // Price or supplier cost changed but the margin split stayed the same.
      // The stored icc_margin_amount / customer_margin_amount are now stale —
      // recompute them so the supplier-facing Margin Breakdown stays in sync
      // with the live Margin Preview.
      const storePrice = price !== undefined ? parseFloat(String(price)) : parseFloat(existingProduct.price);
      const supplierPrice = original_price !== undefined
        ? parseFloat(String(original_price))
        : parseFloat(existingProduct.supplier_price);
      const existingIccPct = parseFloat(existingProduct.icc_margin_percent);
      const totalMargin = storePrice - supplierPrice;

      iccMarginAmount = (totalMargin * existingIccPct) / 100;
      customerMarginAmount = totalMargin - iccMarginAmount;
      customerMarginPercent = storePrice > 0 ? (customerMarginAmount / storePrice) * 100 : 0;
    }

    // Determine if supplier is being newly assigned or changed
    const supplierChanged = supplier_id !== undefined &&
      (supplier_id || null) !== (existingProduct.supplier_id || null);
    const newlyAssignedToSupplier = supplierChanged && supplier_id;
    
    // Determine the final approval_status
    let finalApprovalStatus: string | undefined = undefined;
    if (newlyAssignedToSupplier) {
      finalApprovalStatus = 'pending';
    }

    const product = await queryOne<Product>(
      `UPDATE products
       SET name = $2,
           category = $3,
           description = $4,
           full_description = $5,
           sku = $6,
           price = $7,
           original_price = $8,
           msrp = $9,
           unit_of_measure = $10,
           image = $11,
           in_stock = $12,
           inventory_count = $13,
           rating = $14,
           review_count = $15,
           minimum_order_qty = $16,
           next_available_quantity = $17,
           next_available_date = $18,
           attributes = COALESCE($19, attributes),
           approved_states = COALESCE($20, approved_states),
           features = COALESCE($21, features),
           specifications = COALESCE($22, specifications),
           documents = COALESCE($23, documents),
           sds_url = COALESCE($24, sds_url),
           restricted_use = COALESCE($25, restricted_use),
           icc_margin_percent = COALESCE($26, icc_margin_percent),
           icc_margin_amount = COALESCE($27, icc_margin_amount),
           customer_margin_percent = COALESCE($28, customer_margin_percent),
           customer_margin_amount = COALESCE($29, customer_margin_amount),
           margin_split_percentage = COALESCE($30, margin_split_percentage),
           margin_approval_status = COALESCE($31, margin_approval_status),
           margin_submitted_at = COALESCE($32, margin_submitted_at),
           supplier_id = $33,
           approval_status = COALESCE($34, approval_status),
           compared_to = COALESCE($35, compared_to),
           nmfc_number = $36,
           freight_class = $37,
           carton_length = $38,
           carton_width = $39,
           carton_height = $40,
           carton_weight_lbs = $41,
           truckload_eligible = $42,
           gallons_per_case = $43,
           cases_per_pallet = $44,
           bulk_density_lbs_per_gallon = $45,
           supplier_price = $8,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, category, description, full_description, sku, price, original_price, msrp,
                 unit_of_measure, image, in_stock, inventory_count, rating, review_count,
                 minimum_order_qty, next_available_quantity, 
                 next_available_date::text as next_available_date,
                 attributes, approved_states, features, specifications, documents, sds_url, restricted_use,
                 icc_margin_percent, icc_margin_amount, customer_margin_percent, customer_margin_amount,
                margin_approval_status, margin_approved_at, margin_notes,
                supplier_id, supplier_price, approval_status, compared_to,
                 nmfc_number, freight_class, carton_length, carton_width, carton_height, carton_weight_lbs,
                 truckload_eligible,
                 gallons_per_case, cases_per_pallet, bulk_density_lbs_per_gallon,
                 nmfc_ai_suggestion, nmfc_ai_reasoning, nmfc_ai_status, freight_class_ai_suggestion,
                 created_at, updated_at`,
      [
        id,
        name !== undefined ? name : existingProduct.name,
        category !== undefined ? category : existingProduct.category,
        description !== undefined ? description : existingProduct.description,
        full_description !== undefined ? full_description : existingProduct.full_description,
        sku !== undefined ? sku : existingProduct.sku,
        price !== undefined ? price : existingProduct.price,
        original_price !== undefined ? original_price : existingProduct.original_price,
        msrp !== undefined ? msrp : existingProduct.msrp,
        unit_of_measure !== undefined ? unit_of_measure : existingProduct.unit_of_measure,
        image !== undefined ? image : existingProduct.image,
        finalInStock,
        finalInventoryCount,
        rating !== undefined ? rating : existingProduct.rating,
        review_count !== undefined ? review_count : existingProduct.review_count,
        minimum_order_qty !== undefined ? minimum_order_qty : existingProduct.minimum_order_qty,
        next_available_quantity !== undefined ? next_available_quantity : existingProduct.next_available_quantity,
        sanitizeDateParam(next_available_date !== undefined ? next_available_date : existingProduct.next_available_date),
        attributes ? JSON.stringify(attributes) : existingProduct.attributes,
        approved_states || existingProduct.approved_states,
        features || existingProduct.features,
        specifications ? JSON.stringify(specifications) : existingProduct.specifications,
        documents ? JSON.stringify(documents) : existingProduct.documents,
        sds_url !== undefined ? sds_url : undefined,
        restricted_use,
        iccMarginChanged ? icc_margin_percent : undefined,
        iccMarginAmount,
        customerMarginPercent,
        customerMarginAmount,
        marginSplitPercentage,
        marginApprovalStatus,
        marginSubmittedAt,
        supplier_id !== undefined ? (supplier_id || null) : (existingProduct.supplier_id || null),
        finalApprovalStatus,
        compared_to !== undefined ? (compared_to === '' ? null : compared_to) : undefined,
        nmfc_number !== undefined ? (nmfc_number || null) : existingProduct.nmfc_number,
        freight_class !== undefined && freight_class !== '' ? freight_class : existingProduct.freight_class,
        carton_length !== undefined ? (carton_length ?? null) : existingProduct.carton_length,
        carton_width !== undefined ? (carton_width ?? null) : existingProduct.carton_width,
        carton_height !== undefined ? (carton_height ?? null) : existingProduct.carton_height,
        carton_weight_lbs !== undefined ? (carton_weight_lbs ?? null) : existingProduct.carton_weight_lbs,
        truckload_eligible !== undefined ? !!truckload_eligible : (existingProduct.truckload_eligible ?? false),
        gallons_per_case !== undefined ? (gallons_per_case ?? null) : (existingProduct.gallons_per_case ?? null),
        cases_per_pallet !== undefined ? (cases_per_pallet ?? null) : (existingProduct.cases_per_pallet ?? null),
        bulk_density_lbs_per_gallon !== undefined ? (bulk_density_lbs_per_gallon ?? null) : (existingProduct.bulk_density_lbs_per_gallon ?? null),
      ]
    );

    // Log supplier assignment in product_approval_history
    if (newlyAssignedToSupplier && product) {
      try {
        await query(
          `INSERT INTO product_approval_history (product_id, action, performed_by, notes)
           VALUES ($1, 'admin_assigned_supplier', $2, $3)`,
          [id, auth.session.adminUser.id, `Admin assigned product to supplier ${supplier_id}`]
        );
      } catch (historyError) {
        securityLogger.logError('Failed to log supplier assignment history', historyError, ip);
      }
    }

    // Log margin changes if any
    if (icc_margin_percent !== undefined && 
        icc_margin_percent !== parseFloat(existingProduct.icc_margin_percent || '0')) {
      await logAction({
        adminUserId: auth.session.adminUser.id,
        action: 'update',
        resourceType: 'product',
        resourceId: id,
        before: { 
          icc_margin_percent: existingProduct.icc_margin_percent,
          margin_split_percentage: existingProduct.margin_split_percentage 
        } as unknown as Record<string, unknown>,
        after: { 
          icc_margin_percent,
          margin_split_percentage: marginSplitPercentage 
        } as unknown as Record<string, unknown>,
      });
    }

    // Check if label was changed and trigger approval workflow for supplier products
    if (existingProduct.supplier_id && documents) {
      const existingDocs = existingProduct.documents as ProductDocument[] | null;
      const existingLabelUrl = extractLabelUrl(existingDocs) || existingProduct.label_url;
      const newLabelUrl = extractLabelUrl(documents as ProductDocument[]);

      // If label URL changed and product is published or admin_approved
      if (newLabelUrl && newLabelUrl !== existingLabelUrl && 
          (existingProduct.approval_status === 'published' || existingProduct.approval_status === 'admin_approved')) {
        try {
          // Update product to pending supplier approval
          await query(
            `UPDATE products 
             SET approval_status = 'label_pending_supplier_approval',
                 admin_label_url = $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [newLabelUrl, id]
          );

          // Record approval history
          await query(
            `INSERT INTO product_approval_history (product_id, action, performed_by, notes, label_url)
             VALUES ($1, 'label_modified', 'admin', $2, $3)`,
            [id, 'Admin modified product label from product form', newLabelUrl]
          );

          // Get supplier info
          const supplier = await queryOne<SupplierUser>(
            `SELECT id, email, name, company_name FROM supplier_users WHERE id = $1`,
            [existingProduct.supplier_id]
          );

          if (supplier) {
            // Generate tokens for approval and rejection
            const approveToken = randomBytes(32).toString('hex');
            const rejectToken = randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

            // Insert both tokens
            await query(
              `INSERT INTO label_approval_tokens (product_id, supplier_id, token, action, expires_at)
               VALUES ($1, $2, $3, 'approve', $4)`,
              [id, existingProduct.supplier_id, approveToken, expiresAt.toISOString()]
            );
            
            await query(
              `INSERT INTO label_approval_tokens (product_id, supplier_id, token, action, expires_at)
               VALUES ($1, $2, $3, 'reject', $4)`,
              [id, existingProduct.supplier_id, rejectToken, expiresAt.toISOString()]
            );

            // Send email to supplier for label approval
            const approveUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/supplier/products/${id}/approve-label?token=${approveToken}`;
            const rejectUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/supplier/products/${id}/reject-label?token=${rejectToken}`;

            await sendLabelModificationEmail({
              to: supplier.email,
              supplierName: supplier.name,
              productName: existingProduct.name,
              adminLabelUrl: newLabelUrl,
              originalLabelUrl: existingLabelUrl || '',
              approveUrl,
              rejectUrl,
              notes: 'Admin modified the product label. Please review and approve.',
            });

            // Log the action
            await logAction({
              adminUserId: auth.session.adminUser.id,
              action: 'status_change',
              resourceType: 'product',
              resourceId: id,
              after: { approval_status: 'label_pending_supplier_approval' } as unknown as Record<string, unknown>,
            });

            // Return success with notification
            return NextResponse.json({
              ...product,
              labelApprovalRequired: true,
              message: 'Product updated. Label modification sent to supplier for approval.',
            });
          }
        } catch (error) {
          securityLogger.logError('Failed to trigger label approval workflow', error, ip);
          // Continue with normal update even if approval workflow fails
        }
      }
    }

    // Log the action
    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'update',
      resourceType: 'product',
      resourceId: id,
      before: existingProduct as unknown as Record<string, unknown>,
      after: product as unknown as Record<string, unknown>,
    });

    // Auto-trigger NMFC AI classification when relevant fields are saved/changed.
    // Runs asynchronously so it does not delay the PUT response.
    // - Non-tote products: trigger when carton dimensions change and dimensions exist
    // - Tote products: trigger when any meaningful field changes (totes have NMFC numbers
    //   like Class 55-70 for pesticides but don't use carton dimensions)
    const finalUom = (unit_of_measure !== undefined ? unit_of_measure : existingProduct.unit_of_measure) ?? '';
    const isToteProduct = ['tote', 'tank'].some(t => finalUom.toLowerCase().includes(t));

    const dimensionsChanged =
      (carton_length !== undefined && String(carton_length ?? '') !== String(existingProduct.carton_length ?? '')) ||
      (carton_width !== undefined && String(carton_width ?? '') !== String(existingProduct.carton_width ?? '')) ||
      (carton_height !== undefined && String(carton_height ?? '') !== String(existingProduct.carton_height ?? '')) ||
      (carton_weight_lbs !== undefined && String(carton_weight_lbs ?? '') !== String(existingProduct.carton_weight_lbs ?? ''));

    const finalCartonLength = carton_length !== undefined ? carton_length : (existingProduct.carton_length ? parseFloat(existingProduct.carton_length) : null);
    const finalCartonWidth = carton_width !== undefined ? carton_width : (existingProduct.carton_width ? parseFloat(existingProduct.carton_width) : null);
    const finalCartonHeight = carton_height !== undefined ? carton_height : (existingProduct.carton_height ? parseFloat(existingProduct.carton_height) : null);
    const finalCartonWeightLbs = carton_weight_lbs !== undefined ? carton_weight_lbs : (existingProduct.carton_weight_lbs ? parseFloat(existingProduct.carton_weight_lbs) : null);

    const hasDimensions = finalCartonLength || finalCartonWidth || finalCartonHeight || finalCartonWeightLbs;

    const toteFieldsChanged =
      (name !== undefined && name !== existingProduct.name) ||
      (description !== undefined && description !== existingProduct.description) ||
      (category !== undefined && category !== existingProduct.category) ||
      (unit_of_measure !== undefined && unit_of_measure !== existingProduct.unit_of_measure) ||
      (carton_weight_lbs !== undefined && String(carton_weight_lbs ?? '') !== String(existingProduct.carton_weight_lbs ?? ''));

    const shouldClassify = isToteProduct
      ? toteFieldsChanged
      : (dimensionsChanged && hasDimensions);

    if (shouldClassify) {
      // Fire-and-forget — classification result will be visible on next page load
      classifyNmfc({
        name: name !== undefined ? name : existingProduct.name,
        description: description !== undefined ? description : existingProduct.description,
        category: category !== undefined ? category : existingProduct.category,
        unit_of_measure: unit_of_measure !== undefined ? unit_of_measure : existingProduct.unit_of_measure,
        carton_length: finalCartonLength as number | null,
        carton_width: finalCartonWidth as number | null,
        carton_height: finalCartonHeight as number | null,
        carton_weight_lbs: finalCartonWeightLbs as number | null,
      })
        .then(async (result) => {
          if (result) {
            await queryOne(
              `UPDATE products
               SET nmfc_ai_suggestion = $2,
                   nmfc_ai_reasoning = $3,
                   nmfc_ai_status = 'pending',
                   freight_class_ai_suggestion = $4,
                   updated_at = NOW()
               WHERE id = $1`,
              [id, result.nmfc_number, result.reasoning, result.freight_class]
            );
          }
        })
        .catch((err) => {
          console.error('[ProductPUT] Background NMFC classification failed:', err);
        });
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

// DELETE /api/admin/products/[id] - Delete a product
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('products.delete');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    // Get the existing product for audit log
    const existingProduct = await queryOne<Product>(
      `SELECT id, name, category, description, full_description, sku, price, original_price, msrp,
              unit_of_measure, image, in_stock, inventory_count, rating, review_count,
              minimum_order_qty, next_available_quantity, 
              next_available_date::text as next_available_date,
              attributes, approved_states, features, specifications, documents, restricted_use,
              supplier_id, supplier_price,
              icc_margin_percent, icc_margin_amount,
              customer_margin_percent, customer_margin_amount,
              margin_approval_status, margin_approved_at, margin_approved_by, margin_notes,
              created_at, updated_at
       FROM products WHERE id = $1 AND deleted_at IS NULL`, 
      [id]
    );

    if (!existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Soft delete: Set deleted_at timestamp and deleted_by admin user ID
    await queryOne(
      `UPDATE products 
       SET deleted_at = NOW(), 
           deleted_by = $1,
           updated_at = NOW()
       WHERE id = $2 
       RETURNING id`, 
      [auth.session.adminUser.id, id]
    );

    // Log the action
    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'delete',
      resourceType: 'product',
      resourceId: id,
      before: existingProduct as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting product:', error);
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}

// PATCH /api/admin/products/[id] - Quick updates (inventory or SKU)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json();
    const { inventory_count, sku } = body;

    const isSkuUpdate = typeof sku === 'string';
    const isInventoryUpdate = inventory_count !== undefined;

    if (!isSkuUpdate && !isInventoryUpdate) {
      return NextResponse.json({ error: 'No update fields provided' }, { status: 400 });
    }

    if (isSkuUpdate && !auth.session.permissions.includes('products.update')) {
      return NextResponse.json({ error: 'Insufficient permissions for SKU update' }, { status: 403 });
    }

    if (isInventoryUpdate && !auth.session.permissions.includes('products.manage_inventory')) {
      return NextResponse.json({ error: 'Insufficient permissions for inventory update' }, { status: 403 });
    }

    const existingProduct = await queryOne<Product>('SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL', [id]);

    if (!existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Handle SKU update
    if (isSkuUpdate) {
      const trimmedSku = sku.trim();
      if (!trimmedSku || trimmedSku.length > 100) {
        return NextResponse.json({ error: 'SKU must be between 1 and 100 characters' }, { status: 400 });
      }

      const duplicate = await queryOne<{ id: string }>(
        `SELECT id FROM products WHERE sku = $1 AND id != $2 AND deleted_at IS NULL`,
        [trimmedSku, id]
      );
      if (duplicate) {
        return NextResponse.json({ error: `SKU "${trimmedSku}" is already in use` }, { status: 409 });
      }

      const updated = await queryOne<Product>(
        `UPDATE products SET sku = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id, trimmedSku]
      );

      await logAction({
        adminUserId: auth.session.adminUser.id,
        action: 'update',
        resourceType: 'product',
        resourceId: id,
        before: { sku: existingProduct.sku },
        after: { sku: updated!.sku },
      });

      if (!isInventoryUpdate) {
        return NextResponse.json(updated);
      }

      // If both SKU and inventory are being updated, fall through to inventory logic below
    }

    // Handle inventory update
    const warehouseCount = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM product_warehouses WHERE product_id = $1`,
      [id]
    );
    const hasWarehouseEntries = warehouseCount && parseInt(warehouseCount.count || '0', 10) > 0;

    let finalInventoryCount: number;
    let inventoryToCheck: number;

    if (hasWarehouseEntries) {
      const warehouseTotal = await queryOne<{ total: string }>(
        `SELECT COALESCE(SUM(inventory_count), 0) as total
         FROM product_warehouses
         WHERE product_id = $1`,
        [id]
      );
      finalInventoryCount = warehouseTotal ? parseInt(warehouseTotal.total || '0', 10) : 0;
      inventoryToCheck = finalInventoryCount;
    } else {
      finalInventoryCount = inventory_count !== undefined ? inventory_count : existingProduct.inventory_count;
      inventoryToCheck = finalInventoryCount || 0;
    }

    let finalInStock = inventoryToCheck > 0;
    if (existingProduct.supplier_id) {
      const supplierProduct = await queryOne<{ icc_available_quantity: number | null }>(
        'SELECT icc_available_quantity FROM products WHERE id = $1',
        [id]
      );
      const iccQty = supplierProduct?.icc_available_quantity || 0;
      finalInStock = inventoryToCheck > 0 || iccQty > 0;
    }

    const product = await queryOne<Product>(
      `UPDATE products
       SET inventory_count = $2,
           in_stock = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, finalInventoryCount, finalInStock]
    );

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'update',
      resourceType: 'product',
      resourceId: id,
      before: { inventory_count: existingProduct.inventory_count, in_stock: existingProduct.in_stock },
      after: { inventory_count: product!.inventory_count, in_stock: product!.in_stock },
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}
