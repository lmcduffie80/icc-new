'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ConsentStatus = 'pending' | 'accepted' | 'declined';

export interface CookieConsentState {
  status: ConsentStatus;
  timestamp: number | null;
  acceptAll: () => void;
  declineNonEssential: () => void;
  resetConsent: () => void;
}

// List of non-essential cookie name patterns to clear when declining
const NON_ESSENTIAL_COOKIE_PATTERNS = [
  '_ga',      // Google Analytics
  '_gid',     // Google Analytics
  '_gat',     // Google Analytics
  '__utma',   // Google Analytics (legacy)
  '__utmb',   // Google Analytics (legacy)
  '__utmc',   // Google Analytics (legacy)
  '__utmz',   // Google Analytics (legacy)
  '_fbp',     // Facebook Pixel
  '_fbc',     // Facebook Click ID
];

/**
 * Clear all non-essential cookies from the browser
 */
function clearNonEssentialCookies(): void {
  if (typeof document === 'undefined') return;

  const cookies = document.cookie.split(';');

  for (const cookie of cookies) {
    const cookieName = cookie.split('=')[0].trim();

    // Check if this cookie matches any non-essential pattern
    const isNonEssential = NON_ESSENTIAL_COOKIE_PATTERNS.some(pattern =>
      cookieName.startsWith(pattern)
    );

    if (isNonEssential) {
      // Delete cookie by setting expiry in the past
      // Try multiple paths and domains to ensure deletion
      const paths = ['/', ''];
      const domains = [window.location.hostname, '.' + window.location.hostname, ''];

      for (const path of paths) {
        for (const domain of domains) {
          document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}${domain ? `; domain=${domain}` : ''}`;
        }
      }
    }
  }
}

/**
 * Disable Google Analytics tracking if it exists
 */
function disableGoogleAnalytics(): void {
  if (typeof window === 'undefined') return;

  // Set GA opt-out flag
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any)['ga-disable-GA_MEASUREMENT_ID'] = true;

  // Remove GA from window if it exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).gtag) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).gtag('consent', 'update', {
      analytics_storage: 'denied',
    });
  }
}

export const useCookieConsent = create<CookieConsentState>()(
  persist(
    (set) => ({
      status: 'pending',
      timestamp: null,

      acceptAll: () => {
        set({
          status: 'accepted',
          timestamp: Date.now()
        });
      },

      declineNonEssential: () => {
        // Clear existing non-essential cookies
        clearNonEssentialCookies();

        // Disable Google Analytics if present
        disableGoogleAnalytics();

        set({
          status: 'declined',
          timestamp: Date.now()
        });
      },

      resetConsent: () => {
        set({
          status: 'pending',
          timestamp: null
        });
      },
    }),
    {
      name: 'cookie-consent',
      // Only persist specific fields
      partialize: (state) => ({
        status: state.status,
        timestamp: state.timestamp,
      }),
    }
  )
);

/**
 * Check if analytics can be loaded based on consent status
 */
export function canLoadAnalytics(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const stored = localStorage.getItem('cookie-consent');
    if (!stored) return false;

    const parsed = JSON.parse(stored);
    return parsed.state?.status === 'accepted';
  } catch {
    return false;
  }
}
