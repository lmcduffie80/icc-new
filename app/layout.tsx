import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { AuthProvider } from '@/components/auth-provider';
import { AnalyticsProvider } from '@/components/analytics-provider';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: {
    default: 'Innovative Crop Care, LLC',
    template: '%s | Innovative Crop Care',
  },
  description:
    'Professional-grade agricultural products for modern farming. Herbicides, fungicides, insecticides, and plant growth regulators.',
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Innovative Crop Care',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}
      >
        <AuthProvider>{children}</AuthProvider>
        <AnalyticsProvider />
      </body>
    </html>
  );
}
