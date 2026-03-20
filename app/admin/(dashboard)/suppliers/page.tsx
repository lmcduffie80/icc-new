import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { query } from '@/lib/db';
import { SuppliersTable } from './suppliers-table';

interface SupplierUser {
  id: string;
  email: string;
  name: string;
  company_name: string;
  phone: string | null;
  supplier_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

async function getSuppliers(): Promise<SupplierUser[]> {
  try {
    return await query<SupplierUser>(
      `SELECT id, email, name, company_name, phone, supplier_number, is_active, created_at, updated_at
       FROM supplier_users
       ORDER BY company_name, name`
    );
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    return [];
  }
}

export default async function SuppliersPage() {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('admins.view')) {
    redirect('/admin');
  }

  const suppliers = await getSuppliers();
  const canCreate = session.permissions.includes('admins.create');

  // Group by company
  const companies = suppliers.reduce((acc, supplier) => {
    if (!acc[supplier.company_name]) {
      acc[supplier.company_name] = [];
    }
    acc[supplier.company_name].push(supplier);
    return acc;
  }, {} as Record<string, SupplierUser[]>);

  const companyCount = Object.keys(companies).length;
  const activeCount = suppliers.filter(s => s.is_active).length;

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Supplier Users</h1>
          <p className="mt-1 text-slate-500">Manage supplier portal users and their company associations</p>
        </div>
        {canCreate && (
          <Link
            href="/admin/suppliers/new"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Add Supplier User
          </Link>
        )}
      </div>

      {/* Stats Overview */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Total Suppliers</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {suppliers.length}
            </span>
          </div>
          <div className="mt-2 text-sm text-slate-500">
            {activeCount} active
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Companies</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {companyCount}
            </span>
          </div>
          <div className="mt-2 text-sm text-slate-500">
            Unique companies
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Inactive</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {suppliers.length - activeCount}
            </span>
          </div>
          <div className="mt-2 text-sm text-slate-500">
            Deactivated accounts
          </div>
        </div>
      </div>

      <SuppliersTable suppliers={suppliers} />
    </div>
  );
}

