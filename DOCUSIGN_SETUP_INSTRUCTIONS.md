# DocuSign Integration - Setup Instructions

## ✅ What Has Been Implemented

The DocuSign e-signature integration has been fully coded and is ready for testing. Here's what was done:

### 1. **Package Installation**
- Added `docusign-esign` to package.json
- **Action Required**: Run `pnpm install` to install dependencies

### 2. **Environment Variables**
- Added DocuSign environment variables to `lib/env-validation.ts`
- **Action Required**: Add these to your `.env.local` file (see below)

### 3. **Database Migration**
- Created `migrations/039_add_docusign_fields.sql`
- Adds DocuSign envelope tracking fields to `supplier_contracts` table
- **Action Required**: Run `pnpm run db:migrate:orders` after installing dependencies

### 4. **Core Files Created**
- ✅ `lib/docusign.ts` - DocuSign client with JWT authentication
- ✅ `app/api/admin/contracts/[id]/sign/route.ts` - Updated for embedded signing
- ✅ `app/api/docusign/webhook/route.ts` - Webhook handler for status updates
- ✅ `components/admin/contract-detail-modal.tsx` - Updated with embedded signing iFrame

## 🔧 Required Setup Steps

### Step 1: Set Up DocuSign Account

1. **Go to DocuSign**: https://www.docusign.com/
2. **Create/Login** to your production account
3. **Navigate to**: Settings → Integrations → Apps and Keys

### Step 2: Create Integration Key

1. Click **"Add App and Integration Key"**
2. **App Name**: "ICC Contract Management"
3. **Note the Integration Key** (Client ID) - you'll need this

### Step 3: Generate RSA Key Pair

Run these commands in your terminal:

```bash
# Generate private key
openssl genrsa -out private.key 2048

# Generate public key from private key
openssl rsa -in private.key -outform PEM -pubout -out public.key
```

1. Copy contents of `public.key`
2. In DocuSign, click **"Add RSA Key"** and paste the public key
3. **Keep `private.key` secure** - this is your `DOCUSIGN_PRIVATE_KEY`

### Step 4: Configure Redirect URI

In DocuSign Integration Key settings:
- Add Redirect URI: `https://yourdomain.com/api/docusign/callback`
- For local development: `http://localhost:3000/api/docusign/callback`

### Step 5: Get Account ID & User ID

1. In DocuSign Settings → API and Keys
2. Note your **Account ID** (UUID format: `12345678-abcd-1234-abcd-1234567890ab`)
3. Note your **User ID** (also called API Username - UUID format)

### Step 6: Grant Consent

Visit this URL (replace `{INTEGRATION_KEY}` with your actual key):

```
https://account.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id={INTEGRATION_KEY}&redirect_uri=http://localhost:3000/api/docusign/callback
```

Click **"Allow Access"** to grant consent to your application.

### Step 7: Add Environment Variables

Add these to your `.env.local` file:

```env
# DocuSign Configuration
DOCUSIGN_INTEGRATION_KEY=your_integration_key_here
DOCUSIGN_USER_ID=your_user_guid_here
DOCUSIGN_ACCOUNT_ID=your_account_id_here
DOCUSIGN_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
(paste entire private key contents here - keep the quotes)
...
-----END RSA PRIVATE KEY-----"
DOCUSIGN_BASE_PATH=https://na3.docusign.net/restapi
```

**Important**: 
- Replace `\\n` with actual newlines in the private key
- Keep the quotes around DOCUSIGN_PRIVATE_KEY
- The base path may be different for your region (na3, na2, eu, etc.)

### Step 8: Install Dependencies & Run Migration

```bash
# Install dependencies (including docusign-esign)
pnpm install

# Run database migration
pnpm run db:migrate:orders
```

### Step 9: Configure DocuSign Webhooks

1. In DocuSign Settings → **Connect**
2. Click **"Add Configuration"**
3. **Configuration Settings**:
   - Name: "ICC Contract Webhooks"
   - URL: `https://yourdomain.com/api/docusign/webhook`
   - For testing: `http://localhost:3000/api/docusign/webhook` (use ngrok for local testing)
4. **Select Events**:
   - ✅ Envelope Sent
   - ✅ Envelope Delivered
   - ✅ Recipient Signed
   - ✅ Envelope Completed
   - ✅ Envelope Voided
   - ✅ Envelope Declined
5. Enable for **all envelopes**
6. Click **Save**

