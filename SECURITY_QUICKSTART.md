# Security Implementation Quick Start Guide

## 🚀 Getting Started

This guide will help you quickly set up and test the new security features.

---

## 1. Install Dependencies

The security dependencies have already been installed. To verify:

```bash
pnpm list zod @upstash/ratelimit @upstash/redis sharp winston
```

---

## 2. Set Up Environment Variables

### Required Setup

Create or update your `.env.local` file with these **required** variables:

```env
# Database (already configured)
DATABASE_URL=your-existing-database-url

# Better Auth (already configured)
BETTER_AUTH_SECRET=your-existing-secret
BETTER_AUTH_URL=http://localhost:3000

# AWS S3 (already configured)
AWS_REGION=your-region
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_S3_BUCKET_NAME=your-bucket

# Admin (already configured)
ADMIN_SECRET=your-existing-admin-secret

# NEW: Upstash Redis for Rate Limiting
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# OPTIONAL: Logo URL for PDFs (invoices, quotes, BOL)
# Upload your logo: pnpm tsx scripts/upload-logo.ts
# LOGO_URL=https://your-bucket.s3.region.amazonaws.com/logos/company-logo.png
```

### Get Upstash Redis Credentials

1. Go to [https://console.upstash.com/](https://console.upstash.com/)
2. Create a free account
3. Create a new Redis database
4. Copy the REST URL and token
5. Add to `.env.local`

### Optional: Admin IP Whitelist

For development, you can skip this or set to localhost:

```env
# Optional: Restrict admin access to specific IPs
ADMIN_IP_WHITELIST=127.0.0.1,::1
```

For production, set your office/VPN IPs:

```env
ADMIN_IP_WHITELIST=203.0.113.0,198.51.100.0
```

---

## 3. Test the Security Features

### Test 1: Email Verification

```bash
# Start the dev server
pnpm run dev

# Try to sign up a new user
# You should now be required to verify email before accessing the site
```

### Test 2: Rate Limiting

```bash
# Test contact form rate limit (5 requests/min)
# Make 6 rapid requests to /api/contact
# The 6th should return 429 Too Many Requests

curl -X POST http://localhost:3000/api/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.com","subject":"Test","message":"Testing rate limit"}'
```

### Test 3: Order Price Validation

```bash
# Try to create an order with manipulated prices
# The server will recalculate and reject if prices don't match

curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "items": [{"id":"product-id","quantity":1,"price":1.00,"name":"Product"}],
    "shippingAddress": {...},
    "total": 1.00
  }'
```

### Test 4: File Upload Validation

```bash
# Try to upload a file over 5MB or wrong type
# Should be rejected with validation error

curl -X POST http://localhost:3000/api/admin/products/upload \
  -H "Content-Type: application/json" \
  -d '{"fileName":"test.txt","contentType":"text/plain","size":1000}'
```

### Test 5: Admin IP Whitelist

```bash
# If you've set ADMIN_IP_WHITELIST, try to access admin from different IP
# Should return 403 Forbidden
```

---

## 4. View Security Logs

### Development Logs

Security logs are written to the console and files:

```bash
# View all security logs
tail -f logs/security-combined.log

# View only errors
tail -f logs/security-error.log
```

### Log Directory Structure

```
logs/
├── security-combined.log   # All security events
└── security-error.log       # Errors and critical events
```

### Create Logs Directory

```bash
mkdir -p logs
```

---

## 5. Common Issues & Solutions

### Issue: Rate limiting not working

**Symptom**: No 429 errors even after many requests

**Solution**: 
1. Check Upstash Redis credentials are correct
2. Verify Redis is accessible: `curl -X GET $UPSTASH_REDIS_REST_URL`
3. Check console for rate limit errors

### Issue: Email verification not working

**Symptom**: Users can access site without verifying email

**Solution**:
1. Check `lib/auth.ts` - should have `requireEmailVerification: true`
2. Configure email service (SendGrid, AWS SES, etc.)
3. Add email service credentials to `.env.local`

### Issue: Order validation failing

**Symptom**: All orders rejected even with correct prices

**Solution**:
1. Check product prices in database match order prices
2. Verify products exist and are active
3. Check security logs for details

### Issue: Admin can't login

**Symptom**: 403 error when accessing admin

**Solution**:
1. Check `ADMIN_IP_WHITELIST` includes your IP
2. Remove whitelist for development: `ADMIN_IP_WHITELIST=`
3. Check your IP: `curl https://api.ipify.org`

### Issue: File uploads failing

**Symptom**: All uploads rejected

**Solution**:
1. Check file size is under 5MB
2. Verify file type is JPEG, PNG, WebP, or GIF
3. Check AWS S3 credentials are correct

---

## 6. Integration with Existing Code

### Using Validation in New Routes

```typescript
import { contactFormSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  // Validate with Zod
  const result = contactFormSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: result.error.errors },
      { status: 400 }
    );
  }
  
  // Use validated data
  const data = result.data;
  // ...
}
```

### Adding Rate Limiting to New Routes

```typescript
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  
  // Check rate limit
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }
  
  // Continue with route logic
  // ...
}
```

### Logging Security Events

```typescript
import { securityLogger } from '@/lib/security-logger';

// Log authentication
securityLogger.logAuthSuccess(userId, username, ip, userAgent);

// Log admin action
securityLogger.logAdminAction(adminId, username, 'delete_product', productId, ip);

// Log suspicious activity
securityLogger.logSuspiciousActivity('unusual_order', ip, { details }, userId);
```

### Protecting Admin Routes

```typescript
import { verifyAdminAuth } from '@/lib/admin-middleware';

export async function POST(request: NextRequest) {
  // Verify admin auth with IP whitelist and rate limiting
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }
  
  // Admin is authenticated and authorized
  const session = authResult.session;
  // ...
}
```

---

## 7. Monitoring in Production

### Upstash Dashboard

Monitor rate limiting at: https://console.upstash.com/

- View analytics
- Check rate limit hits
- Monitor Redis performance

### Security Logs

In production, integrate logs with:
- **CloudWatch** (AWS)
- **Google Cloud Logging**
- **Datadog**
- **Sentry**

### Alerts to Set Up

1. **High rate limit violations** - Possible DDoS
2. **Multiple failed admin logins** - Brute force attack
3. **Price mismatch in orders** - Price manipulation attempt
4. **Unusual file uploads** - Possible malware
5. **IP whitelist violations** - Unauthorized admin access

---

## 8. Development vs Production

### Development Mode
- Rate limiting is relaxed
- Email verification may not work (needs email service)
- IP whitelist warnings only
- Logs to console + files

### Production Mode
- Strict rate limiting
- Email verification enforced
- IP whitelist strictly enforced
- Logs to external service recommended

### Switching to Production

```env
NODE_ENV=production
BETTER_AUTH_URL=https://yourdomain.com
ADMIN_IP_WHITELIST=your-office-ip
```

---

## 9. Testing Checklist

Before deploying to production:

- [ ] Upstash Redis configured and tested
- [ ] Rate limiting tested on all critical routes
- [ ] Email verification working
- [ ] Order validation tested with price manipulation
- [ ] File upload limits tested
- [ ] Admin IP whitelist configured and tested
- [ ] Security logs being written
- [ ] Environment variables validated
- [ ] All tests passing: `pnpm test`
- [ ] No vulnerabilities: `pnpm audit`

---

## 10. Next Steps

1. **Set up Upstash Redis** (5 minutes)
2. **Test rate limiting** (5 minutes)
3. **Configure email service** for verification (15 minutes)
4. **Set up monitoring** (30 minutes)
5. **Review security logs** (10 minutes)

---

## 📚 Additional Resources

- **Full Documentation**: See `SECURITY.md`
- **Implementation Details**: See `SECURITY_IMPLEMENTATION_SUMMARY.md`
- **Upstash Docs**: https://docs.upstash.com/
- **Zod Docs**: https://zod.dev/
- **Winston Docs**: https://github.com/winstonjs/winston

---

## 🆘 Need Help?

Common commands:

```bash
# Check if security packages are installed
pnpm list zod @upstash/ratelimit @upstash/redis sharp winston

# View recent security logs
tail -20 logs/security-combined.log

# Check your IP address
curl https://api.ipify.org

# Test rate limiting locally
for i in {1..6}; do curl -X POST http://localhost:3000/api/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.com","subject":"Test","message":"Test"}'; done

# Validate environment variables (in Node REPL)
node -e "require('./lib/env-validation').validateEnv()"
```

---

**Quick Start Complete!** 🎉

You're now ready to use the enhanced security features. Start with setting up Upstash Redis, then test each feature to ensure everything works as expected.










