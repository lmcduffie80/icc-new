import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { CompareBadge } from '@/components/compare-badge';
import { CookieBanner } from '@/components/cookie-banner';
import { headers } from 'next/headers';
import { PastDueBanner } from '@/components/past-due-banner';

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

