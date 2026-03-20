import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { CompareBadge } from '@/components/compare-badge';
import { CookieBanner } from '@/components/cookie-banner';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <CompareBadge />
      <CookieBanner />
    </div>
  );
}

