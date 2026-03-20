# Security Implementation Guide

This document outlines the security measures implemented in this e-commerce application.

## Overview

The application has been hardened with comprehensive security measures including:
- ✅ Email verification for user accounts
- ✅ Rate limiting on all critical API routes
- ✅ Input validation using Zod schemas
- ✅ Server-side order price validation
- ✅ File upload security with size and type validation
- ✅ Database connection limits and query timeouts
- ✅ Comprehensive security event logging
- ✅ Admin IP whitelisting
- ✅ Enhanced authentication security

## Environment Variables

### Required Variables

Create a `.env.local` file with the following variables:

```env
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Better Auth
BETTER_AUTH_SECRET=your-secret-key-min-32-characters-long
BETTER_AUTH_URL=http://localhost:3000

# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_S3_BUCKET_NAME=your-s3-bucket-name

# Upstash Redis (for rate limiting)
UPSTASH_REDIS_REST_URL=https://your-upstash-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-upstash-redis-token

# Admin
ADMIN_SECRET=your-admin-secret-min-32-characters-long
```

### Optional Variables

```env
# Social Authentication
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
APPLE_CLIENT_ID=your-apple-client-id
APPLE_CLIENT_SECRET=your-apple-client-secret

# Email Service
EMAIL_FROM=noreply@yourdomain.com
EMAIL_SERVICE_API_KEY=your-email-service-api-key

# Payment Processor
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret

# Security - Admin IP Whitelist (comma-separated)
# Leave empty to allow all IPs (not recommended for production)
ADMIN_IP_WHITELIST=127.0.0.1,::1

# Environment
NODE_ENV=development
```

## Security Features

### 1. Authentication & Authorization

#### Email Verification
- **Enabled**: Email verification is now required for all new user accounts
- **Configuration**: `lib/auth.ts` - `requireEmailVerification: true`
- **Session Duration**: Reduced from 7 days to 3 days for better security

#### Admin Authentication
- **Separate Auth System**: Admin users have their own authentication separate from customers
- **Account Lockout**: After 5 failed login attempts, account is locked for 30 minutes
- **Session Tracking**: Admin sessions include IP address and user agent tracking
- **IP Whitelisting**: Admin routes can be restricted to specific IP addresses

### 2. Rate Limiting

All API routes are protected with Upstash Redis-based rate limiting:

#### Rate Limit Tiers
- **Critical Routes** (5 req/min): Contact form, admin login, consultations
- **Auth Routes** (5 req/min): Admin authentication endpoints
- **Upload Routes** (10 req/min): File upload URL generation
- **Moderate Routes** (20 req/min): Product queries, order creation
- **Relaxed Routes** (60 req/min): Authenticated user endpoints
- **Admin Routes** (100 req/min): Admin dashboard operations

#### Implementation
```typescript
import { rateLimiters, checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit';

// In your route handler
const rateLimitResult = await checkRateLimit(request, rateLimiters.critical);
if (!rateLimitResult.success) {
  return createRateLimitResponse(rateLimitResult.reset);
}
```

### 3. Input Validation

All API inputs are validated using Zod schemas defined in `lib/validation.ts`:

#### Available Schemas
- `contactFormSchema` - Contact form submissions
- `orderCreateSchema` - Order creation
- `productCreateSchema` - Product creation
- `productUpdateSchema` - Product updates
- `profileUpdateSchema` - Profile updates
- `adminLoginSchema` - Admin login
- `imageUploadSchema` - File uploads

#### Usage Example
```typescript
import { contactFormSchema } from '@/lib/validation';

const validationResult = contactFormSchema.safeParse(body);
if (!validationResult.success) {
  return NextResponse.json({
    error: 'Validation failed',
    details: validationResult.error.errors,
  }, { status: 400 });
}
```

### 4. Order Security

#### Server-Side Price Validation
All orders are validated server-side to prevent price manipulation:

```typescript
import { validateOrder, detectSuspiciousPatterns } from '@/lib/order-validation';

// Validate order with database prices
const validation = await validateOrder(pool, orderItems, clientTotal);

// Check for suspicious patterns
const suspiciousCheck = detectSuspiciousPatterns(orderItems, address, userId);
```

Features:
- **Price Recalculation**: All prices fetched from database
- **Inventory Checking**: Validates stock availability
- **Price Mismatch Detection**: Alerts on client/server price discrepancies
- **Suspicious Pattern Detection**: Flags unusual orders for review
- **Inventory Reservation**: Atomic inventory updates with transactions

### 5. File Upload Security

File uploads are secured with multiple layers of validation:

#### Restrictions
- **Max File Size**: 5MB
- **Allowed Types**: JPEG, PNG, WebP, GIF
- **Max Dimensions**: 4096x4096 pixels
- **Min Dimensions**: 50x50 pixels
- **Filename Sanitization**: Only alphanumeric, dots, dashes

#### Implementation
```typescript
import { validateFileUpload, validateImageBuffer, optimizeImage } from '@/lib/s3';

// Validate before generating upload URL
const validation = validateFileUpload(filename, contentType, size);

// Validate actual image data
const imageValidation = await validateImageBuffer(buffer);

// Optimize large images
const optimized = await optimizeImage(buffer, 2048, 2048);
```

### 6. Database Security

