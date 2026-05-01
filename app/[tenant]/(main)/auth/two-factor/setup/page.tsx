'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { twoFactor, useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Copy, Check, Download } from 'lucide-react';
import dynamic from 'next/dynamic';

const QRCode = dynamic(() => import('react-qr-code').then((m) => m.default), { ssr: false });

type Step = 'password' | 'qr' | 'verify' | 'backup' | 'done';

export default function MfaSetupPage() {
  const router = useRouter();
  const params = useParams<{ tenant: string }>();
  const { data: session, isPending } = useSession();

  const [step, setStep] = useState<Step>('password');
  const [password, setPassword] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.push(`/${params.tenant}/auth/sign-in`);
    }
    // Already enrolled — go to account
    if (!isPending && session?.user?.twoFactorEnabled) {
      router.replace(`/${params.tenant}/account`);
    }
  }, [session, isPending, router, params.tenant]);

  const handleEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const result = await twoFactor.enable({ password });
      if (result.error) {
        setError(result.error.message || 'Failed to start setup. Check your password.');
      } else if (result.data) {
        const data = result.data as { totpURI?: string; backupCodes?: string[] };
        if (data.totpURI) setTotpUri(data.totpURI);
        if (data.backupCodes) setBackupCodes(data.backupCodes);
        setStep('qr');
      }
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim()) return;
    setIsLoading(true);
    setError('');
    try {
      const result = await twoFactor.verifyTotp({ code: verifyCode.trim() });
      if (result.error) {
        setError(result.error.message || 'Invalid code. Please try again.');
      } else {
        setStep('backup');
      }
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadBackupCodes = () => {
    const content = backupCodes.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agrovus-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isPending) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <svg className="animate-spin h-6 w-6 text-primary" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 bg-muted/30">
      <div className="w-full max-w-md">
        {/* Progress steps */}
        <ol className="flex items-center justify-center gap-2 mb-8">
          {(['password', 'qr', 'verify', 'backup'] as Step[]).map((s, i) => {
            const stepIndex = ['password', 'qr', 'verify', 'backup'].indexOf(step);
            const thisIndex = i;
            return (
              <li key={s} className="flex items-center gap-2">
                <span
                  className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border-2 transition-colors ${
                    thisIndex < stepIndex
                      ? 'border-primary bg-primary text-primary-foreground'
                      : thisIndex === stepIndex
                      ? 'border-primary text-primary'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  {thisIndex < stepIndex ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {i < 3 && <div className={`h-px w-8 ${thisIndex < stepIndex ? 'bg-primary' : 'bg-border'}`} />}
              </li>
            );
          })}
        </ol>

        <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
          {/* Step 1: password */}
          {step === 'password' && (
            <form onSubmit={handleEnable} className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-full bg-primary/10">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold">Set up two-factor authentication</h1>
                  <p className="text-sm text-muted-foreground">Your organization requires MFA.</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Confirm your password to begin. You&apos;ll scan a QR code with an authenticator app
                like Google Authenticator, Authy, or 1Password.
              </p>

              <div className="space-y-2">
                <label htmlFor="mfa-password" className="text-sm font-medium">Current password</label>
                <input
                  id="mfa-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                />
              </div>

              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">{error}</div>
              )}

              <Button type="submit" disabled={isLoading || !password} className="w-full">
                {isLoading ? 'Please wait…' : 'Continue'}
              </Button>
            </form>
          )}

          {/* Step 2: QR code */}
          {step === 'qr' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Scan QR code</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Open your authenticator app and scan the code below. Then click Continue.
                </p>
              </div>

              {totpUri && (
                <div className="flex justify-center p-4 bg-white rounded-xl border border-border">
                  <QRCode value={totpUri} size={180} />
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center">
                Can&apos;t scan?{' '}
                <button
                  type="button"
                  onClick={() => copyToClipboard(totpUri)}
                  className="text-primary hover:underline hover:cursor-pointer inline-flex items-center gap-1"
                >
                  {copied ? <><Check className="h-3 w-3" />Copied</> : 'Copy setup key'}
                </button>
              </p>

              <Button onClick={() => setStep('verify')} className="w-full">
                Continue
              </Button>
            </div>
          )}

          {/* Step 3: verify TOTP */}
          {step === 'verify' && (
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Verify code</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Enter the 6-digit code from your authenticator app to confirm setup.
                </p>
              </div>

              <input
                type="text"
                inputMode="numeric"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                placeholder="000000"
                maxLength={6}
                autoFocus
                autoComplete="one-time-code"
                required
                className="w-full px-4 py-3 text-center text-xl tracking-widest font-mono border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
              />

              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">{error}</div>
              )}

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setStep('qr')} className="flex-1">
                  Back
                </Button>
                <Button type="submit" disabled={isLoading || verifyCode.length < 6} className="flex-1">
                  {isLoading ? 'Verifying…' : 'Verify'}
                </Button>
              </div>
            </form>
          )}

          {/* Step 4: save backup codes */}
          {step === 'backup' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Save your recovery codes</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Store these codes somewhere safe. Each code can only be used once if you lose access to your authenticator.
                </p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 grid grid-cols-2 gap-2">
                {backupCodes.map((c) => (
                  <code key={c} className="text-xs font-mono text-center py-1 px-2 bg-background rounded border border-border">
                    {c}
                  </code>
                ))}
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => copyToClipboard(backupCodes.join('\n'))}
                  className="flex-1"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {copied ? 'Copied!' : 'Copy all'}
                </Button>
                <Button type="button" variant="outline" onClick={downloadBackupCodes} className="flex-1">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>

              <Button
                onClick={() => {
                  setStep('done');
                  router.push(`/${params.tenant}/account`);
                  router.refresh();
                }}
                className="w-full"
              >
                Done — go to my account
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
