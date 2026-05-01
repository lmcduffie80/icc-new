'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Tenant, Plan } from '@/lib/tenant';

export default function TenantEditForm({
  tenant,
  plans,
  canEdit,
}: {
  tenant: Tenant;
  plans: Plan[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    const form = new FormData(e.currentTarget);
    const body = {
      name: form.get('name'),
      country: form.get('country'),
      currency: form.get('currency'),
      planId: form.get('planId') || null,
      billingType: form.get('billingType'),
      primaryColor: form.get('primaryColor'),
      logoUrl: form.get('logoUrl') || null,
      isActive: form.get('isActive') === 'true',
      mfaRequired: form.get('mfaRequired') === 'true',
    };

    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Update failed');
        return;
      }
      setSuccess('Tenant updated successfully');
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6">
      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Name *</label>
          <input
            name="name"
            required
            defaultValue={tenant.name}
            disabled={!canEdit}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Slug (read-only)</label>
          <input
            value={tenant.slug}
            readOnly
            className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Country</label>
          <select
            name="country"
            defaultValue={tenant.country}
            disabled={!canEdit}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="US">United States</option>
            <option value="CA">Canada</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Currency</label>
          <select
            name="currency"
            defaultValue={tenant.currency}
            disabled={!canEdit}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="USD">USD</option>
            <option value="CAD">CAD</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Plan</label>
          <select
            name="planId"
            defaultValue={tenant.planId ?? ''}
            disabled={!canEdit}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="">No plan assigned</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Billing Type</label>
          <select
            name="billingType"
            defaultValue={tenant.billingType}
            disabled={!canEdit}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="manual">Manual / Sales-led</option>
            <option value="stripe">Self-serve (Stripe)</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Brand Color</label>
          <input
            name="primaryColor"
            type="color"
            defaultValue={tenant.primaryColor}
            disabled={!canEdit}
            className="h-10 w-full cursor-pointer rounded-md border border-slate-300 disabled:opacity-60"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Logo URL</label>
          <input
            name="logoUrl"
            type="url"
            defaultValue={tenant.logoUrl ?? ''}
            disabled={!canEdit}
            placeholder="https://..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Active</label>
          <select
            name="isActive"
            defaultValue={String(tenant.isActive)}
            disabled={!canEdit}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Require MFA
            <span className="ml-2 text-xs font-normal text-slate-500">
              Forces all users to enroll in 2FA
            </span>
          </label>
          <select
            name="mfaRequired"
            defaultValue={String((tenant as { mfaRequired?: boolean }).mfaRequired ?? false)}
            disabled={!canEdit}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="false">Not required</option>
            <option value="true">Required</option>
          </select>
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}
    </form>
  );
}
