import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, Building2, Globe, CreditCard, Zap } from 'lucide-react';
import { query } from '@/lib/db';

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  country: string;
  currency: string;
  subscription_status: string;
  billing_type: string;
  plan_display_name: string | null;
  plan_name: string | null;
  is_active: boolean;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  trialing: 'bg-blue-100 text-blue-700',
  past_due: 'bg-amber-100 text-amber-700',
  canceled: 'bg-red-100 text-red-700',
  unpaid: 'bg-red-100 text-red-700',
};

export default async function TenantsPage() {
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');

  const tenants = await query<TenantRow>(
    `SELECT t.id, t.slug, t.name, t.country, t.currency,
            t.subscription_status, t.billing_type, t.is_active, t.created_at,
            p.display_name AS plan_display_name, p.name AS plan_name
     FROM tenants t
     LEFT JOIN plans p ON p.id = t.plan_id
     ORDER BY t.created_at DESC`
  );

  const canCreate = session.permissions.includes('admins.create');

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tenants</h1>
          <p className="mt-1 text-slate-500">
            Manage all Agrovus platform tenants and their subscriptions
          </p>
        </div>
        {canCreate && (
          <Link
            href="/admin/tenants/new"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            New Tenant
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Total Tenants</h3>
            <Building2 className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{tenants.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Active</h3>
            <Zap className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600">
            {tenants.filter((t) => t.subscription_status === 'active').length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Past Due</h3>
            <CreditCard className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-600">
            {tenants.filter((t) => t.subscription_status === 'past_due').length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Countries</h3>
            <Globe className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-blue-600">
            {new Set(tenants.map((t) => t.country)).size}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left font-medium text-slate-500">Tenant</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Plan</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Country</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Billing</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{t.name}</div>
                    <div className="text-xs text-slate-400">/{t.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {t.plan_display_name ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[t.subscription_status] ?? 'bg-slate-100 text-slate-600'}`}
                    >
                      {t.subscription_status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {t.country} / {t.currency}
                  </td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{t.billing_type}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/tenants/${t.id}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/admin/tenants/${t.id}/billing`}
                        className="text-xs text-slate-500 hover:underline"
                      >
                        Billing
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No tenants yet.{' '}
                    <Link href="/admin/tenants/new" className="text-blue-500 hover:underline">
                      Create one.
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
