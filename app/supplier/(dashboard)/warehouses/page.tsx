import { getSupplierSession } from '@/lib/supplier-auth';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import Link from 'next/link';
import { Plus, Warehouse } from 'lucide-react';
import { WarehousesTable } from './warehouses-table';

async function getWarehouses(supplierId: string) {
  try {
    return await query<{
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
    }>(
      `SELECT 
        w.id, w.name, w.address_street, w.address_city, 
        w.address_state, w.address_zip, w.phone, w.email, w.is_active,
        sw.is_primary
      FROM warehouses w
      JOIN supplier_warehouses sw ON sw.warehouse_id = w.id
      WHERE sw.supplier_id = $1
      ORDER BY sw.is_primary DESC, w.name`,
      [supplierId]
    );
  } catch (error) {
    console.error('Error fetching supplier warehouses:', error);
    return [];
  }
}

export default async function SupplierWarehousesPage() {
  const session = await getSupplierSession();

  if (!session) {
    redirect('/supplier/login');
  }

  const warehouses = await getWarehouses(session.user.id);

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Warehouses</h1>
          <p className="mt-1 text-slate-500">Manage your warehouse locations</p>
        </div>
        <Link
          href="/supplier/warehouses/new"
          className="flex items-center space-x-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          <Plus className="h-4 w-4" />
          <span>Add Warehouse</span>
        </Link>
      </div>

      {warehouses.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <Warehouse className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-4 text-lg font-semibold text-slate-900">No warehouses yet</h3>
          <p className="mt-2 text-sm text-slate-500">
            Create a warehouse to track inventory locations.
          </p>
          <Link
            href="/supplier/warehouses/new"
            className="mt-6 inline-flex items-center space-x-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <Plus className="h-4 w-4" />
            <span>Add Warehouse</span>
          </Link>
        </div>
      ) : (
        <WarehousesTable warehouses={warehouses} />
      )}
    </div>
  );
}

