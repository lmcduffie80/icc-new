'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { twoFactor } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Mail, KeyRound } from 'lucide-react';

type VerifyMode = 'totp' | 'otp' | 'backup';

function TwoFactorForm() {
  const router = useRouter();
  const params = useParams<{ tenant: string }>();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || `/${params.tenant}/account`;

  const [mode, setMode] = useState<VerifyMode>('totp');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setIsLoading(true);
    setError('');

    try {
      let result;

      if (mode === 'totp') {
        result = await twoFactor.verifyTotp({ code: code.trim(), trustDevice });
      } else if (mode === 'otp') {
        result = await twoFactor.verifyOtp({ code: code.trim() });
      } else {
        result = await twoFactor.verifyBackupCode({ code: code.trim(), trustDevice });
      }

      if (result?.error) {
        setError(result.error.message || 'Invalid code. Please try again.');
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtp = async () => {
    setIsSendingOtp(true);
    setError('');
    try {
      const result = await twoFactor.sendOtp();
      if (result?.error) {
        setError(result.error.message || 'Failed to send code.');
      } else {
        setOtpSent(true);
        setMode('otp');
      }
    } catch {
      setError('Failed to send verification code.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const modeConfig = {
    totp: {
      icon: ShieldCheck,
      title: 'Authenticator app',
      description: 'Enter the 6-digit code from your authenticator app.',
      placeholder: '000000',
      maxLength: 6,
      inputMode: 'numeric' as const,
    },
    otp: {
      icon: Mail,
      title: 'Email code',
      description: 'Enter the 6-digit code sent to your email.',
      placeholder: '000000',
      maxLength: 6,
      inputMode: 'numeric' as const,
    },
    backup: {
      icon: KeyRound,
      title: 'Recovery code',
      description: 'Enter one of your 10-character recovery codes.',
      placeholder: 'XXXXXXXXXX',
      maxLength: 12,
      inputMode: 'text' as const,
    },
  };

  const current = modeConfig[mode];
  const Icon = current.icon;

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Two-factor verification</h1>
          <p className="text-muted-foreground text-sm">
            Your account is protected with two-factor authentication.
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
          {/* Method tabs */}
          <div className="flex rounded-lg border border-border bg-muted/30 p-1 mb-6 gap-1">
            <button
              type="button"
              onClick={() => { setMode('totp'); setCode(''); setError(''); }}
              className={`flex-1 text-sm py-1.5 rounded-md transition-colors font-medium hover:cursor-pointer ${
                mode === 'totp'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Authenticator
            </button>
            <button
              type="button"
              onClick={() => { setCode(''); setError(''); if (!otpSent) { handleSendOtp(); } else { setMode('otp'); } }}
              className={`flex-1 text-sm py-1.5 rounded-md transition-colors font-medium hover:cursor-pointer ${
                mode === 'otp'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              disabled={isSendingOtp}
            >
              {isSendingOtp ? 'Sending…' : 'Email code'}
            </button>
            <button
              type="button"
              onClick={() => { setMode('backup'); setCode(''); setError(''); }}
              className={`flex-1 text-sm py-1.5 rounded-md transition-colors font-medium hover:cursor-pointer ${
                mode === 'backup'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Recovery
            </button>
          </div>

          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{current.title}</span>
              </div>
              <p className="text-xs text-muted-foreground">{current.description}</p>
              <input
                ref={inputRef}
                type={current.inputMode === 'numeric' ? 'text' : 'text'}
                inputMode={current.inputMode}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={current.placeholder}
                maxLength={current.maxLength}
                autoComplete="one-time-code"
                required
                className="w-full px-4 py-3 text-center text-xl tracking-widest font-mono border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
              />
            </div>

            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
                {error}
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="text-sm text-muted-foreground">
                Trust this device for 30 days
              </span>
            </label>

            <Button
              type="submit"
              disabled={isLoading || !code.trim()}
              className="w-full py-3 h-auto text-base"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Verifying…
                </span>
              ) : (
                'Verify'
              )}
            </Button>
          </form>

          {mode === 'otp' && otpSent && (
            <p className="text-center text-xs text-muted-foreground mt-4">
              Didn&apos;t receive the code?{' '}
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={isSendingOtp}
                className="text-primary hover:underline hover:cursor-pointer disabled:opacity-50"
              >
                {isSendingOtp ? 'Sending…' : 'Resend'}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TwoFactorPage() {
  return (
    <Suspense>
      <TwoFactorForm />
    </Suspense>
  );
}
