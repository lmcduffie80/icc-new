import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { queryOne } from '@/lib/db';
import { EditSupplierForm } from './edit-supplier-form';

interface SupplierUser {
  id: string;
  email: string;
  name: string;
  company_name: string;
  phone: string | null;
  supplier_number: string | null;
  is_active: boolean;
  tax_exempt: boolean;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  created_at: string;
  updated_at: string;
}

async function getSupplier(id: string): Promise<SupplierUser | null> {
  try {
    const supplier = await queryOne<SupplierUser>(
      `SELECT id, email, name, company_name, phone, supplier_number, is_active, tax_exempt, address_street, address_city, address_state, address_zip, created_at, updated_at
       FROM supplier_users
       WHERE id = $1`,
      [id]
    );

    return supplier || null;
  } catch (error) {
    console.error('Failed to fetch supplier:', error);
    return null;
  }
}

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('admins.view')) {
    redirect('/admin');
  }

  const { id } = await params;
  const supplier = await getSupplier(id);

  if (!supplier) {
    redirect('/admin/suppliers');
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Edit Supplier</h1>
        <p className="mt-1 text-slate-500">
          Update supplier information and account settings
        </p>
      </div>

      <EditSupplierForm supplier={supplier} />
    </div>
  );
}

