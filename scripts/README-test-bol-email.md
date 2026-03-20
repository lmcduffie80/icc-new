# Testing BOL Email Sending

This guide explains how to test the BOL email sending functionality to ensure PDFs can be sent to carriers.

## Quick Test

Run the test script with your email address:

```bash
dotenv -e .env.local -- pnpm tsx scripts/test-bol-email-send.ts your-email@example.com
```

This will:
1. ✅ Test Resend API connectivity
2. ✅ Validate all configurations (Resend, PDFShift, S3)
3. ✅ Generate a test PDF using PDFShift
4. ✅ Send a test email with PDF attachment to your email address

## What Gets Tested

### 1. Resend API Connectivity
- Tests if `api.resend.com` is reachable
- Validates DNS resolution and network connectivity

### 2. Configuration Validation
- **RESEND_API_KEY**: Must be set and start with `re_`
- **EMAIL_FROM**: Must be set (should use verified domain)
- **PDFSHIFT_API_KEY**: Required for BOL PDF generation
- **AWS Credentials**: Required for SDS document fetching (optional for basic test)

### 3. PDF Generation
- Tests PDFShift API with a sample HTML
- Validates the generated PDF is valid (starts with `%PDF`)
- Confirms PDF can be created for email attachments

### 4. Email Sending
- Sends actual email with PDF attachment
- Validates email delivery
- Returns message ID if successful

## Expected Output

If everything is configured correctly, you should see:

```
✅ Resend API is reachable
✅ RESEND_API_KEY is set
✅ EMAIL_FROM is set
✅ PDFSHIFT_API_KEY is set
✅ PDF generated successfully
✅ Email sent successfully!
Message ID: re_xxxxx

📧 Check your inbox at: your-email@example.com
```

## Troubleshooting

### "RESEND_API_KEY is not set"
- Add `RESEND_API_KEY=re_...` to your `.env.local` file
- Make sure you're using `dotenv -e .env.local` when running the script

### "Cannot reach Resend API"
- Check your internet connection
- Verify DNS resolution: `nslookup api.resend.com`
- Check firewall/proxy settings

### "PDF generation failed"
- Verify `PDFSHIFT_API_KEY` is set correctly
- Check PDFShift account status at https://pdfshift.io
- Ensure you haven't exceeded PDFShift rate limits

### "Email sending failed: Domain not verified"
- Verify your sender domain in Resend dashboard
- Visit: https://resend.com/domains
- Ensure `EMAIL_FROM` uses a verified domain

### "Email sending failed: Unable to fetch data"
- This is a network connectivity issue
- Check Resend service status: https://status.resend.com
- Try again in a few minutes (may be temporary)

## Testing in Production

Once the test passes, you can send real BOL emails:

1. Go to Admin Panel → Orders
2. Open an order
3. Click "Send BOL Email" button
4. Select:
   - Include BOL (Bill of Lading PDF)
   - Include SDS (Safety Data Sheets) - select which ones
5. Enter carrier email address(es)
6. Click "Send Email"

The system will:
- Generate BOL PDF using PDFShift
- Fetch SDS documents from S3
- Compress PDFs if needed
- Send email with all attachments
- Retry automatically on network errors (up to 3 times)

## Size Limits

- **Resend Attachment Limit**: 25 MB total
- **Automatic Handling**: If attachments exceed 25 MB, system automatically uses S3 download links instead
- **PDF Compression**: Large PDFs are automatically compressed before sending

## Success Indicators

✅ Email appears in Resend dashboard logs
✅ Carrier receives email with PDF attachments
✅ All selected documents are attached
✅ Email subject includes order number

