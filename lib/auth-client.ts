import { createAuthClient } from 'better-auth/react';
import { passkeyClient } from '@better-auth/passkey/client';
import { twoFactorClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  plugins: [
    passkeyClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        // Tenant-scoped redirect is handled in the sign-in page's onSuccess callback.
        // This fallback fires for any other auth flow that triggers a 2FA challenge.
        if (typeof window !== 'undefined') {
          const slug = window.location.pathname.split('/')[1] ?? '';
          window.location.href = `/${slug}/auth/two-factor`;
        }
      },
    }),
  ],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  passkey,
  deleteUser,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  twoFactor,
} = authClient;
