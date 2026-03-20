import { betterAuth } from 'better-auth';
import { Pool } from '@neondatabase/serverless';
import { passkey } from '@better-auth/passkey';
import { sendVerificationEmail, sendPasswordResetEmail } from './email';

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
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
  trustedOrigins: [
    process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  ],
  plugins: [
    passkey(),
  ],
});

export type Session = typeof auth.$Infer.Session;

