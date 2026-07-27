'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTenant } from '@/components/tenant-provider';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  CreditCard,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info,
  ShieldAlert,
} from 'lucide-react';

interface ConnectStatusResponse {
  paymentsMode: 'own_stripe' | 'icc_managed';
  hasConnectAccount: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  needsOnboarding: boolean;
}

const PAYMENTS_MODE_LABEL: Record<ConnectStatusResponse['paymentsMode'], string> = {
  icc_managed: 'Managed by Innovative CropCare',
  own_stripe: 'Your own Stripe account',
};

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2 py-0.5 ${
          ok ? 'text-green-700 bg-green-100' : 'text-muted-foreground bg-muted'
        }`}
      >
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
        {ok ? 'Yes' : 'No'}
      </span>
    </div>
  );
}

function PaymentsSetupContent() {
  const tenant = useTenant();
  const searchParams = useSearchParams();
  const onboardingParam = searchParams.get('onboarding');

  const [status, setStatus] = useState<ConnectStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  const [isStartingOnboarding, setIsStartingOnboarding] = useState(false);
  const [onboardError, setOnboardError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      setIsLoadingStatus(true);
      setStatusError(null);
      try {
        const response = await fetch(
          `/api/tenant-admin/connect/status?tenant_id=${tenant.id}`
        );
        const data = await response.json();
        if (cancelled) return;

        if (!response.ok) {
          setStatusError(data.error || 'Unable to load payment setup status.');
          setStatus(null);
          return;
        }

        setStatus(data as ConnectStatusResponse);
      } catch {
        if (!cancelled) {
          setStatusError('Unable to load payment setup status. Please try again.');
        }
      } finally {
        if (!cancelled) setIsLoadingStatus(false);
      }
    }

    fetchStatus();
    return () => {
      cancelled = true;
    };
  }, [tenant.id]);

  const handleStartOnboarding = async () => {
    setIsStartingOnboarding(true);
    setOnboardError(null);
    try {
      const response = await fetch(
        `/api/tenant-admin/connect/onboard?tenant_id=${tenant.id}`,
        { method: 'POST' }
      );
      const data = await response.json();

      if (!response.ok) {
        setOnboardError(data.error || 'Unable to start payment onboarding. Please try again.');
        setIsStartingOnboarding(false);
        return;
      }

      window.location.href = data.url;
    } catch {
      setOnboardError('Unable to start payment onboarding. Please try again.');
      setIsStartingOnboarding(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/account"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Account
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Payment Setup</h1>
          <p className="text-muted-foreground mt-1">
            Manage how your store gets paid
          </p>
        </div>

        {/* Transient redirect banners — status below is always the source of truth */}
        {onboardingParam === 'complete' && (
          <div className="mb-6 flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-primary">
              Onboarding submitted — verifying your status...
            </p>
          </div>
        )}
        {onboardingParam === 'refresh' && (
          <div className="mb-6 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Your onboarding session expired — please try again.
            </p>
          </div>
        )}

        {isLoadingStatus ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-muted-foreground">Loading payment setup status...</span>
            </div>
          </div>
        ) : statusError ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 mb-4">
              <ShieldAlert className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Unable to load payment setup</h2>
            <p className="text-muted-foreground max-w-md mx-auto">{statusError}</p>
          </div>
        ) : status?.needsOnboarding ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <CreditCard className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Set up payment processing</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Your store needs to finish setting up payment processing with Stripe before
              it can accept orders.
            </p>

            {onboardError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-left max-w-md mx-auto">
                <p className="text-sm text-red-600">{onboardError}</p>
              </div>
            )}

            <Button
              size="lg"
              className="gap-2"
              onClick={handleStartOnboarding}
              disabled={isStartingOnboarding}
            >
              {isStartingOnboarding && <Loader2 className="h-4 w-4 animate-spin" />}
              {isStartingOnboarding
                ? 'Redirecting to Stripe...'
                : status.hasConnectAccount
                  ? 'Continue payment setup'
                  : 'Start payment setup'}
            </Button>
          </div>
        ) : status ? (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-6 border-b border-border bg-green-50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-green-900">Payments are active</h2>
                  <p className="text-sm text-green-700">
                    Your store is set up to accept orders.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-1">
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Payments mode</span>
                <span className="text-sm font-medium">
                  {PAYMENTS_MODE_LABEL[status.paymentsMode]}
                </span>
              </div>
              <StatusPill ok={status.chargesEnabled} label="Accepting payments" />
              <StatusPill ok={status.payoutsEnabled} label="Payouts enabled" />
              <StatusPill ok={status.detailsSubmitted} label="Details submitted" />

              {onboardError && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{onboardError}</p>
                </div>
              )}

              <div className="pt-4 mt-4 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleStartOnboarding}
                  disabled={isStartingOnboarding}
                >
                  {isStartingOnboarding && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isStartingOnboarding ? 'Redirecting to Stripe...' : 'Update payment details'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function PaymentsSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-muted-foreground">Loading...</span>
          </div>
        </div>
      }
    >
      <PaymentsSetupContent />
    </Suspense>
  );
}
