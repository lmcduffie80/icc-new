'use client';

import { useSyncExternalStore } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { useCookieConsent } from '@/lib/cookie-consent';

// Subscribe function for useSyncExternalStore (no-op since we just need hydration check)
const subscribe = () => () => {};

/**
 * Analytics provider that only loads analytics scripts when user has consented.
 * This component respects user cookie preferences set via the cookie banner.
 */
export function AnalyticsProvider() {
  const { status } = useCookieConsent();

  // Use useSyncExternalStore to safely check if we're on the client
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,  // Client value
    () => false  // Server value
  );

  // Don't render anything on server
  if (!isClient) {
    return null;
  }

  // Only load analytics if user has explicitly accepted cookies
  if (status !== 'accepted') {
    return null;
  }

  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
