import { getSupplierSession } from '@/lib/supplier-auth';
import { redirect, notFound } from 'next/navigation';
import { queryOne } from '@/lib/db';
import { WarehouseDetailPage } from './warehouse-detail-page';

interface Warehouse {
  id: string;
  name: string;
  address_street: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  is_primary: boolean;
}

async function getWarehouse(warehouseId: string, supplierId: string): Promise<Warehouse | null> {
  return queryOne<Warehouse>(
    `SELECT 
      w.id, w.name, w.address_street, w.address_city, 
      w.address_state, w.address_zip, w.phone, w.email, w.is_active,
      sw.is_primary
    FROM warehouses w
    JOIN supplier_warehouses sw ON sw.warehouse_id = w.id
    WHERE w.id = $1 AND sw.supplier_id = $2`,
    [warehouseId, supplierId]
  );
}

export default async function WarehousePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSupplierSession();

  if (!session) {
    redirect('/supplier/login');
  }

  const { id } = await params;
  const warehouse = await getWarehouse(id, session.user.id);

  if (!warehouse) {
    notFound();
  }

  return <WarehouseDetailPage warehouse={warehouse} />;
}

