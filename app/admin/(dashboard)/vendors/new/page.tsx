import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { NewVendorForm } from './new-vendor-form';

export default async function NewVendorPage() {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('admins.create')) {
    redirect('/admin');
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/admin/vendors"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Vendors
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Add Vendor</h1>
          <p className="mt-1 text-slate-500">Create a new vendor for purchase orders</p>
        </div>
      </div>

      <NewVendorForm />
    </div>
  );
}

