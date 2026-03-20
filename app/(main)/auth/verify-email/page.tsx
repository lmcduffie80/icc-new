'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { verifyEmail } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, Mail } from 'lucide-react';
import Link from 'next/link';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const verify = async () => {
      const token = searchParams.get('token');

      if (!token) {
        setStatus('error');
        setError('No verification token provided');
        return;
      }

      try {
        const result = await verifyEmail({
          query: {
            token,
          },
        });

        if (result.error) {
          setStatus('error');
          setError(result.error.message || 'Verification failed');
        } else {
          setStatus('success');
          // Auto-redirect after 2 seconds
          setTimeout(() => {
            router.push('/account');
            router.refresh();
          }, 2000);
        }
      } catch (err) {
        setStatus('error');
        setError('An unexpected error occurred');
        console.error('Verification error:', err);
      }
    };

    verify();
  }, [searchParams, router]);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-xl p-8 shadow-sm text-center">
          {status === 'loading' && (
            <>
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight mb-2">
                Verifying your email...
              </h2>
              <p className="text-muted-foreground">
                Please wait while we verify your email address.
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight mb-2">
                Email verified!
              </h2>
              <p className="text-muted-foreground mb-6">
                Your email has been successfully verified. Redirecting you to your account...
              </p>
              <Button onClick={() => router.push('/account')} className="w-full py-3 h-auto text-base">
                Continue to Account
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight mb-2">
                Verification failed
              </h2>
              <p className="text-muted-foreground mb-2">
                {error || 'Unable to verify your email address.'}
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                The verification link may have expired or is invalid.
              </p>

              <div className="space-y-3">
                <Link href="/auth/sign-in" className="block">
                  <Button className="w-full py-3 h-auto text-base">
                    Sign In
                  </Button>
                </Link>
                <Link href="/auth/sign-up" className="block">
                  <Button variant="ghost" className="w-full py-3 h-auto text-base text-muted-foreground">
                    Create New Account
                  </Button>
                </Link>
              </div>

              <div className="mt-6 pt-6 border-t border-border">
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>Need help? Check your email for a new verification link</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md">
            <div className="bg-card border border-border rounded-xl p-8 shadow-sm text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight mb-2">
                Loading...
              </h2>
              <p className="text-muted-foreground">
                Please wait while we prepare your verification.
              </p>
            </div>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
