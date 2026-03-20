# Fix: Product Images Not Loading

## ✅ Diagnosis Complete

**Root Cause:** AWS credentials are missing from `.env.local`

The diagnostic script confirmed that all 4 required AWS environment variables are not set:
- ❌ `AWS_S3_BUCKET_NAME`
- ❌ `AWS_ACCESS_KEY_ID`
- ❌ `AWS_SECRET_ACCESS_KEY`
- ❌ `AWS_REGION`

## 🔧 How to Fix

### Step 1: Add AWS Credentials to `.env.local`

Open your `.env.local` file and add these variables:

```bash
# AWS S3 Configuration for Product Images
AWS_S3_BUCKET_NAME=your-bucket-name
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=us-east-1
```

**Replace with your actual values:**
- `your-bucket-name` - Your S3 bucket name
- `AKIA...` - Your AWS Access Key ID
- `your-secret-access-key` - Your AWS Secret Access Key
- `us-east-1` - Your AWS region (or keep as is if using us-east-1)

### Step 2: Restart Development Server

After adding the credentials, restart your dev server:

```bash
# Stop current server (Ctrl+C)
# Then restart:
pnpm dev
```

### Step 3: Verify IAM Permissions

Ensure your IAM user has the following permission policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```

Replace `your-bucket-name` with your actual bucket name.

### Step 4: Test the Fix

1. Start the dev server: `pnpm dev`
2. Navigate to the admin products page: `http://localhost:3000/admin/products`
3. Check if product images are now loading
4. If images still don't load, check browser console for errors

## 🔍 Re-run Diagnostic

To verify the fix, run the diagnostic script again:

```bash
pnpm diagnose:images
```

This should now show all AWS credentials as configured (✅).

## 🚨 If Images Still Don't Load

If images still aren't loading after adding credentials:

1. **Check browser console** (F12 → Console tab):
   - Look for 403 errors → IAM permissions issue
   - Look for 404 errors → Incorrect bucket name or file paths
   - Look for 500 errors → Check server logs

2. **Test proxy endpoint directly**:
   - Find a product image URL from the database
   - Visit: `http://localhost:3000/api/images/proxy?url=<encoded-url>`
   - Should return the image or a JSON error with details

3. **Verify S3 bucket access**:
   - Ensure bucket exists in the specified region
   - Verify IAM user has `s3:GetObject` permission
   - Test with AWS CLI: `aws s3 ls s3://your-bucket-name`

## 📝 Architecture Overview

**How Image Loading Works:**

```
Database → Product image URL (S3 URL)
  ↓
products-table.tsx → Detects S3 URL
  ↓
Next.js Image component → /api/images/proxy?url=<s3-url>
  ↓
API Route → Fetches from S3 using AWS SDK
  ↓
Returns image to browser
```

The proxy is necessary because:
- S3 bucket is private (not publicly accessible)
- Server-side AWS credentials authenticate the request
- Next.js Image component can't access private S3 directly

## 🎯 Files Involved

- `app/api/images/proxy/route.ts` - Image proxy endpoint
- `app/admin/(dashboard)/products/products-table.tsx` - Image rendering
- `lib/s3.ts` - S3 operations and helpers
- `.env.local` - AWS credentials (add here)

## ✅ Success Criteria

You'll know it's fixed when:
- ✅ Diagnostic script shows all AWS vars configured
- ✅ Dev server starts without errors
- ✅ Product images display in admin products list
- ✅ No 403/500 errors in browser console
- ✅ Proxy endpoint returns images successfully
