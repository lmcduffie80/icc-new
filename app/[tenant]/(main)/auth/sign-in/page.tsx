'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { signIn } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Fingerprint } from 'lucide-react';

function SignInForm() {
  const router = useRouter();
  const params = useParams<{ tenant: string }>();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || `/${params.tenant}/account`;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);

  useEffect(() => {
    // Check if WebAuthn is supported
    if (window.PublicKeyCredential) {
      setPasskeySupported(true);
    }
  }, []);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await signIn.email(
        { email, password },
        {
          onSuccess(ctx) {
            const data = ctx.data as { twoFactorRedirect?: boolean };
            if (data?.twoFactorRedirect) {
              // Server will redirect via the twoFactorPage config in auth-client;
              // as a safety net we also push here with the callbackUrl preserved.
              router.push(
                `/${params.tenant}/auth/two-factor?callbackUrl=${encodeURIComponent(callbackUrl)}`
              );
              return;
            }
            router.push(callbackUrl);
            router.refresh();
          },
        }
      );

      if (result?.error) {
        setError(result.error.message || 'Failed to sign in');
        setIsLoading(false);
      }
    } catch {
      setError('An unexpected error occurred');
      setIsLoading(false);
    }
  };

  // Social sign-in handlers commented out - not currently in use
  // const handleGoogleSignIn = async () => {
  //   setIsLoading(true);
  //   setError('');
  //
  //   try {
  //     await signIn.social({
  //       provider: 'google',
  //       callbackURL: '/account',
  //     });
  //   } catch {
  //     setError('Failed to sign in with Google');
  //     setIsLoading(false);
  //   }
  // };
  //
  // const handleAppleSignIn = async () => {
  //   setIsLoading(true);
  //   setError('');
  //
  //   try {
  //     await signIn.social({
  //       provider: 'apple',
  //       callbackURL: '/account',
  //     });
  //   } catch {
  //     setError('Failed to sign in with Apple');
  //     setIsLoading(false);
  //   }
  // };

  const handlePasskeySignIn = async () => {
    setIsLoading(true);
    setError('');

    try {
      const result = await signIn.passkey();

      if (result?.error) {
        setError(result.error.message || 'Failed to sign in with passkey');
        setIsLoading(false);
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError('Passkey sign-in was cancelled or failed');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold tracking-tight mb-2">Welcome back</h1>
          <p className="text-muted-foreground">
            Sign in to your account to continue
          </p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
          {/* Email Form */}
          <form onSubmit={handleEmailSignIn} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                autoComplete="username"
                className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <Link
                  href="/auth/forgot-password"
                  className="text-sm text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 h-auto text-base"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          {/* Passkey Sign-in */}
          {passkeySupported && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-card text-muted-foreground">or continue with</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handlePasskeySignIn}
                disabled={isLoading}
                className="w-full py-3 h-auto text-base"
              >
                <Fingerprint className="h-5 w-5 mr-2" />
                Sign in with Passkey
              </Button>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/auth/sign-up" className="text-primary font-medium hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}

