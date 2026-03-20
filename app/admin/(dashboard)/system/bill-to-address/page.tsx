import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';
import { BillToAddressForm } from './bill-to-address-form';

export const metadata = {
  title: 'Bill-to Address - Admin Dashboard',
  description: 'Manage the default bill-to address used on purchase orders',
};

interface BillToAddress {
  id: number;
  company_name: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  zip_code: string;
  country: string;
}

async function getBillToAddress(): Promise<BillToAddress | null> {
  return queryOne<BillToAddress>(
    `SELECT id, company_name, address1, address2, city, state, zip_code, country
     FROM addresses
     WHERE type = 'BILL_TO' AND is_default = true
     LIMIT 1`
  );
}

export default async function BillToAddressPage() {
  const session = await getAdminSession();

  if (!session?.permissions.includes('settings.update_store_info')) {
    redirect('/admin');
  }

  const address = await getBillToAddress();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Bill-to Address</h1>
        <p className="mt-1 text-slate-500">
          This address appears as the Bill-to Address on all purchase orders sent to vendors.
        </p>
      </div>

      <BillToAddressForm address={address} />
    </div>
  );
}
