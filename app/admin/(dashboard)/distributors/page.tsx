import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin-auth';
import { DistributorsTable } from './distributors-table';
import { Users, Tag } from 'lucide-react';
import Link from 'next/link';

export const metadata = { title: 'Distributors — Admin' };

export default async function DistributorsPage() {
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');

  const canView = session.permissions.includes('distributors.view') ||
    session.permissions.includes('distributors.manage');
  if (!canView) redirect('/admin');

  const canManagePricing = session.permissions.includes('distributors.manage');

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Distributors</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage which customers have access to the distributor portal and discounted pricing.
          </p>
        </div>
        {canManagePricing && (
          <Link
            href="/admin/distributors/pricing"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors hover:cursor-pointer"
          >
            <Tag className="h-4 w-4" />
            Manage Pricing
          </Link>
        )}
      </div>

      {/* Info banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <div className="flex items-start gap-2">
          <Users className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            Distributors can access the private{' '}
            <strong>/distributor</strong> portal on the website where they see
            discounted prices set in{' '}
            <Link href="/admin/distributors/pricing" className="underline font-medium">
              Distributor Pricing
            </Link>
            . They log in using their regular customer account.
          </div>
        </div>
      </div>

      <DistributorsTable />
    </div>
  );
}
