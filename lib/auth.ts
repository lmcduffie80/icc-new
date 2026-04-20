import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import { passkey } from '@better-auth/passkey';
import { sendVerificationEmail, sendPasswordResetEmail } from './email';

// Normalize an origin string: trim whitespace, strip trailing slashes,
// and discard anything that doesn't parse as an absolute URL with a host.
// This guards against common env-var mistakes like "https://example.com/"
// or accidental whitespace, both of which would otherwise silently break
// better-auth's exact-string CSRF check and produce "Invalid origin".
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

const baseURL =
  normalizeOrigin(process.env.BETTER_AUTH_URL) ?? 'http://localhost:3000';

// Build the trusted-origin list from every URL the app might be served from.
// Keeping multiple sources here means a single misconfigured env var (or a
// `vercel env pull` overwriting a local value) cannot lock you out of auth.
//   - BETTER_AUTH_URL:   canonical URL for this environment.
//   - VERCEL_URL:        per-deployment URL Vercel injects automatically
//                        (e.g. icc-abc123-team.vercel.app on previews).
//   - VERCEL_BRANCH_URL: stable branch alias (e.g. icc-git-main-team.vercel.app).
//   - localhost:3000:    always trusted in non-production for local dev,
//                        so a broken env var can't break sign-in locally.
const trustedOrigins = Array.from(
  new Set(
    [
      baseURL,
      normalizeOrigin(process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`),
      normalizeOrigin(
        process.env.VERCEL_BRANCH_URL && `https://${process.env.VERCEL_BRANCH_URL}`
      ),
      process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : null,
    ].filter((origin): origin is string => Boolean(origin))
  )
);

export const auth = betterAuth({
  baseURL,
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: false,
    sendVerificationEmail: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
      console.log('[Better Auth] Sending verification email to:', user.email);
      console.log('[Better Auth] Verification URL:', url);

      try {
        const result = await sendVerificationEmail({
          to: user.email,
          subject: 'Verify your email address',
          name: user.name,
          verificationUrl: url,
        });

        console.log('[Better Auth] Email send result:', result);

        if (!result.success) {
          console.error('[Better Auth] Failed to send verification email:', result.error);
        }
      } catch (error) {
        console.error('[Better Auth] Error in sendVerificationEmail callback:', error);
        // Do not rethrow — allow sign-in to proceed even if email fails
      }
    },
    autoSignInAfterVerification: true,
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
      console.log('[Better Auth] Sending password reset email to:', user.email);
      console.log('[Better Auth] Reset URL:', url);

      try {
        const result = await sendPasswordResetEmail({
          to: user.email,
          subject: 'Reset your password',
          name: user.name || 'there',
          resetUrl: url,
        });

        console.log('[Better Auth] Password reset email result:', result);

        if (!result.success) {
          console.error('[Better Auth] Failed to send password reset email:', result.error);
        }
      } catch (error) {
        console.error('[Better Auth] Error in sendResetPassword callback:', error);
        throw error;
      }
    },
  },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
      ? {
          apple: {
            clientId: process.env.APPLE_CLIENT_ID,
            clientSecret: process.env.APPLE_CLIENT_SECRET,
          },
        }
      : {}),
  },
  user: {
    deleteUser: {
      enabled: true,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 3, // 3 days for better security
    updateAge: 60 * 60 * 24, // 1 day - update session if older than this
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
  trustedOrigins,
  plugins: [
    passkey(),
  ],
});

export type Session = typeof auth.$Infer.Session;

