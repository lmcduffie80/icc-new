# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A secure, production-grade Next.js 16 e-commerce platform with enterprise security features, admin panel, and Stripe payment processing. Built with Better Auth, PostgreSQL, S3 file storage, and Upstash Redis rate limiting.

## Development Commands

```bash
# Development
pnpm dev                     # Start development server (http://localhost:3000)
pnpm build                   # Production build (REQUIRED before marking tasks complete)
pnpm lint                    # Run ESLint (REQUIRED before marking tasks complete)

# Testing
pnpm test                    # Run all tests (REQUIRED before marking tasks complete)
pnpm run test:watch          # Watch mode for development
pnpm run test:coverage       # Generate coverage report

# Database Migrations
pnpm run db:migrate          # Run Better Auth migrations
pnpm run db:migrate:orders   # Run custom migrations (orders, products, etc.)
pnpm run db:generate         # Generate Better Auth types

# Type Checking
pnpm exec tsc --noEmit      # Type check without emitting files
```

**CRITICAL PRE-COMPLETION CHECKLIST:**
Before marking any feature or task as complete, ALL of these must pass:
1. `pnpm run lint` - No errors allowed
2. `pnpm test` - All tests must pass
3. `pnpm run build` - Build must succeed
4. No TypeScript errors

## Package Manager: pnpm ONLY

This project uses **pnpm exclusively** (enforced via `packageManager: "pnpm@9.0.0"` in package.json).

**Never use npm, npx, or yarn.** All commands must use pnpm:
- `pnpm install` - Install dependencies
- `pnpm add <package>` - Add dependency
- `pnpm add -D <package>` - Add dev dependency
- `pnpm remove <package>` - Remove dependency
- `pnpm exec <command>` - Run a command (replaces `npx`)

The `pnpm-lock.yaml` must always be committed with dependency changes. Never commit `package-lock.json` or `yarn.lock`.

## Architecture Overview

### Dual Authentication System

This platform has **two separate authentication systems** - do not confuse them:

1. **Customer Auth (`lib/auth.ts`)** - Better Auth
   - Regular users shopping, ordering, managing accounts
   - Email/password + email verification required
   - Passkey support enabled
   - Session duration: 3 days
   - Tables: `user`, `session`, `verification`, `account`

2. **Admin Auth (`lib/admin-auth.ts`)** - Custom standalone system
   - Completely separate from customer auth
   - IP whitelist enforcement (configurable via `ADMIN_IP_WHITELIST` env var)
   - Bcrypt password hashing
   - Rate limiting (100 req/min for admin routes)
   - Account lockout after 5 failed attempts
   - Tables: `admin_users`, `admin_sessions`, `admin_roles`, `admin_permissions`
   - Admin middleware: `lib/admin-middleware.ts` with `verifyAdminAuth()`

**Key Distinction:** Admins and customers are completely separate entities. An admin cannot log in as a customer and vice versa. Never mix the two authentication systems.

### Security Architecture

Security is enforced at every layer through these core systems:

1. **Input Validation** (`lib/validation.ts`)
   - All API inputs validated with Zod schemas
   - Validate on server, never trust client data
   - Each endpoint has its own schema

2. **Rate Limiting** (`lib/rate-limit.ts`)
   - Upstash Redis-based sliding window algorithm
   - Applied to ALL public API routes
   - Rate limit tiers:
     - `critical`: 5 req/min (contact forms, sensitive operations)
     - `auth`: 5 req/min (login, signup)
     - `upload`: 10 req/min (file uploads)
     - `moderate`: 20 req/min (forms, data mutations)
     - `relaxed`: 60 req/min (public reads)
     - `admin`: 100 req/min (admin routes, combined with IP whitelist)

3. **Security Logging** (`lib/security-logger.ts`)
   - Winston-based logging to `logs/security-combined.log`
   - Log types: authentication, admin actions, suspicious activity, validation failures
   - All security-relevant events must be logged
   - Never log sensitive data (passwords, tokens, credit cards)

4. **Order Validation** (`lib/order-validation.ts`)
   - Server-side price recalculation from database
   - Prevents client-side price manipulation
   - Inventory availability checks
   - Compare client total vs server total

5. **Admin Protection** (`lib/admin-middleware.ts`)
   - `verifyAdminAuth()` function combines:
     - IP whitelist checking
     - Rate limiting
     - Session validation
     - Permission checking
   - Must be used on ALL admin routes

### API Route Pattern

