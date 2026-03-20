import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { query } from '@/lib/db';
import { VendorsTable } from './vendors-table';

interface Vendor {
  id: number;
  vendor_number: string;
  name: string;
  address_id: number | null;
  tax_exempt: boolean;
  default_payment_terms: string | null;
  folder_path: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

async function getVendors(): Promise<Vendor[]> {
  return query<Vendor>(
    `SELECT id, vendor_number, name, address_id, tax_exempt, default_payment_terms, 
            folder_path, is_active, notes, created_at, updated_at
     FROM vendors
     ORDER BY name`
  );
}

export default async function VendorsPage() {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('admins.view')) {
    redirect('/admin');
  }

  const vendors = await getVendors();
  const canCreate = session.permissions.includes('admins.create');

  const activeCount = vendors.filter(v => v.is_active).length;

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vendors</h1>
          <p className="mt-1 text-slate-500">Manage vendors for purchase orders</p>
        </div>
        {canCreate && (
          <Link
            href="/admin/vendors/new"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Add Vendor
          </Link>
        )}
      </div>

      {/* Stats Overview */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Total Vendors</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {vendors.length}
            </span>
          </div>
          <div className="mt-2 text-sm text-slate-500">
            {activeCount} active
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Active</h3>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              {activeCount}
            </span>
          </div>
          <div className="mt-2 text-sm text-slate-500">
            Currently active vendors
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Inactive</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {vendors.length - activeCount}
            </span>
          </div>
          <div className="mt-2 text-sm text-slate-500">
            Deactivated vendors
          </div>
        </div>
      </div>

      <VendorsTable vendors={vendors} />
    </div>
  );
}

