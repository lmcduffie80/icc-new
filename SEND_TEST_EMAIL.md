# Send Test Email Instructions

Once your server is running, you can send a test email using the existing test email endpoint:

## Option 1: Use Admin Test Email Endpoint (Recommended)

The endpoint `/api/admin/test-email` is already available. To use it:

1. Make sure you're logged in as an admin
2. Open your browser's developer console
3. Run this JavaScript:

```javascript
fetch('/api/admin/test-email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    recipient: 'your-email@example.com'  // Replace with your email
  })
})
.then(res => res.json())
.then(data => console.log('Test email result:', data))
.catch(err => console.error('Error:', err));
```

Replace `your-email@example.com` with the email address where you want to receive the test email.

## Option 2: Use cURL (Terminal)

```bash
curl -X POST http://localhost:3000/api/admin/test-email \
  -H "Content-Type: application/json" \
  -H "Cookie: admin-session=YOUR_SESSION_COOKIE" \
  -d '{"recipient": "your-email@example.com"}'
```

## What the Test Email Does

- Sends a simple HTML email with no attachments
- Tests basic Resend API connectivity
- Returns a messageId if successful
- Shows configuration diagnostics

## Expected Response

If successful:
```json
{
  "success": true,
  "checks": {
    "resendApiKey": { "valid": true, "message": "..." },
    "emailFrom": { "valid": true, "message": "..." },
    "adminEmail": { "valid": true, "message": "..." }
  },
  "testEmail": {
    "sent": true,
    "messageId": "xxxx-xxxx-xxxx"
  }
}
```

If it fails, you'll see detailed error messages explaining what's wrong.

