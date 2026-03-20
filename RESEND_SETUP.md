# Resend Email Configuration Guide

This guide will help you configure Resend for transactional emails in your e-commerce platform.

## Prerequisites

- A Resend account (sign up at [https://resend.com](https://resend.com))
- A custom domain (e.g., `yourdomain.com`)
- Access to your domain's DNS settings

## Step 1: Get Your Resend API Key

1. Log into your Resend account
2. Navigate to **API Keys** in the sidebar
3. Click **Create API Key**
4. Give it a name (e.g., "E-Commerce Platform - Production")
5. Select permissions: **Full Access** (recommended) or **Sending Access**
6. Copy the API key (starts with `re_`)

⚠️ **Important**: Save this key immediately. You won't be able to see it again.

## Step 2: Add Environment Variables

Add these to your `.env.local` file:

```bash
# Resend Configuration
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM=noreply@yourdomain.com
ADMIN_EMAIL=admin@yourdomain.com  # Optional, defaults to EMAIL_FROM
```

### Environment Variable Details

- **RESEND_API_KEY**: Your Resend API key from Step 1
- **EMAIL_FROM**: The email address that will send transactional emails
  - Must use a domain you own (not gmail.com, yahoo.com, etc.)
  - Must be verified in Resend (see Step 3)
- **ADMIN_EMAIL**: Where contact form submissions will be sent
  - Optional: if not set, uses EMAIL_FROM
  - Can be any valid email address

## Step 3: Verify Your Domain in Resend

This is the **most important step**. Resend will not send emails until your domain is verified.

### 3.1 Add Domain to Resend

1. Go to [https://resend.com/domains](https://resend.com/domains)
2. Click **Add Domain**
3. Enter your domain (e.g., `yourdomain.com`)
4. Click **Add**

### 3.2 Add DNS Records

Resend will provide you with DNS records to add. You'll need to add these to your DNS provider:

**SPF Record (TXT)**
```
Type: TXT
Name: @
Value: v=spf1 include:_spf.resend.com ~all
```

**DKIM Record (TXT)**
```
Type: TXT
Name: resend._domainkey
Value: [provided by Resend]
```

**DMARC Record (TXT) - Optional but Recommended**
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:admin@yourdomain.com
```

### 3.3 Common DNS Providers

#### Vercel Domains
1. Go to your domain settings in Vercel
2. Navigate to DNS tab
3. Add the records provided by Resend

#### Cloudflare
1. Log into Cloudflare
2. Select your domain
3. Go to DNS → Records
4. Add each record with "DNS only" (gray cloud)

#### Namecheap
1. Log into Namecheap
2. Manage domain → Advanced DNS
3. Add each record as a new TXT record

#### GoDaddy
1. Log into GoDaddy
2. My Products → DNS
3. Add each record under DNS Management

### 3.4 Verify Domain

1. Wait 5-10 minutes for DNS propagation
2. Return to Resend dashboard
3. Click **Verify** next to your domain
4. If verification fails, wait longer (DNS can take up to 24 hours)

✅ **Success**: Your domain will show a green checkmark when verified

## Step 4: Test Your Configuration

### Option A: Use the Admin Test Endpoint (Recommended)

1. Start your development server:
   ```bash
   pnpm dev
   ```

2. Send a test request:
   ```bash
   curl -X POST http://localhost:3000/api/admin/test-email \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
     -d '{"recipient": "your-email@example.com"}'
   ```

3. Check the response:
   - `success: true` - Everything is working! ✅
   - `success: false` - Check the error details in the response

### Option B: Test via Contact Form

1. Go to `/contact` on your site
2. Fill out and submit the contact form
3. Check both:
   - Your inbox (for auto-reply)
   - Admin inbox (for notification)
4. Check Resend dashboard → Logs to see if emails were sent

### Option C: Test via Resend Dashboard

1. Go to [https://resend.com/emails](https://resend.com/emails)
2. Click **Send Test Email**
3. Use the same `EMAIL_FROM` you configured
4. Send to your email address

## Step 5: Production Deployment

### Vercel Deployment

1. Add environment variables to Vercel:
   ```bash
   vercel env add RESEND_API_KEY
   vercel env add EMAIL_FROM
   vercel env add ADMIN_EMAIL
   ```

2. Or add via Vercel Dashboard:
   - Go to your project settings
   - Navigate to Environment Variables
   - Add each variable for Production, Preview, and Development

3. Redeploy your application

### Other Platforms

Add the same environment variables through your platform's dashboard or CLI.

## Quick Testing Alternative (Development Only)

If you want to test immediately without domain verification:

```bash
EMAIL_FROM=onboarding@resend.dev
```

This is a Resend-provided test domain that works without verification. **Do not use in production.**

## Troubleshooting

### Emails Not Sending

**Check 1: Domain Verification**
- Go to Resend dashboard → Domains
- Ensure your domain has a green checkmark
- If not, verify DNS records are correct

**Check 2: API Key**
- Ensure `RESEND_API_KEY` is set correctly
- Check it starts with `re_`
- Try generating a new API key

**Check 3: Sender Address**
- `EMAIL_FROM` must use your verified domain
- Cannot use gmail.com, yahoo.com, etc.
- Cannot use example.com

**Check 4: Application Logs**
- Check `/logs/security-combined.log` for detailed error messages
- Look for entries with `Failed to send` in the message

**Check 5: Resend Dashboard**
- Go to Resend → Logs
- Check if emails are showing up as failed
- Read the error message for specific issues

### Common Error Messages

**"Domain not verified"**
- Your domain needs to be verified in Resend
- Follow Step 3 above

**"Invalid API key"**
- Check that `RESEND_API_KEY` is correct
- Generate a new key if needed

**"Rate limit exceeded"**
- You've sent too many emails in a short time
- Resend free tier: 100 emails/day
- Upgrade plan or wait 24 hours

**"RESEND_API_KEY environment variable is not set"**
- Add the variable to `.env.local`
- Restart your development server

### Test Endpoint Diagnostics

The admin test endpoint (`/api/admin/test-email`) provides detailed diagnostics:

```json
{
  "success": false,
  "checks": {
    "resendApiKey": {
      "valid": true,
      "message": "RESEND_API_KEY is set (re_1234...)"
    },
    "emailFrom": {
      "valid": false,
      "message": "Domain: example.com (must be verified in Resend dashboard)",
      "value": "noreply@example.com"
    },
    "adminEmail": {
      "valid": true,
      "message": "ADMIN_EMAIL is set",
      "value": "admin@example.com"
    }
  },
  "testEmail": {
    "sent": false,
    "error": "Domain verification required: The sender domain (example.com) needs to be verified..."
  }
}
```

## Email Types Sent by Platform

### 1. Order Confirmation
- **Sent to**: Customer
- **Trigger**: Successful order placement
- **Template**: Order details, items, shipping info

### 2. Contact Form Auto-Reply
- **Sent to**: Customer who submitted form
- **Trigger**: Contact form submission
- **Template**: Thank you message, next steps

### 3. Contact Form Notification
- **Sent to**: Admin (ADMIN_EMAIL)
- **Trigger**: Contact form submission
- **Template**: Customer's message, contact details

### 4. Appointment Confirmation
- **Sent to**: Customer
- **Trigger**: Appointment booking
- **Template**: Appointment details, date/time, notes

## Resend Dashboard Features

### Email Logs
- View all sent emails
- Filter by status (sent, failed, delivered)
- See delivery times and error messages

### Webhooks (Optional)
Configure webhooks to track email events:
- Email delivered
- Email opened
- Email clicked
- Email bounced

### API Keys Management
- Create multiple keys for different environments
- Revoke keys if compromised
- Monitor key usage

## Best Practices

1. **Always use a custom domain**
   - Don't use free email providers
   - Improves deliverability

2. **Set up DMARC**
   - Helps with email authentication
   - Reduces spam complaints

3. **Monitor email logs**
   - Check Resend dashboard regularly
   - Watch for failed emails

4. **Use different API keys**
   - Development: separate key
   - Production: separate key
   - Makes it easier to rotate keys

5. **Test before deploying**
   - Use the test endpoint
   - Send real test emails
   - Verify all email types work

## Support

- **Resend Documentation**: [https://resend.com/docs](https://resend.com/docs)
- **Resend Support**: [https://resend.com/support](https://resend.com/support)
- **Platform Logs**: Check `/logs/security-combined.log` in your app

## Pricing

Resend offers a generous free tier:
- **Free**: 100 emails/day, 3,000 emails/month
- **Pro**: $20/month for 50,000 emails/month
- **Enterprise**: Custom pricing

For most e-commerce sites starting out, the free tier is sufficient for testing and initial launch.

