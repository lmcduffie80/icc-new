# Fixing S3 403 Forbidden Errors

## Problem
You're seeing `403 Forbidden` errors when trying to access product labels/images through the `/api/images/proxy` route. This is an AWS S3 permissions issue.

## Root Cause
The AWS credentials in your `.env.local` file don't have the necessary permissions to read files from your S3 bucket.

## Solution

### Step 1: Check Your AWS Credentials

Verify your `.env.local` has the correct AWS credentials:

```env
AWS_REGION=us-east-1  # or your bucket's region
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_S3_BUCKET_NAME=your-bucket-name
```

### Step 2: Create/Update IAM Policy

Your AWS IAM user or role needs the `s3:GetObject` permission. Create or update the IAM policy:

**Option A: IAM User Policy (Recommended for Development)**

1. Go to AWS IAM Console → Users → Select your user
2. Click "Add permissions" → "Create inline policy"
3. Use this JSON policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME"
    }
  ]
}
```

Replace `YOUR-BUCKET-NAME` with your actual bucket name.

**Option B: Bucket Policy (Alternative)**

1. Go to S3 Console → Your bucket → Permissions → Bucket policy
2. Add this policy (adjust Principal to your IAM user ARN):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowReadAccess",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR-ACCOUNT-ID:user/YOUR-IAM-USER"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
    }
  ]
}
```

### Step 3: Verify Permissions

After updating permissions, test by:

1. Restart your dev server
2. Try accessing a product label in checkout
3. Check server logs for S3 access messages

### Step 4: Check Server Logs

Look for these log messages in your terminal:

- ✅ Success: `🔍 S3: Successfully fetched file "..."`
- ❌ Error: `🔍 S3: Access denied to file "..."`

## Quick Test

You can test S3 access directly using AWS CLI:

```bash
aws s3 ls s3://YOUR-BUCKET-NAME/supplier-uploads/ --profile your-profile
```

If this works, your credentials are correct. If not, check your AWS credentials configuration.

## Common Issues

1. **Wrong Region**: Make sure `AWS_REGION` matches your bucket's region
2. **Expired Credentials**: Regenerate access keys if they're old
3. **Bucket Name Mismatch**: Verify `AWS_S3_BUCKET_NAME` is correct
4. **IAM User vs Role**: Make sure you're using the right credentials for the IAM user/role

## Note

The label link will still appear in checkout even if the proxy fails. Users can try clicking it, and if it fails, they'll see a 403 error. Once S3 permissions are fixed, the links will work correctly.

