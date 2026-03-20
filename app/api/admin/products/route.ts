import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { logAction } from '@/lib/audit';

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
}

// GET /api/admin/products - List all products
export async function GET(request: NextRequest) {
  const auth = await requireAdmin('products.view');
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const inStock = searchParams.get('in_stock');
  const search = searchParams.get('search');

  const approvalStatus = searchParams.get('approval_status');
  const supplierOnly = searchParams.get('supplier_only') === 'true';

  let sql = `SELECT p.*, 
    p.supplier_id, 
    p.approval_status, 
    p.deletion_requested_at,
    su.name as supplier_name, 
    su.company_name as supplier_company
    FROM products p
    LEFT JOIN supplier_users su ON su.id = p.supplier_id
    WHERE 1=1
      AND p.deleted_at IS NULL
      AND (p.approval_status IS NULL OR p.approval_status != 'rejected')`;
  const params: unknown[] = [];
  let paramIndex = 1;

  if (category) {
    sql += ` AND p.category = $${paramIndex++}`;
    params.push(category);
  }

  if (inStock !== null) {
    sql += ` AND p.in_stock = $${paramIndex++}`;
    params.push(inStock === 'true');
  }

  if (approvalStatus) {
    sql += ` AND p.approval_status = $${paramIndex++}`;
    params.push(approvalStatus);
  }

  if (supplierOnly) {
    sql += ` AND p.supplier_id IS NOT NULL`;
  }

  if (search) {
    sql += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex} OR p.sku ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  sql += ' ORDER BY p.created_at DESC';

  const products = await query<Product & { supplier_id?: string | null; approval_status?: string; supplier_name?: string | null; supplier_company?: string | null }>(sql, params);
  return NextResponse.json(products);
}

// POST /api/admin/products - Create a new product
export async function POST(request: NextRequest) {
  const auth = await requireAdmin('products.create');
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const {
      name,
      category,
      supplier_id,
      description,
      full_description,
      sku,
      price,
      original_price,
      msrp,
      unit_of_measure,
      image,
      in_stock,
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
      compared_to,
    } = body;

    if (!name || !category || price === undefined || !supplier_id) {
      return NextResponse.json(
        { error: 'Name, category, price, and supplier are required' },
        { status: 400 }
      );
    }

    // Check for duplicate SKU
    if (sku) {
      const existingSku = await query<{ id: string }>(
        `SELECT id FROM products WHERE sku = $1 AND deleted_at IS NULL LIMIT 1`,
        [sku]
      );
      if (existingSku.length > 0) {
        return NextResponse.json(
          { error: `Item number "${sku}" is already in use. Please choose a different SKU.` },
          { status: 409 }
        );
      }
    }

    const product = await queryOne<Product>(
      `INSERT INTO products (
        name, category, description, full_description, sku, price, original_price, msrp,
        unit_of_measure, image, in_stock, inventory_count, rating, review_count, minimum_order_qty,
        next_available_quantity, next_available_date,
        attributes, approved_states, features, specifications, documents, sds_url, restricted_use,
        supplier_id, approval_status, compared_to
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
       RETURNING *`,
      [
        name,
        category,
        description || null,
        full_description || null,
        sku || null,
        price,
        original_price || null,
        msrp || null,
        unit_of_measure || null,
        image || null,
        in_stock ?? true,
        inventory_count ?? 0,
        rating || null,
        review_count ?? 0,
        minimum_order_qty || null,
        next_available_quantity || null,
        next_available_date || null,
        attributes ? JSON.stringify(attributes) : null,
        approved_states || [],
        features || [],
        specifications ? JSON.stringify(specifications) : null,
        documents ? JSON.stringify(documents) : null,
        sds_url || null,
        restricted_use ?? false,
        supplier_id || null,
        supplier_id ? 'pending' : null,
        compared_to === '' ? null : (compared_to || null),
      ]
    );

    // Log the action
    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'create',
      resourceType: 'product',
      resourceId: product!.id,
      after: product as unknown as Record<string, unknown>,
    });

    // If supplier assigned, set up for supplier workflow
    if (supplier_id && product) {
      await query(
        `UPDATE products
         SET 
           supplier_review_status = 'pending_supplier_review',
           assigned_to_supplier_at = NOW()
         WHERE id = $1`,
        [product.id]
      );

      // Log assignment in history
      await query(
        `INSERT INTO product_approval_history (
          product_id,
          action,
          performed_by,
          notes
        ) VALUES ($1, 'assigned_to_supplier', $2, $3)`,
        [
          product.id,
          auth.session.adminUser.id,
          'Product assigned to supplier for pricing and inventory setup'
        ]
      );

      // Get supplier details and send notification email
      const suppliers = await query<{ id: string; company_name: string; email: string }>(
        'SELECT id, company_name, email FROM supplier_users WHERE id = $1',
        [supplier_id]
      );

      if (suppliers && suppliers.length > 0) {
        const supplier = suppliers[0];
        try {
          const { sendSupplierProductAssignmentEmail } = await import('@/lib/email');
          await sendSupplierProductAssignmentEmail(
            supplier.email,
            supplier.company_name,
            name,
            product.id
          );
        } catch (emailError) {
          console.error('Failed to send supplier assignment email:', emailError);
          // Don't fail the entire request if email fails
        }
      }
    }

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error('Error creating product:', error);
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
