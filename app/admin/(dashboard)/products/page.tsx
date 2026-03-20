import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ProductsTable } from './products-table';

export const dynamic = 'force-dynamic';

interface Product {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  description: string | null;
  price: string;
  original_price: string | null;
  image: string | null;
  in_stock: boolean;
  inventory_count: number;
  icc_available_quantity: number;
  created_at: string;
  updated_at: string;
  supplier_id?: string | null;
  approval_status?: string;
  supplier_name?: string | null;
  supplier_company?: string | null;
  warehouses?: Array<{
    warehouse_id: string;
    warehouse_name: string;
    inventory_count: number;
  }>;
  total_warehouse_inventory?: number;
}

async function getProducts(): Promise<Product[]> {
  try {
    const products = await query<Product>(
      `SELECT p.*, 
       p.supplier_id, 
       p.approval_status,
       p.icc_available_quantity,
       su.name as supplier_name,
       su.company_name as supplier_company
       FROM products p
       LEFT JOIN supplier_users su ON su.id = p.supplier_id
       WHERE p.deleted_at IS NULL 
         AND (p.approval_status IS NULL OR p.approval_status != 'rejected')
       ORDER BY p.created_at DESC`
    );

    // Fetch ALL warehouse data in a single query (optimized - no N+1 problem)
    let allWarehouses: {
      product_id: string;
      warehouse_id: string;
      warehouse_name: string;
      inventory_count: number;
    }[] = [];

    try {
      if (products.length > 0) {
        allWarehouses = await query<{
          product_id: string;
          warehouse_id: string;
          warehouse_name: string;
          inventory_count: number;
        }>(
          `SELECT 
            pw.product_id,
            pw.warehouse_id,
            w.name as warehouse_name,
            pw.inventory_count
          FROM product_warehouses pw
          JOIN warehouses w ON w.id = pw.warehouse_id
          WHERE pw.product_id = ANY($1)
          ORDER BY pw.product_id, pw.inventory_count DESC`,
          [products.map(p => p.id)]
        );
      }
    } catch (error) {
      console.error('Error fetching warehouse data for admin products:', error);
    }

    // Group warehouses by product_id
    const warehousesByProduct = allWarehouses.reduce((acc, wh) => {
      if (!acc[wh.product_id]) {
        acc[wh.product_id] = [];
      }
      acc[wh.product_id].push(wh);
      return acc;
    }, {} as Record<string, typeof allWarehouses>);

    // Map products with their warehouse data
    const productsWithWarehouses = products.map((product) => {
      const warehouses = warehousesByProduct[product.id] || [];
      
      // Calculate total inventory from all warehouses
      const totalWarehouseInventory = warehouses.reduce((sum, wh) => sum + (wh.inventory_count || 0), 0);
      
      // If product has warehouses, always use the sum of warehouse inventory
      // Otherwise, keep the existing inventory_count from the products table
      const calculatedInventoryCount = warehouses.length > 0
        ? totalWarehouseInventory
        : product.inventory_count;

      return {
        ...product,
        warehouses: warehouses || [],
        inventory_count: calculatedInventoryCount,
        total_warehouse_inventory: totalWarehouseInventory,
      };
    });

    return productsWithWarehouses;
  } catch (error) {
    console.error('Error fetching admin products:', error);
    return [];
  }
}

export default async function ProductsPage() {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('products.view')) {
    redirect('/admin');
  }

  const products = await getProducts();
  const canCreate = session.permissions.includes('products.create');

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Products</h1>
          <p className="mt-1 text-slate-500">Manage your product catalog</p>
        </div>
        {canCreate && (
          <Link
            href="/admin/products/new"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Add Product
          </Link>
        )}
      </div>

      <ProductsTable products={products} permissions={session.permissions} />
    </div>
  );
}