All API routes follow this strict order:

```typescript
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // 1. RATE LIMITING (first line of defense)
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/route', 'POST');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // 2. INPUT VALIDATION (before any processing)
  const body = await request.json();
  const result = schema.safeParse(body);
  if (!result.success) {
    securityLogger.logValidationFailure('/api/route', ip, result.error.issues, 'POST');
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
  }

  // 3. AUTHENTICATION (if required)
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 4. BUSINESS LOGIC (in try-catch)
  try {
    // Implementation here
    return NextResponse.json({ success: true });
  } catch (error) {
    securityLogger.logError('Operation failed', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

For admin routes, replace step 3 with:
```typescript
const authResult = await verifyAdminAuth(request);
if (!authResult.authorized) {
  return authResult.response!;
}
```

### Database Architecture

PostgreSQL with Neon serverless driver. Connection pooling configured in `lib/db.ts`.

**Key Tables:**
- Customer auth: `user`, `session`, `verification`, `account`
- Admin auth: `admin_users`, `admin_sessions`, `admin_roles`, `admin_permissions`
- E-commerce: `products`, `orders`, `order_items`, `order_addresses`
- Features: `contact_submissions`
- Payments: `stripe_payment_methods`, `tax_rates`
- Audit: Tracked via security logger

**Migration Pattern:**
- Better Auth migrations: `pnpm run db:migrate`
- Custom migrations: Place in `migrations/` directory as `NNN_description.sql`
- Run custom migrations: `pnpm run db:migrate:orders`
- Always use parameterized queries via neon template literals

### Next.js App Router Structure

```
app/
├── (main)/              # Public customer-facing site
│   ├── auth/           # Customer sign-in/sign-up
│   ├── account/        # Customer account management
│   ├── shop/           # Product browsing
│   ├── checkout/       # Order placement
│   └── [other pages]   # About, contact, FAQ, etc.
├── admin/              # Separate admin panel
│   ├── (auth)/login    # Admin login (separate from customer auth)
│   └── (dashboard)/    # Admin management pages
└── api/                # API routes
    ├── auth/[...all]/  # Better Auth endpoints (customers)
    ├── admin/          # Admin API routes (require verifyAdminAuth)
    └── [public APIs]   # Contact, products, orders, etc.
```

### Component Architecture

- **Server Components by default** - Only add `'use client'` when needed
- **Client components require:**
  - State: `useState`, `useReducer`
  - Effects: `useEffect`, `useLayoutEffect`
  - Event handlers: `onClick`, `onChange`, etc.
  - Browser APIs: `window`, `document`, `localStorage`
  - Zustand stores: Cart (`lib/cart-store.ts`), Compare (`lib/compare-store.ts`)
- **Styling:** Tailwind CSS utility classes
- **Accessibility:** Proper ARIA labels, semantic HTML, keyboard navigation

### State Management

1. **Server State** - Fetch in Server Components, pass to Client Components as props
2. **Client State** - React hooks (`useState`, `useReducer`)
3. **Global Client State** - Zustand stores:
   - `lib/cart-store.ts` - Shopping cart (persisted to localStorage)
   - `lib/compare-store.ts` - Product comparison

### File Storage (S3)

All file operations use `lib/s3.ts`:
- **Validation:** Max 5MB, JPEG/PNG/WebP/GIF only
- **Optimization:** Sharp for image processing
- **Security:** Validated file types and sizes before upload
- **Bucket:** Configured via `AWS_S3_BUCKET_NAME` env var

```typescript
import { validateFileUpload, uploadToS3, optimizeImage } from '@/lib/s3';

// Validate
const validation = validateFileUpload(fileName, contentType, size);
if (!validation.valid) {
  return NextResponse.json({ error: validation.error }, { status: 400 });
}

// Optimize and upload
const optimized = await optimizeImage(buffer);
const url = await uploadToS3(optimized, fileName, contentType);
```

### Payment Processing (Stripe)

Payment flow managed through `lib/stripe.ts`:
- **Payment Intents** - SCA-ready with 3D Secure support
- **Saved Payment Methods** - Customers can save cards
- **Webhooks** - `/api/webhooks/stripe` for payment confirmation
- **Server-side validation** - ALL prices verified via `lib/order-validation.ts`
- **Test mode** - Use Stripe test cards in development (4242 4242 4242 4242)

**Local webhook testing:**
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

### Tax Calculation

Dynamic tax calculation via `lib/tax.ts`:
- Rates stored in `tax_rates` table
- State-based tax lookup
- Applied at checkout, stored with order

## Testing Architecture

Tests use Vitest + Testing Library, configured in `vitest.config.ts`.

**Test Structure:**
```
__tests__/
├── api/              # API route tests
│   └── helpers/      # Test helpers and mocks
├── components/       # Component tests
└── lib/              # Utility function tests
```

**Test Pattern:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup
  });

  it('should handle success case', async () => {
    // Arrange
    const input = { /* test data */ };

    // Act
    const result = await functionUnderTest(input);

    // Assert
    expect(result).toBeDefined();
  });
});
```

