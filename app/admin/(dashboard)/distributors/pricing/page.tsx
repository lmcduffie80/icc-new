import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';
import { PricingTable } from './pricing-table';
import Link from 'next/link';
import { ArrowLeft, Info } from 'lucide-react';

export const metadata = { title: 'Distributor Pricing — Admin' };

export default async function DistributorPricingPage() {
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');

  if (!session.permissions.includes('distributors.manage')) redirect('/admin/distributors');

  // Get the ICC default tenant (or first tenant)
  const tenant = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM tenants ORDER BY created_at ASC LIMIT 1`
  );

  if (!tenant) {
    return (
      <div className="p-6 text-slate-500">No tenant configured.</div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/admin/distributors"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-2 hover:cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Distributors
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Distributor Pricing</h1>
          <p className="mt-1 text-sm text-slate-500">
            Set per-product prices for distributor accounts. Use a flat dollar price or a percent
            discount off retail. Prices are enforced server-side — distributors cannot be
            over-charged or under-charged.
          </p>
        </div>
      </div>

      {/* How-it-works callout */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <strong>Flat price overrides Discount %.</strong> If both are set the flat price is used.
            Products without a distributor price show at retail price in the portal.
          </div>
        </div>
      </div>

      <PricingTable tenantId={tenant.id} />
    </div>
  );
}
