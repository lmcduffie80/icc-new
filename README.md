# E-Commerce Platform

A secure, modern e-commerce platform built with Next.js, featuring comprehensive security measures, authentication, admin panel, and payment processing.

## 🔐 Security Features

This application implements enterprise-grade security:

- ✅ **Email Verification** - Required for all new users
- ✅ **Rate Limiting** - Upstash Redis-based protection on all routes
- ✅ **Input Validation** - Zod schemas for all API inputs
- ✅ **Server-Side Order Validation** - Prevents price manipulation
- ✅ **File Upload Security** - Size limits, type validation, image optimization
- ✅ **Database Hardening** - Connection limits, query timeouts
- ✅ **Security Logging** - Comprehensive audit trail
- ✅ **Admin IP Whitelisting** - Restrict admin access by IP
- ✅ **Account Lockout** - Protection against brute force attacks

**📚 Security Documentation:**
- [Security Quick Start](SECURITY_QUICKSTART.md) - Get started in 5 minutes
- [Full Security Guide](SECURITY.md) - Comprehensive documentation
- [Implementation Summary](SECURITY_IMPLEMENTATION_SUMMARY.md) - What was implemented

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- PostgreSQL database
- AWS S3 bucket for file storage
- Upstash Redis account (free tier available)
- Stripe account (for payment processing)

### Installation

1. **Clone and install dependencies:**

```bash
pnpm install
```

2. **Set up environment variables:**

Create `.env.local` with required variables (see [SECURITY_QUICKSTART.md](SECURITY_QUICKSTART.md)):

```env
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=your-secret-min-32-chars
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
# ... see SECURITY_QUICKSTART.md for full list
```

**Important: Database Connection Configuration**

For Neon serverless Postgres, use the **pooled connection string** for optimal performance with Next.js:

- ✅ **Recommended (Pooled)**: `postgresql://user:pass@host-pooler.region.aws.neon.tech/dbname`
- ⚠️ **Direct Connection**: `postgresql://user:pass@host.region.aws.neon.tech/dbname`

The pooled connection (notice `-pooler` in hostname) provides:
- Better connection stability during Next.js hot reloads
- Reduced connection termination errors
- Optimized for serverless/edge deployments

You can find both connection strings in your Neon dashboard under "Connection Details". The application will automatically detect and optimize settings based on your connection type.

**Logo Configuration (Optional)**

To use your own logo in PDF documents (invoices, quotes, BOL):

1. Upload your logo to S3:
```bash
pnpm tsx scripts/upload-logo.ts
```

2. Add the output URL to `.env.local`:
```env
LOGO_URL=https://your-bucket.s3.region.amazonaws.com/logos/company-logo.png
```

If not set, documents will use the default Odoo logo URL.

3. **Run database migrations:**

```bash
pnpm run db:migrate
pnpm run db:migrate:orders
```

4. **Set up Stripe webhook (for local development):**

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Copy the webhook signing secret to STRIPE_WEBHOOK_SECRET in .env.local
```

5. **Start the development server:**

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## 🏗️ Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Authentication**: Better Auth with email verification
- **Database**: PostgreSQL with Neon serverless
- **File Storage**: AWS S3
- **Rate Limiting**: Upstash Redis
- **Validation**: Zod
- **Logging**: Winston
- **Image Processing**: Sharp
- **UI**: Tailwind CSS
- **Testing**: Vitest + Testing Library

## 📁 Project Structure

```
├── app/                      # Next.js app router
│   ├── (main)/              # Public pages
│   ├── admin/               # Admin dashboard
│   └── api/                 # API routes
├── components/              # React components
├── lib/                     # Core libraries
│   ├── validation.ts        # Zod schemas
│   ├── rate-limit.ts        # Rate limiting
│   ├── security-logger.ts   # Security logging
│   ├── order-validation.ts  # Order security
│   └── ...
├── migrations/              # Database migrations
└── __tests__/              # Test files
```

## 🧪 Testing

```bash
# Run tests
pnpm test

# Run tests with coverage
pnpm run test:coverage

# Watch mode
pnpm run test:watch
```

## 📊 Database

```bash
# Run Better Auth migrations
pnpm run db:migrate

# Run custom migrations (orders, products, etc.)
pnpm run db:migrate:orders

# Generate Better Auth types
pnpm run db:generate
```

## 💳 Payment Processing

This platform uses Stripe for secure payment processing:

- **Stripe Elements** - Embedded payment forms for seamless UX
- **Payment Intents** - SCA-ready payment flow with 3D Secure support
- **Saved Payment Methods** - Customers can save cards for faster checkout
- **Webhooks** - Reliable payment confirmation and reconciliation
- **Server-side Validation** - All prices verified server-side to prevent manipulation

### Testing Payments

Use Stripe test cards in development:

```bash
# Successful payment
4242 4242 4242 4242

# Declined payment
4000 0000 0000 0002

# Requires authentication (3D Secure)
4000 0025 0000 3155

# Use any future expiry date and any 3-digit CVC
```

### Stripe Webhook Setup (Production)

1. Go to Stripe Dashboard > Developers > Webhooks
2. Add endpoint: `https://yourdomain.com/api/webhooks/stripe`
3. Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
4. Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET` environment variable

## 🛡️ Security Testing

Test the security features:

```bash
# Test rate limiting (should return 429 on 6th request)
for i in {1..6}; do 
  curl -X POST http://localhost:3000/api/contact \
    -H "Content-Type: application/json" \
    -d '{"name":"Test","email":"test@test.com","subject":"Test","message":"Test"}'
done

# View security logs
tail -f logs/security-combined.log
```

## 🚀 Deployment

### Prerequisites

1. Set all environment variables in production
2. Configure admin IP whitelist
3. Set up Upstash Redis
4. Configure email service for verification
5. Set up monitoring and alerting

### Deploy to Vercel

```bash
# Install Vercel CLI
pnpm add -g vercel

# Deploy
vercel --prod
```

See [SECURITY.md](SECURITY.md) for complete deployment checklist.

## 📚 Documentation

- **[SECURITY_QUICKSTART.md](SECURITY_QUICKSTART.md)** - Quick setup guide
- **[SECURITY.md](SECURITY.md)** - Comprehensive security documentation
- **[SECURITY_IMPLEMENTATION_SUMMARY.md](SECURITY_IMPLEMENTATION_SUMMARY.md)** - Implementation details
- **[TEST_COVERAGE_SUMMARY.md](TEST_COVERAGE_SUMMARY.md)** - Test coverage report

## 🤝 Contributing

1. Read security documentation
2. Follow existing patterns for validation and rate limiting
3. Add tests for new features
4. Run `pnpm audit` to check for vulnerabilities
5. Update documentation as needed

## 📝 License

This project is private and proprietary.

## 🆘 Support

For security issues, see [SECURITY.md](SECURITY.md) or contact the security team.
