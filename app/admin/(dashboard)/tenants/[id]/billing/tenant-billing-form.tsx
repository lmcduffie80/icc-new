'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Tenant, Plan } from '@/lib/tenant';

const STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'canceled'] as const;

export default function TenantBillingForm({
  tenant,
  plans,
}: {
  tenant: Tenant;
  plans: Plan[];
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
      planId: form.get('planId') || null,
      subscriptionStatus: form.get('subscriptionStatus'),
      billingType: form.get('billingType'),
      stripeCustomerId: form.get('stripeCustomerId') || null,
      stripeSubscriptionId: form.get('stripeSubscriptionId') || null,
      trialEndsAt: form.get('trialEndsAt') || null,
    };

    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}/billing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Update failed');
        return;
      }
      setSuccess('Billing updated successfully');
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Plan</label>
          <select
            name="planId"
            defaultValue={tenant.planId ?? ''}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">No plan</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Subscription Status
          </label>
          <select
            name="subscriptionStatus"
            defaultValue={tenant.subscriptionStatus}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Billing Type</label>
        <select
          name="billingType"
          defaultValue={tenant.billingType}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="manual">Manual / Sales-led</option>
          <option value="stripe">Self-serve (Stripe)</option>
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Stripe Customer ID
          </label>
          <input
            name="stripeCustomerId"
            defaultValue={tenant.stripeCustomerId ?? ''}
            placeholder="cus_..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Stripe Subscription ID
          </label>
          <input
            name="stripeSubscriptionId"
            defaultValue={tenant.stripeSubscriptionId ?? ''}
            placeholder="sub_..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Trial Ends At (optional)
        </label>
        <input
          name="trialEndsAt"
          type="datetime-local"
          defaultValue={
            tenant.trialEndsAt ? new Date(tenant.trialEndsAt).toISOString().slice(0, 16) : ''
          }
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Save Billing'}
        </button>
      </div>
    </form>
  );
}
