import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Compare Products | Innovative Crop Care, LLC',
  description: 'Compare agricultural products side by side to make the best choice for your farm.',
};

export default function CompareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

