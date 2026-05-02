import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { CustomersTable } from './customers-table';
import { CustomerExemptionTable } from './customer-exemption-table';

export interface CustomerWithExemption {
  user_id: string;
  name: string | null;
  email: string;
  invoice_exempt: boolean;
}

interface CustomerInvoice {
  id: string;
  upload_date: string;
  customer_name: string;
  email: string;
  invoice_state: string;
  filename: string;
  file_url: string;
  shipping_address: string | null;
  profile_phone: string | null;
}

async function getCustomerInvoices(): Promise<CustomerInvoice[]> {
  return query<CustomerInvoice>(`
    SELECT
      o.id,
      o.created_at AS upload_date,
      u.name AS customer_name,
      u.email,
      (o.shipping_address->>'state') AS invoice_state,
      '' AS filename,
      '' AS file_url,
      (o.shipping_address->>'line1') AS shipping_address,
      up.phone AS profile_phone
    FROM orders o
    JOIN "user" u ON u.id = o.user_id
    LEFT JOIN user_profiles up ON up.user_id = u.id
    ORDER BY o.created_at DESC
    LIMIT 500
  `);
}

async function getCustomersWithExemption(): Promise<CustomerWithExemption[]> {
  return query<CustomerWithExemption>(`
    SELECT
      u.id AS user_id,
      u.name,
      u.email,
      COALESCE(up.invoice_exempt, false) AS invoice_exempt
    FROM "user" u
    LEFT JOIN user_profiles up ON up.user_id = u.id
    ORDER BY u.name ASC, u.email ASC
  `);
}

export default async function CustomersPage() {
  const session = await getAdminSession();

  if (!session?.permissions.includes('users.view')) {
    redirect('/admin');
  }

  const [invoices, customersWithExemption] = await Promise.all([
    getCustomerInvoices(),
    getCustomersWithExemption(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
        <p className="mt-1 text-slate-500">Manage customer accounts and invoice exemptions</p>
      </div>

      {/* Invoice Exemptions */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Invoice Exemptions</h2>
          <p className="text-sm text-slate-500">
            Toggle whether a customer is required to provide an invoice before ordering
          </p>
        </div>
        <CustomerExemptionTable customers={customersWithExemption} />
      </div>

      {/* Customer Orders */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Recent Orders</h2>
          <p className="text-sm text-slate-500">Customer order history</p>
        </div>
        <CustomersTable invoices={invoices} />
      </div>
    </div>
  );
}
