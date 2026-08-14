'use client';

import { useSyncExternalStore } from 'react';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { useCookieConsent } from '@/lib/cookie-consent';

const APOLLO_APP_ID = '69bc4cd5c94afd002126ede3';
const APOLLO_TRACKER_SRC =
  'https://assets.apollo.io/micro/website-tracker/tracker.iife.js';

// Subscribe function for useSyncExternalStore (no-op since we just need hydration check)
const subscribe = () => () => {};

function initApolloTracker() {
  window.trackingFunctions?.onLoad({ appId: APOLLO_APP_ID });
}

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
      <Script
        id="apollo-website-tracker"
        src={APOLLO_TRACKER_SRC}
        strategy="afterInteractive"
        onLoad={initApolloTracker}
      />
    </>
  );
}
