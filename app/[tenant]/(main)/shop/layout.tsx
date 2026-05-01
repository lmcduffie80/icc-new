import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shop | Innovative Crop Care, LLC',
  description: 'Premium agricultural products vetted by experts and backed by manufacturer warranties.',
};

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

