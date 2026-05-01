'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Shield,
  Lock,
  Trash2,
  Sun,
  Moon,
  Monitor,
  Smartphone,
  Fingerprint,
  Plus,
  Key,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import { passkey, deleteUser, signOut, twoFactor, useSession } from '@/lib/auth-client';

export default function SettingsPage() {
  const router = useRouter();
  const { user, isPending } = useAuth();
  const { data: session } = useSession();

  // Theme preference
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  // 2FA state
  const [showDisable2fa, setShowDisable2fa] = useState(false);
  const [disable2faPassword, setDisable2faPassword] = useState('');
  const [disable2faError, setDisable2faError] = useState('');
  const [isDisabling2fa, setIsDisabling2fa] = useState(false);

  // Passkey state
  const [passkeys, setPasskeys] = useState<Array<{
    id: string;
    name?: string;
    createdAt: Date | null;
    deviceType: string;
  }>>([]);
  const [isLoadingPasskeys, setIsLoadingPasskeys] = useState(true);
  const [isAddingPasskey, setIsAddingPasskey] = useState(false);
  const [passkeyError, setPasskeyError] = useState('');
  const [passkeySupported, setPasskeySupported] = useState(false);

  // Delete account state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (!isPending && !user) {
      router.push('/auth/sign-in');
    }
  }, [user, isPending, router]);

  // Check WebAuthn support and load passkeys
  useEffect(() => {
    if (typeof window !== 'undefined' && window.PublicKeyCredential) {
      setPasskeySupported(true);
    }

    if (user) {
      loadPasskeys();
    }
  }, [user]);

  // Initialize and apply theme
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      applyTheme(savedTheme);
    }
  }, []);

  const applyTheme = (newTheme: 'light' | 'dark' | 'system') => {
    const root = document.documentElement;

    if (newTheme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    } else if (newTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  };

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  };

  const loadPasskeys = async () => {
    setIsLoadingPasskeys(true);
    try {
      const result = await passkey.listUserPasskeys();
      if (result.data) {
        setPasskeys(result.data);
      }
    } catch {
      console.error('Failed to load passkeys');
    } finally {
      setIsLoadingPasskeys(false);
    }
  };

  const handleAddPasskey = async () => {
    setIsAddingPasskey(true);
    setPasskeyError('');
    try {
      const result = await passkey.addPasskey();
      if (result.error) {
        setPasskeyError(result.error.message || 'Failed to add passkey');
      } else {
        await loadPasskeys();
      }
    } catch {
      setPasskeyError('Passkey registration was cancelled or failed');
    } finally {
      setIsAddingPasskey(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    try {
      const result = await passkey.deletePasskey({ id });
      if (result.error) {
        setPasskeyError(result.error.message || 'Failed to delete passkey');
      } else {
        await loadPasskeys();
      }
    } catch {
      setPasskeyError('Failed to delete passkey');
    }
  };

  const handleDisable2fa = async () => {
    setIsDisabling2fa(true);
    setDisable2faError('');
    try {
      const result = await twoFactor.disable({ password: disable2faPassword });
      if (result.error) {
        setDisable2faError(result.error.message || 'Failed to disable 2FA.');
      } else {
        setShowDisable2fa(false);
        setDisable2faPassword('');
        router.refresh();
      }
    } catch {
      setDisable2faError('An unexpected error occurred.');
    } finally {
      setIsDisabling2fa(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      const result = await deleteUser({
        password: deletePassword || undefined,
      });
      if (result.error) {
        setDeleteError(result.error.message || 'Failed to delete account');
        setIsDeleting(false);
      } else {
        // Account deleted successfully, sign out and redirect
        await signOut();
        router.push('/');
      }
    } catch {
      setDeleteError('An unexpected error occurred. Please try again.');
      setIsDeleting(false);
    }
  };

  if (isPending) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <svg className="animate-spin h-5 w-5 text-primary" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Placeholder active sessions
  const activeSessions = [
    {
      id: '1',
      device: 'Current Device',
      browser: 'Chrome on macOS',
      lastActive: 'Now',
      current: true,
    },
  ];

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
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your account preferences and security
          </p>
        </div>

        <div className="space-y-6">
          {/* Security */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Security</h2>
                <p className="text-sm text-muted-foreground">Manage your account security</p>
              </div>
            </div>

            {/* Change Password */}
            <div className="pb-6 mb-6 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="font-medium">Password</div>
                    <div className="text-sm text-muted-foreground">Last changed: Never</div>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  Change Password
                </Button>
              </div>
            </div>

            {/* Two-Factor Authentication */}
            <div className="pb-6 mb-6 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      Two-factor authentication
                      {session?.user?.twoFactorEnabled ? (
                        <span className="text-xs font-medium text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                          Enabled
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                          Off
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {session?.user?.twoFactorEnabled
                        ? 'Your account is protected with an authenticator app.'
                        : 'Add an extra layer of security to your account.'}
                    </div>
                  </div>
                </div>
                {session?.user?.twoFactorEnabled ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/40 hover:bg-destructive/5"
                    onClick={() => setShowDisable2fa(true)}
                  >
                    <ShieldOff className="h-4 w-4 mr-1.5" />
                    Disable
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`auth/two-factor/setup`)}
                  >
                    <ShieldCheck className="h-4 w-4 mr-1.5" />
                    Enable
                  </Button>
                )}
              </div>

              {/* Disable 2FA confirmation panel */}
              {showDisable2fa && (
                <div className="mt-4 p-4 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Enter your password to disable two-factor authentication.
                  </p>
                  <input
                    type="password"
                    value={disable2faPassword}
                    onChange={(e) => setDisable2faPassword(e.target.value)}
                    placeholder="Your password"
                    autoComplete="current-password"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-destructive/50"
                  />
                  {disable2faError && (
                    <p className="text-sm text-destructive">{disable2faError}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setShowDisable2fa(false); setDisable2faPassword(''); setDisable2faError(''); }}
                      disabled={isDisabling2fa}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={handleDisable2fa}
                      disabled={isDisabling2fa || !disable2faPassword}
                    >
                      {isDisabling2fa ? 'Disabling…' : 'Disable 2FA'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Passkeys */}
            {passkeySupported && (
              <div className="pb-6 mb-6 border-b border-border">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Fingerprint className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium">Passkeys</div>
                      <div className="text-sm text-muted-foreground">
                        Sign in without a password using fingerprint, face, or security key
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddPasskey}
                    disabled={isAddingPasskey || !user.emailVerified}
                  >
                    {isAddingPasskey ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Adding...
                      </span>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Passkey
                      </>
                    )}
                  </Button>
                </div>

                {/* Email verification warning */}
                {!user.emailVerified && (
                  <div className="mb-4 p-4 text-sm bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <svg className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <p className="font-medium text-yellow-800">Email verification required</p>
                        <p className="text-yellow-700 mt-1">
                          Please verify your email address before adding a passkey. Check your inbox for a verification link.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {passkeyError && (
                  <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
                    {passkeyError}
                  </div>
                )}

                {isLoadingPasskeys ? (
                  <div className="flex items-center justify-center py-6">
                    <svg className="animate-spin h-5 w-5 text-muted-foreground" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                ) : passkeys.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No passkeys registered</p>
                    <p className="text-sm mt-1">Add a passkey for faster, more secure sign-in</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {passkeys.map((pk) => (
                      <div key={pk.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-3">
                          <Fingerprint className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-medium">
                              {pk.name || 'Passkey'}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {pk.deviceType === 'singleDevice' ? 'This device' : 'Multi-device'}
                              {pk.createdAt && ` · Added ${new Date(pk.createdAt).toLocaleDateString()}`}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeletePasskey(pk.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Active Sessions */}
            <div>
              <h3 className="font-medium mb-4">Active Sessions</h3>
              <div className="space-y-3">
                {activeSessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <Smartphone className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {session.device}
                          {session.current && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {session.browser} · {session.lastActive}
                        </div>
                      </div>
                    </div>
                    {!session.current && (
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                        Revoke
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Sun className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Appearance</h2>
                <p className="text-sm text-muted-foreground">Customize how the site looks</p>
              </div>
            </div>
            <div>
              <h3 className="font-medium mb-3">Theme</h3>
              <div className="flex gap-3">
                {[
                  { value: 'light' as const, label: 'Light', icon: Sun },
                  { value: 'dark' as const, label: 'Dark', icon: Moon },
                  { value: 'system' as const, label: 'System', icon: Monitor },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleThemeChange(option.value)}
                    className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors ${
                      theme === option.value
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <option.icon className="h-4 w-4" />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Privacy */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Privacy</h2>
                <p className="text-sm text-muted-foreground">Manage your data and account</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Delete Account */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                <div className="flex items-center gap-3">
                  <Trash2 className="h-5 w-5 text-destructive" />
                  <div>
                    <div className="font-medium text-destructive">Delete Account</div>
                    <div className="text-sm text-muted-foreground">
                      Permanently delete your account and all data
                    </div>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-destructive border-destructive/50 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => {
                    setShowDeleteDialog(true);
                    setDeletePassword('');
                    setDeleteError('');
                  }}
                >
                  Delete Account
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Account Confirmation Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !isDeleting && setShowDeleteDialog(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowDeleteDialog(false);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Close delete account confirmation dialog"
          />
          
          {/* Dialog */}
          <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-destructive/10">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <h2 className="text-lg font-semibold">Delete Account</h2>
            </div>
            
            <p className="text-muted-foreground mb-4">
              Are you sure you want to delete your account? This action is <strong className="text-foreground">permanent</strong> and cannot be undone. All your data, including orders, saved addresses, and preferences will be permanently removed.
            </p>
            
            <div className="mb-4">
              <label htmlFor="delete-password" className="block text-sm font-medium mb-2">
                Enter your password to confirm
              </label>
              <input
                id="delete-password"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Your password"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-destructive/50 focus:border-destructive"
                disabled={isDeleting}
              />
              <p className="text-xs text-muted-foreground mt-1">
                If you signed up with a social account, you can leave this blank.
              </p>
            </div>

            {deleteError && (
              <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Deleting...
                  </span>
                ) : (
                  'Delete My Account'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