**When to add tests:**
- New API routes → `__tests__/api/`
- New components → `__tests__/components/`
- New utilities → `__tests__/lib/`
- Bug fixes → Add regression test

## Environment Variables

Validated at startup via `lib/env-validation.ts`. Key variables:

**Database:**
- `DATABASE_URL` - PostgreSQL connection string

**Authentication:**
- `BETTER_AUTH_SECRET` - Min 32 chars (customer auth)
- `BETTER_AUTH_URL` - App URL
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - OAuth
- `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET` - OAuth

**Rate Limiting:**
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

**Admin:**
- `ADMIN_IP_WHITELIST` - Comma-separated IPs (e.g., "127.0.0.1,::1")

**Payments:**
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

**File Storage:**
- `AWS_S3_BUCKET_NAME`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

**Email:**
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

## Key Files Reference

**Security & Validation:**
- `lib/validation.ts` - Zod schemas for all inputs
- `lib/rate-limit.ts` - Rate limiting configs
- `lib/security-logger.ts` - Security event logging
- `lib/admin-middleware.ts` - Admin auth enforcement
- `lib/order-validation.ts` - Server-side order validation
- `lib/env-validation.ts` - Environment variable validation

**Core Libraries:**
- `lib/db.ts` - Database connection pool
- `lib/auth.ts` - Better Auth config (customer)
- `lib/admin-auth.ts` - Admin auth system
- `lib/s3.ts` - AWS S3 operations
- `lib/stripe.ts` - Stripe integration
- `lib/email.ts` - Email sending (Resend)

**State Management:**
- `lib/cart-store.ts` - Shopping cart (Zustand)
- `lib/compare-store.ts` - Product comparison (Zustand)

**Configuration:**
- `next.config.ts` - Security headers, image domains, CSP
- `vitest.config.ts` - Test configuration
- `eslint.config.mjs` - Linting rules
- `tsconfig.json` - TypeScript strict mode

## Security Best Practices

1. **Never trust client data** - Validate everything server-side
2. **Always recalculate prices** - Use `lib/order-validation.ts` for orders
3. **Rate limit all public endpoints** - Apply appropriate tier
4. **Log security events** - Use `securityLogger` for auth, admin, suspicious activity
5. **Parameterized queries only** - Use neon template literals, never string concatenation
6. **Admin routes require IP whitelist** - Use `verifyAdminAuth()` on all admin APIs
7. **No sensitive data in logs** - Never log passwords, tokens, credit cards
8. **Error handling** - Wrap async operations in try-catch, return generic errors to client
9. **HTTP status codes** - Use appropriate codes (400, 401, 403, 404, 429, 500)

## Common Anti-Patterns to Avoid

- ❌ Skipping validation on API routes
- ❌ Trusting client-provided prices or totals
- ❌ Creating admin routes without `verifyAdminAuth()`
- ❌ Using `any` type without justification
- ❌ String concatenation in SQL queries
- ❌ Skipping rate limiting on public endpoints
- ❌ Logging sensitive data
- ❌ Committing code without passing lint/test/build
- ❌ Using npm or yarn instead of pnpm
- ❌ Mixing customer and admin authentication systems

## TypeScript Standards

- **Strict mode enabled** - No implicit any, strict null checks
- **Explicit return types** - For public functions
- **Type imports** - Use `import type` for type-only imports
- **Avoid `any`** - Use specific types or generics

## Styling Standards
- **Colors** - Always use brand colors defined in Tailwind
- **Interactive Elements** - Always attach hover:cursor-pointer class to indicate a clickable element

## Documentation

Comprehensive security documentation in:
- `SECURITY_QUICKSTART.md` - Quick setup and patterns
- `SECURITY.md` - Full security guide
- `SECURITY_IMPLEMENTATION_SUMMARY.md` - Implementation details
- `README.md` - General setup and usage
