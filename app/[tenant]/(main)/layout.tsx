import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { CompareBadge } from '@/components/compare-badge';
import { CookieBanner } from '@/components/cookie-banner';
import { headers } from 'next/headers';
import { PastDueBanner } from '@/components/past-due-banner';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

// Routes that should be exempt from the MFA enrollment gate
const MFA_GATE_EXEMPT_SUFFIXES = [
  '/auth/two-factor',
  '/auth/sign-in',
  '/auth/sign-up',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
];

export default async function MainLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const allHeaders = await headers();
  const isPastDue = allHeaders.get('x-past-due') === '1';
  const mfaRequired = allHeaders.get('x-mfa-required') === '1';

  // MFA enrollment gate: if tenant requires MFA and the authenticated user
  // hasn't enabled it yet, redirect them to the setup page.
  if (mfaRequired) {
    const pathname = allHeaders.get('x-invoke-path') ?? '';
    const isExempt = MFA_GATE_EXEMPT_SUFFIXES.some((s) => pathname.endsWith(s));

    if (!isExempt) {
      const session = await auth.api.getSession({ headers: allHeaders });
      if (session?.user && !session.user.twoFactorEnabled) {
        redirect(`/${slug}/auth/two-factor/setup`);
      }
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      {isPastDue && <PastDueBanner tenantSlug={slug} />}
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <CompareBadge />
      <CookieBanner />
    </div>
  );
}

