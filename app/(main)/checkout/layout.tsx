import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Checkout | Innovative Crop Care, LLC',
  description: 'Complete your order securely and efficiently.',
};

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

