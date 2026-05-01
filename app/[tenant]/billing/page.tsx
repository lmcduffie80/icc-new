import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getTenantBySlug } from '@/lib/tenant';
import { getPlans } from '@/lib/billing';
import { formatCurrency } from '@/lib/currency';
import { CheckCircle, AlertCircle, XCircle } from 'lucide-react';

const STATUS_INFO = {
  active: { icon: CheckCircle, color: 'text-emerald-600', label: 'Active' },
  trialing: { icon: CheckCircle, color: 'text-blue-600', label: 'Trial' },
  past_due: { icon: AlertCircle, color: 'text-amber-600', label: 'Past Due' },
  canceled: { icon: XCircle, color: 'text-red-600', label: 'Canceled' },
  unpaid: { icon: XCircle, color: 'text-red-600', label: 'Unpaid' },
} as const;

export default async function BillingPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const plans = await getPlans();
  const allHeaders = await headers();
  const isPastDue = allHeaders.get('x-past-due') === '1';

  const status = tenant.subscriptionStatus as keyof typeof STATUS_INFO;
  const { icon: StatusIcon, color, label } = STATUS_INFO[status] ?? {
    icon: AlertCircle,
    color: 'text-slate-500',
    label: tenant.subscriptionStatus,
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="mb-2 text-3xl font-bold text-slate-900">Billing &amp; Plans</h1>
      <p className="mb-8 text-slate-500">Manage your Agrovus subscription</p>

      {/* Subscription status banner */}
      {isPastDue && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-medium">Payment failed</p>
            <p className="text-sm">
              Update your billing information to avoid interruption.{' '}
              <a href={`/api/${slug}/billing/portal`} className="underline hover:no-underline">
                Open billing portal →
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Current plan */}
      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Current Plan</h2>
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-sm text-slate-400">Plan</p>
            <p className="text-xl font-bold text-slate-900">
              {tenant.plan?.displayName ?? 'No plan'}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-400">Status</p>
            <span className={`flex items-center gap-1 font-semibold ${color}`}>
              <StatusIcon className="h-4 w-4" />
              {label}
            </span>
          </div>
          {tenant.billingType === 'stripe' && (
            <div className="ml-auto">
              <a
                href={`/api/${slug}/billing/portal`}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Manage Billing →
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Plan cards */}
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Available Plans</h2>
      <div className="grid gap-6 sm:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = tenant.planId === plan.id;
          const monthlyPrice = plan.priceMonthlyUsd;

          return (
            <div
              key={plan.id}
              className={`rounded-xl border-2 bg-white p-6 ${isCurrent ? 'border-emerald-500' : 'border-slate-200'}`}
            >
              {isCurrent && (
                <span className="mb-3 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Current Plan
                </span>
              )}
              <h3 className="text-lg font-bold text-slate-900">{plan.displayName}</h3>
              <div className="mt-2">
                {monthlyPrice ? (
                  <p className="text-2xl font-bold text-slate-900">
                    {formatCurrency(monthlyPrice, 'USD')}
                    <span className="text-sm font-normal text-slate-400">/mo</span>
                  </p>
                ) : (
                  <p className="text-xl font-bold text-slate-900">Custom pricing</p>
                )}
              </div>

              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                {plan.features.supplier_portal === true && <li>✓ Supplier portal</li>}
                {plan.features.acre_pack === true && <li>✓ Acre Pack programs</li>}
                {plan.features.crop_planning === true && <li>✓ Crop planning</li>}
                {plan.features.white_label === true && <li>✓ White label</li>}
                <li>
                  {plan.features.max_products === -1
                    ? '✓ Unlimited products'
                    : `✓ Up to ${plan.features.max_products} products`}
                </li>
              </ul>

              {!isCurrent && tenant.billingType === 'stripe' && monthlyPrice && (
                <Link
                  href={`/${slug}/billing/checkout?planId=${plan.id}&cycle=monthly`}
                  className="mt-6 block w-full rounded-lg bg-emerald-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Upgrade to {plan.displayName}
                </Link>
              )}
              {!isCurrent && !monthlyPrice && (
                <a
                  href="mailto:sales@agrovus.com"
                  className="mt-6 block w-full rounded-lg border border-slate-200 px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Contact Sales
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
