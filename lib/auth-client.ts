import { createAuthClient } from 'better-auth/react';
import { passkeyClient } from '@better-auth/passkey/client';
import { twoFactorClient } from 'better-auth/client/plugins';

/**
 * Normalize an origin string so we never end up with a trailing slash on
 * the auth client baseURL. Better Auth concatenates the endpoint path
 * (which already starts with `/`) onto baseURL — without normalization, an
 * env value like `https://example.com/` produces requests to
 * `https://example.com//api/auth/get-session`, which Vercel answers with a
 * 308 redirect to the canonical single-slash URL. Browsers handle
 * credentialed redirects inconsistently, and the extra round trip stalls
 * `useSession()` on first load. Mirrors the equivalent helper in
 * `lib/auth.ts` so client and server agree on the canonical origin.
 */
function normalizeOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (!url.host) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * In the browser we ALWAYS prefer `window.location.origin` — it's the only
 * value guaranteed to match the page the user actually loaded, so the
 * session fetch goes to the same host that owns the session cookie. This
 * also makes the client work transparently across preview deploys, custom
 * domains, and tenant aliases without requiring any env-var coordination.
 *
 * On the server (during the brief import-time evaluation in Next.js
 * bundling) we fall back to the normalized env var, then to localhost.
 */
const baseURL =
  (typeof window !== 'undefined' ? window.location.origin : null) ??
  normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
  'http://localhost:3000';

export const authClient = createAuthClient({
  baseURL,
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
