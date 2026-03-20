import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { InventoryTable } from './inventory-table';

export const dynamic = 'force-dynamic';

interface InventoryItem {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  supplier_id: string | null;
  supplier_id_number: string;
  supplier_name: string;
  supplier_company: string;
  supplier_number: string | null;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_address: string;
  inventory_count: number;
  warehouse_location: string | null;
  updated_at: string;
}

async function getInventory(): Promise<InventoryItem[]> {
  return query<InventoryItem>(
    `SELECT 
      pw.id,
      pw.product_id,
      p.name as product_name,
      p.sku as product_sku,
      pw.warehouse_id,
      w.name as warehouse_name,
      CONCAT(w.address_street, ', ', w.address_city, ', ', w.address_state, ' ', w.address_zip) as warehouse_address,
      pw.inventory_count,
      pw.warehouse_location,
      pw.updated_at,
      su.id as supplier_id,
      CASE 
        WHEN su.id IS NOT NULL THEN LPAD((ABS(HASHTEXT(su.id) % 900000) + 100000)::TEXT, 6, '0')
        ELSE '000000'
      END as supplier_id_number,
      COALESCE(su.name, 'Innovative Crop Care') as supplier_name,
      COALESCE(su.company_name, 'Innovative Crop Care, LLC') as supplier_company,
      su.supplier_number
    FROM product_warehouses pw
    INNER JOIN products p ON p.id = pw.product_id
    INNER JOIN warehouses w ON w.id = pw.warehouse_id
    LEFT JOIN supplier_users su ON su.id = p.supplier_id
    WHERE p.deleted_at IS NULL
    ORDER BY 
      COALESCE(su.company_name, 'Innovative Crop Care, LLC'),
      p.name,
      w.name`
  );
}

export default async function InventoryPage() {
  const session = await getAdminSession();

  if (!session?.permissions.includes('products.view')) {
    redirect('/admin');
  }

  const inventory = await getInventory();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
        <p className="mt-1 text-slate-500">
          View inventory by supplier, product, and warehouse location
        </p>
      </div>

      <InventoryTable inventory={inventory} />
    </div>
  );
}

