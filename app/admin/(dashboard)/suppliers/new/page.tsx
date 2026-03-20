import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { NewSupplierForm } from './new-supplier-form';

export default async function NewSupplierPage() {
  const session = await getAdminSession();

  if (!session?.permissions.includes('admins.create')) {
    redirect('/admin/suppliers');
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Add New Supplier User</h1>
        <p className="mt-1 text-slate-500">Create a new supplier portal user and assign them to a company</p>
      </div>

      <NewSupplierForm />
    </div>
  );
}