#### Connection Pool Configuration
```typescript
// lib/db.ts
const pool = new Pool({
  max: 20,                        // Max clients in pool
  min: 2,                         // Min clients in pool
  idleTimeoutMillis: 30000,      // Close idle clients after 30s
  connectionTimeoutMillis: 10000, // 10s connection timeout
  statement_timeout: 30000,       // 30s query timeout
});
```

#### Query Security
- ✅ **Parameterized Queries**: All queries use parameter binding
- ✅ **Query Timeouts**: 30-second default timeout on all queries
- ✅ **Connection Limits**: Max 20 concurrent connections
- ✅ **No Dynamic SQL**: No string concatenation in queries

### 7. Security Logging

Comprehensive security event logging with Winston:

#### Logged Events
- Authentication success/failure
- Account lockouts
- Rate limit violations
- Validation failures
- Permission denials
- Order creation (with price validation)
- File uploads
- Admin actions
- Suspicious activity
- IP whitelist violations

#### Usage
```typescript
import { securityLogger } from '@/lib/security-logger';

// Log authentication
securityLogger.logAuthSuccess(userId, username, ip, userAgent);
securityLogger.logAuthFailure(username, ip, reason, userAgent);

// Log order with price validation
securityLogger.logOrderCreated(orderId, userId, clientTotal, serverTotal, ip);

// Log admin actions
securityLogger.logAdminAction(adminId, username, action, targetId, ip, details);
```

#### Log Storage
- **Development**: Console + `logs/security-combined.log`
- **Production**: Console + File + (recommended: external service)

### 8. Admin Security

#### IP Whitelisting
Restrict admin access to specific IP addresses:

```env
ADMIN_IP_WHITELIST=192.168.1.100,10.0.0.50
```

#### Admin Middleware
```typescript
import { verifyAdminAuth, logAdminAction } from '@/lib/admin-middleware';

// In admin route handlers
const authResult = await verifyAdminAuth(request);
if (!authResult.authorized) {
  return authResult.response!;
}
```

#### Session Security
- **Duration**: 8 hours (shorter than customer sessions)
- **IP Tracking**: Sessions include IP address
- **User Agent Tracking**: Device identification
- **Automatic Expiration**: Sessions expire after 8 hours

### 9. Environment Validation

Environment variables are validated at startup:

```typescript
import { validateEnv } from '@/lib/env-validation';

// Call in your app initialization
const env = validateEnv(); // Throws if invalid in production
```

## Security Best Practices

### For Developers

1. **Always use validation schemas** for user input
2. **Never trust client-side data** - always validate server-side
3. **Use rate limiters** on all public endpoints
4. **Log security events** for audit trail
5. **Test with invalid data** to ensure validation works
6. **Keep dependencies updated** - run `pnpm audit` regularly

### For Deployment

1. **Set strong secrets** (min 32 characters)
2. **Configure IP whitelist** for admin routes in production
3. **Enable HTTPS** - set `secure: true` for cookies
4. **Set up monitoring** - integrate with Sentry/LogRocket
5. **Review logs regularly** - check `logs/security-error.log`
6. **Backup database** regularly
7. **Test rate limits** before going live

### For Production

```env
NODE_ENV=production
BETTER_AUTH_URL=https://yourdomain.com
ADMIN_IP_WHITELIST=your-office-ip,your-vpn-ip
```

## Security Checklist

Before deploying to production:

- [ ] All environment variables set and validated
- [ ] Email verification enabled
- [ ] Rate limiting configured with Upstash Redis
- [ ] Admin IP whitelist configured
- [ ] HTTPS enabled (cookies with `secure: true`)
- [ ] Database backups scheduled
- [ ] Security logs monitored
- [ ] `pnpm audit` shows no vulnerabilities
- [ ] All routes have proper authentication
- [ ] File uploads tested with various file types/sizes
- [ ] Order validation tested with price manipulation attempts
- [ ] Rate limits tested to ensure they work
- [ ] Admin lockout tested (5 failed attempts)

## Monitoring & Alerts

### Recommended Integrations

1. **Error Tracking**: Sentry, LogRocket, or Datadog
2. **Log Management**: CloudWatch, Google Cloud Logging
3. **Uptime Monitoring**: UptimeRobot, Pingdom
4. **Security Scanning**: Snyk, Dependabot

### Alerts to Configure

- Multiple failed admin login attempts
- Rate limit violations from single IP
- Price mismatch in orders
- Suspicious order patterns
- File upload failures
- Database connection errors

## Incident Response

If you detect a security issue:

1. **Immediate Actions**:
   - Review `logs/security-error.log`
   - Check admin_sessions table for unauthorized access
   - Verify no price manipulation in recent orders

2. **Investigation**:
   - Filter logs by IP address of attacker
   - Check all actions performed by compromised accounts
   - Review database for unauthorized changes

3. **Mitigation**:
   - Revoke compromised sessions
   - Update IP whitelist if needed
   - Increase rate limits temporarily if under attack
   - Enable additional logging if needed

4. **Recovery**:
   - Reset passwords for affected accounts
   - Notify affected users if data was accessed
   - Update security measures based on lessons learned

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Better Auth Documentation](https://www.better-auth.com/)
- [Upstash Redis Documentation](https://docs.upstash.com/)
- [Zod Documentation](https://zod.dev/)

## Support

For security concerns, contact: security@yourdomain.com










