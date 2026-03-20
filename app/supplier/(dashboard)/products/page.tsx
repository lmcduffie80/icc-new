import { getSupplierSession } from '@/lib/supplier-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { query } from '@/lib/db';
import { SupplierProductsTable } from './supplier-products-table';

export const dynamic = 'force-dynamic';

interface Product {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price: string;
  supplier_price: string | null;
  original_price: string | null;
  image: string | null;
  in_stock: boolean;
  inventory_count: number;
  created_at: string;
  approval_status: string;
  sku: string | null;
  icc_available_quantity: number;
  margin_split_percentage: string | null;
  margin_approval_status: string | null;
  margin_approval_notes: string | null;
  icc_margin_percent: string | null;
  customer_margin_percent: string | null;
  margin_proposal_source?: string | null;
  supplier_margin_approval_status?: string | null;
  admin_proposed_margin_percent?: string | null;
  admin_proposed_margin_at?: string | null;
  attributes?: { containerSizes?: string } | null;
  label_url: string | null;
  warehouses?: Array<{
    warehouse_id: string;
    warehouse_name: string;
    inventory_count: number;
  }>;
}

async function getApprovedProducts(supplierId: string): Promise<Product[]> {
  try {
    const products = await query<Product>(
      `SELECT id, name, category, description, price, supplier_price, original_price, image,
              in_stock, inventory_count, created_at, approval_status, sku, icc_available_quantity,
              margin_split_percentage, margin_approval_status, margin_approval_notes, 
              icc_margin_percent, customer_margin_percent, margin_proposal_source,
              supplier_margin_approval_status, admin_proposed_margin_percent,
              admin_proposed_margin_at, attributes, label_url, updated_at
       FROM products
       WHERE supplier_id = $1
         AND deleted_at IS NULL
         AND approval_status IN ('published', 'admin_approved', 'supplier_approved', 'pending')
       ORDER BY 
         CASE WHEN margin_proposal_source = 'admin' AND supplier_margin_approval_status = 'pending' THEN 0 ELSE 1 END,
         updated_at DESC, created_at DESC`,
      [supplierId]
    );

    // Fetch warehouse information for each product
    const productsWithWarehouses = await Promise.all(
      products.map(async (product) => {
        try {
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
            [product.id]
          );

          return {
            ...product,
            warehouses: warehouses && warehouses.length > 0 ? warehouses : [],
          };
        } catch (error) {
          console.error(`Error fetching warehouses for product ${product.id}:`, error);
          return {
            ...product,
            warehouses: [],
          };
        }
      })
    );

    return productsWithWarehouses;
  } catch (error) {
    console.error('Error fetching supplier products:', error);
    return [];
  }
}

export default async function SupplierProductsPage() {
  const session = await getSupplierSession();

  if (!session) {
    redirect('/supplier/login');
  }

  const products = await getApprovedProducts(session.user.id);

  // Fetch recent margin updates (last 30 days) - wrapped in try-catch
  // since product_margin_history table may not exist in all environments
  let marginUpdateCount = 0;
  try {
    const recentMarginUpdates = await query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM product_margin_history pmh
       JOIN products p ON p.id = pmh.product_id
       WHERE p.supplier_id = $1
       AND p.deleted_at IS NULL
       AND pmh.action = 'modified'
       AND pmh.created_at > NOW() - INTERVAL '30 days'`,
      [session.user.id]
    );
    marginUpdateCount = recentMarginUpdates[0] ? parseInt(recentMarginUpdates[0].count) : 0;
  } catch (error) {
    console.error('Error fetching margin update count:', error);
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Products</h1>
          <p className="mt-1 text-slate-500">Manage your product catalog</p>
        </div>
        <Link
          href="/supplier/products/new"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          Add Product
        </Link>
      </div>

      {marginUpdateCount > 0 && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            📊 {marginUpdateCount} product{marginUpdateCount > 1 ? 's' : ''} {marginUpdateCount > 1 ? 'have' : 'has'} had margin updates in the last 30 days.
            Check your products for the latest pricing.
          </p>
        </div>
      )}

      <SupplierProductsTable products={products} />
    </div>
  );
}

