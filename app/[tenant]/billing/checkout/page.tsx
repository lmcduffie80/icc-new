import { notFound, redirect } from 'next/navigation';
import { getTenantBySlug, getTenantById } from '@/lib/tenant';
import { getPlans, createSubscriptionCheckout } from '@/lib/billing';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

export default async function BillingCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ planId?: string; cycle?: string }>;
}) {
  const { tenant: slug } = await params;
  const { planId, cycle = 'monthly' } = await searchParams;

  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  if (!planId) redirect(`/${slug}/billing`);

  const allHeaders = await headers();
  const session = await auth.api.getSession({ headers: allHeaders });
  if (!session?.user?.email) redirect(`/${slug}/auth/sign-in`);

  const plans = await getPlans();
  const plan = plans.find((p) => p.id === planId);
  if (!plan) redirect(`/${slug}/billing`);

  const successUrl = new URL(`/${slug}/billing?checkout=success`, process.env.BETTER_AUTH_URL!).href;
  const cancelUrl = new URL(`/${slug}/billing`, process.env.BETTER_AUTH_URL!).href;

  try {
    const { url } = await createSubscriptionCheckout(
      tenant,
      plan,
      cycle as 'monthly' | 'annual',
      session.user.email,
      successUrl,
      cancelUrl
    );
    redirect(url);
  } catch (err) {
    console.error('[billing/checkout] failed:', err);
    redirect(`/${slug}/billing?error=checkout_failed`);
  }
}
