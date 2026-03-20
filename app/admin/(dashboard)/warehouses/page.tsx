import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { WarehousesTable } from './warehouses-table';
import { CreateWarehouseButton } from './create-warehouse-button';

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
  created_at: string;
  updated_at: string;
}

async function getWarehouses(): Promise<Warehouse[]> {
  try {
    return await query<Warehouse>('SELECT * FROM warehouses ORDER BY name');
  } catch (error) {
    console.error('Error fetching admin warehouses:', error);
    return [];
  }
}

export default async function WarehousesPage() {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('products.view')) {
    redirect('/admin');
  }

  const warehouses = await getWarehouses();
  const canCreate = session.permissions.includes('products.create');

  const activeCount = warehouses.filter(w => w.is_active).length;
  const inactiveCount = warehouses.filter(w => !w.is_active).length;

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Warehouses</h1>
          <p className="mt-1 text-slate-500">Manage warehouse locations and addresses</p>
        </div>
        {canCreate && <CreateWarehouseButton />}
      </div>

      {/* Stats Overview */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Total Warehouses</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {warehouses.length}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Active</h3>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              {activeCount}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Inactive</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {inactiveCount}
            </span>
          </div>
        </div>
      </div>

      <WarehousesTable
        warehouses={warehouses}
        permissions={session.permissions}
      />
    </div>
  );
}

