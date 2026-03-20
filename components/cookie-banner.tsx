'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Cookie, X } from 'lucide-react';
import { useCookieConsent } from '@/lib/cookie-consent';

export function CookieBanner() {
  const [delayPassed, setDelayPassed] = useState(false);
  const { status, acceptAll, declineNonEssential } = useCookieConsent();

  useEffect(() => {
    // Small delay to prevent flash on page load
    const timer = setTimeout(() => setDelayPassed(true), 500);
    return () => clearTimeout(timer);
  }, []);

  const handleAccept = () => {
    acceptAll();
  };

  const handleDecline = () => {
    declineNonEssential();
  };

  // Only show if status is pending and delay has passed
  if (status !== 'pending' || !delayPassed) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="relative rounded-xl border border-border bg-card p-4 shadow-lg md:p-6">
          <button
            onClick={handleDecline}
            className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Decline non-essential cookies"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
            <div className="flex items-start gap-3 md:flex-1">
              <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Cookie className="h-5 w-5 text-primary" />
              </div>
              <div className="pr-6 md:pr-0">
                <h3 className="font-semibold text-sm mb-1">We use cookies</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  We use cookies to improve your experience, analyze site traffic, and for marketing purposes.
                  By clicking &ldquo;Accept&rdquo;, you consent to our use of cookies.{' '}
                  <Link href="/cookies" className="text-primary hover:underline">
                    Learn more
                  </Link>
                </p>
              </div>
            </div>

            <div className="flex gap-3 shrink-0">
              <Button variant="outline" size="sm" onClick={handleDecline}>
                Decline
              </Button>
              <Button size="sm" onClick={handleAccept}>
                Accept
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