**For Local Testing**: Use ngrok to expose your local webhook:
```bash
ngrok http 3000
# Use the ngrok URL in DocuSign webhook configuration
```

### Step 10: Update PDF Contract Templates

Your contract PDF templates need signature anchor text:

**Add these invisible markers to your PDF where signatures should appear:**
- Admin signature: `/admin_sig/`
- Admin date: `/admin_date/`
- Supplier signature: `/supplier_sig/`
- Supplier date: `/supplier_date/`

**Pro Tip**: You can make these invisible by:
- Using white text on white background
- Placing them in the margin areas
- Using very small font size

## 📋 How It Works

### Signing Workflow

1. **Admin Initiates**:
   - Admin clicks "Sign with DocuSign" in the contract detail modal
   - System uploads PDF to DocuSign
   - Creates envelope with both admin and supplier as signers
   - Opens embedded signing iFrame for admin

2. **Admin Signs**:
   - Admin completes signature in embedded iFrame
   - DocuSign webhook updates database (`admin_signed_at`)
   - Contract status → `pending_supplier_signature`

3. **Supplier Receives Email**:
   - DocuSign automatically sends email to supplier
   - Supplier clicks "Review and Sign" in email
   - Opens DocuSign signing page (not embedded - standard DocuSign experience)

4. **Supplier Signs**:
   - Supplier completes signature on DocuSign
   - DocuSign webhook updates database (`supplier_signed_at`)
   - Contract status → `active`

5. **Both Parties Have Copy**:
   - Completed, legally-binding contract
   - Full audit trail in DocuSign
   - PDF with signatures available for download

## 🧪 Testing Checklist

Once setup is complete, test the following:

- [ ] **Install & Migration**: Dependencies installed, migration run successfully
- [ ] **Environment Variables**: All DocuSign env vars configured correctly
- [ ] **Admin Opens Signing**: Click "Sign with DocuSign" opens iFrame
- [ ] **Admin Signs**: Complete signature in iFrame updates database
- [ ] **Supplier Email**: Supplier receives DocuSign email
- [ ] **Supplier Opens**: Email link opens DocuSign signing page
- [ ] **Supplier Signs**: Signature completes and activates contract
- [ ] **Webhook Updates**: Database updates in real-time via webhooks
- [ ] **Contract Status**: Status progresses correctly through workflow
- [ ] **PDF Download**: Signed PDF can be downloaded

## 🔍 Troubleshooting

### "DocuSign is not configured" error
- Check all environment variables are set correctly in `.env.local`
- Verify private key format (newlines, no escaping)
- Ensure you've granted consent (Step 6)

### Webhook not updating database
- Verify webhook URL is accessible (use ngrok for local testing)
- Check webhook configuration in DocuSign Connect
- Review `/api/docusign/webhook` logs for errors

### Authentication failed
- Verify Integration Key, User ID, and Account ID are correct
- Ensure RSA keys match (public key in DocuSign, private key in env)
- Check if consent was granted
- Try regenerating RSA keys

### Signature anchors not found
- Verify PDF contains anchor text (`/admin_sig/`, etc.)
- Check anchor text is exactly as specified (case-sensitive)
- Ensure PDF is not image-based (must be text PDF)

## 📚 Additional Resources

- **DocuSign Developer Center**: https://developers.docusign.com/
- **JWT Authentication Guide**: https://developers.docusign.com/platform/auth/jwt/
- **Webhook Events**: https://developers.docusign.com/platform/webhooks/connect/
- **DocuSign API Reference**: https://developers.docusign.com/docs/esign-rest-api/reference/

## 🎉 Benefits

- ✅ **Legally Binding**: DocuSign signatures are legally recognized worldwide
- ✅ **Audit Trail**: Complete record of who signed when
- ✅ **Professional**: Industry-standard e-signature solution
- ✅ **Embedded Admin UX**: Admin never leaves your application
- ✅ **Simple Supplier UX**: Familiar DocuSign email experience
- ✅ **Automated**: DocuSign handles reminders and notifications
- ✅ **Real-time Updates**: Webhooks keep your database synchronized

## 📝 Manual Steps Remaining

Three tasks require manual action:

1. **DocuSign Account Setup** - Complete Steps 1-7 above
2. **PDF Template Updates** - Add signature anchor text to your PDFs
3. **Testing** - Test the complete workflow once setup is done

---

**Questions?** Review the plan file or check the troubleshooting section above.
