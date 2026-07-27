import { z } from 'zod';

// Define the environment variable schema
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url().startsWith('postgres'),

  // Better Auth
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),

  // Public base URL (used in email links)
  NEXT_PUBLIC_BASE_URL: z.string().url(),

  // Social Auth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_CLIENT_SECRET: z.string().optional(),

  // AWS S3
  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_S3_BUCKET_NAME: z.string().min(1),

  // Logo URL (optional - falls back to Odoo URL if not set)
  LOGO_URL: z.string().url().optional(),

  // Upstash Redis (for rate limiting)
  UPSTASH_REDIS_REST_URL: z.string().url().startsWith('https'),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  // Admin
  ADMIN_SECRET: z.string().min(32),

  // Resend Email Service (required for transactional emails)
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().email().refine(
    (email) => {
      // Warn against using free email providers
      const freeDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'example.com'];
      const domain = email.split('@')[1].toLowerCase();
      return !freeDomains.includes(domain);
    },
    {
      message: 'EMAIL_FROM should use a custom domain verified in Resend, not a free email provider or example.com',
    }
  ),

  // Admin notification email (optional - BCC on supplier-facing emails)
  ICC_ADMIN_EMAIL: z.string().email().optional(),

  // Stripe Payment Processing
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),

  // DocuSign E-Signature (optional - for contract signing)
  DOCUSIGN_INTEGRATION_KEY: z.string().optional(),
  DOCUSIGN_USER_ID: z.string().uuid().optional(),
  DOCUSIGN_ACCOUNT_ID: z.string().uuid().optional(),
  DOCUSIGN_PRIVATE_KEY: z.string().optional(),
  DOCUSIGN_BASE_PATH: z.string().url().default('https://na3.docusign.net/restapi'),

  // reCAPTCHA v3 (optional -- gracefully disabled when not configured)
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY: z.string().optional(),
  RECAPTCHA_SECRET_KEY: z.string().optional(),

  // Optional: IP Whitelist for admin
  ADMIN_IP_WHITELIST: z.string().optional(), // Comma-separated IPs

  // Cron job secret (used to authenticate Vercel cron requests)
  CRON_SECRET: z.string().min(16).optional(),

  // Anthropic AI (optional — AI features disabled when not configured)
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  // ShipBoss API (optional — shipping quotes disabled when not configured)
  SHIPPING_ICC: z.string().min(1).optional(),

  // Google Maps API (optional — truckload distance calculation disabled when not configured)
  GOOGLE_MAPS_API_KEY: z.string().min(1).optional(),

  // ShipBoss Web Automation (optional — LTL freight booking via headless browser)
  SHIPBOSS_WEB_EMAIL: z.string().email().optional(),
  SHIPBOSS_WEB_PASSWORD: z.string().min(1).optional(),

  // Browserless.io (optional — remote Chromium for LTL booking in production/Vercel)
  BROWSERLESS_WS_ENDPOINT: z.string().url().optional(),

  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate environment variables at startup
 * Call this function early in your application lifecycle
 */
export function validateEnv(): Env {
  try {
    const env = envSchema.parse(process.env);
    console.log('✅ Environment variables validated successfully');
    
    // Additional warnings for email configuration
    if (env.EMAIL_FROM) {
      const domain = env.EMAIL_FROM.split('@')[1];
      console.log(`📧 Email sender domain: ${domain}`);
      console.log(`⚠️  Reminder: Ensure ${domain} is verified in your Resend dashboard at https://resend.com/domains`);
      
      if (env.EMAIL_FROM.includes('example.com')) {
        console.warn('⚠️  WARNING: EMAIL_FROM uses example.com - this will not work in production!');
        console.warn('   Update EMAIL_FROM to use your verified domain in Resend.');
      }
    }
    
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.issues.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
        
        // Provide specific guidance for email configuration errors
        if (err.path.includes('EMAIL_FROM') || err.path.includes('RESEND_API_KEY')) {
          console.error('');
          console.error('  📧 Email Configuration Help:');
          console.error('     1. Get your RESEND_API_KEY from https://resend.com/api-keys');
          console.error('     2. Set EMAIL_FROM to an email address using your verified domain');
          console.error('     3. Verify your domain in Resend at https://resend.com/domains');
          console.error('     4. For testing, you can use: onboarding@resend.dev');
          console.error('');
        }
      });
      
      // In production, we should fail fast
      if (process.env.NODE_ENV === 'production') {
        console.error('\n🚨 Application cannot start with invalid environment variables');
        process.exit(1);
      } else {
        console.warn('\n⚠️  Continuing in development mode with invalid environment');
      }
    }
    throw error;
  }
}

/**
 * Get validated environment variable
 * This ensures type safety when accessing env vars
 */
export function getEnv(): Env {
  return validateEnv();
}

/**
 * Check if all required environment variables are set
 * Returns missing variable names
 */
export function getMissingEnvVars(): string[] {
  const result = envSchema.safeParse(process.env);
  if (result.success) {
    return [];
  }
  
  return result.error.issues
    .filter((err) => err.message.includes('Required'))
    .map((err) => err.path.join('.'));
}

/**
 * Parse admin IP whitelist from environment
 */
export function getAdminIpWhitelist(): string[] {
  const whitelist = process.env.ADMIN_IP_WHITELIST;
  if (!whitelist) {
    return [];
  }
  
  return whitelist
    .split(',')
    .map((ip) => ip.trim())
    .filter((ip) => ip.length > 0);
}

/**
 * Check if IP is whitelisted for admin access
 */
export function isIpWhitelisted(ip: string): boolean {
  const whitelist = getAdminIpWhitelist();
  
  // If whitelist is empty, allow all IPs (not recommended for production)
  if (whitelist.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️  Admin IP whitelist is not configured in production');
    }
    return true;
  }
  
  return whitelist.includes(ip);
}

