# Resend Domain Verification - Step-by-Step Guide

## Current Status

✅ **Environment Configuration**: Complete
- RESEND_API_KEY: Set and valid
- EMAIL_FROM: `noreply@innovativecropcare.com`

⚠️ **Domain Verification**: Required
- Domain: `innovativecropcare.com`
- Status: Not verified (causing "Unable to fetch data" error)

---

## Step 1: Add Domain to Resend Dashboard

### 1.1 Access Resend Domains Page

Open your browser and go to:
```
https://resend.com/domains
```

### 1.2 Add Your Domain

1. Click the **"Add Domain"** button (usually in top-right)
2. Enter: `innovativecropcare.com`
3. Click **"Add"** or **"Continue"**

### 1.3 View DNS Records

Resend will immediately show you the DNS records you need to add. Keep this page open!

---

## Step 2: Copy DNS Records from Resend

Resend will provide 2-3 TXT records. Here's what to look for:

### Record 1: SPF (Sender Policy Framework)

```
Type: TXT
Name: @ (or leave blank, or innovativecropcare.com)
Value: v=spf1 include:_spf.resend.com ~all
TTL: 3600 (or Auto)
```

### Record 2: DKIM (DomainKeys Identified Mail)

```
Type: TXT
Name: resend._domainkey
Value: [A long string starting with "p=MII..." - provided by Resend]
TTL: 3600 (or Auto)
```

### Record 3: DMARC (Optional but Recommended)

```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:admin@innovativecropcare.com
TTL: 3600 (or Auto)
```

**⚠️ Important**: Copy the exact values from Resend, especially the DKIM value which is unique to your domain.

---

## Step 3: Add DNS Records to Your DNS Provider

### Where is `innovativecropcare.com` hosted?

Choose your provider below:

### Option A: Vercel DNS

If your domain is managed by Vercel:

1. Go to: https://vercel.com
2. Navigate to your project → Settings → Domains
3. Click on `innovativecropcare.com`
4. Go to **DNS Records** tab
5. For each record:
   - Click **"Add"**
   - Type: **TXT**
   - Name: (use exact name from Resend - `@`, `resend._domainkey`, or `_dmarc`)
   - Value: (paste exact value from Resend)
   - Click **"Save"**

### Option B: Cloudflare DNS

If your domain is on Cloudflare:

1. Go to: https://dash.cloudflare.com
2. Select **`innovativecropcare.com`** from your domains
3. Click **DNS** in the left sidebar
4. Click **Records** tab
5. For each record:
   - Click **"Add record"**
   - Type: **TXT**
   - Name: (use exact name from Resend)
   - Content: (paste exact value from Resend)
   - Proxy status: **DNS only** (gray cloud icon)
   - TTL: **Auto** or **3600**
   - Click **"Save"**

### Option C: Namecheap DNS

If your domain is registered with Namecheap:

1. Go to: https://www.namecheap.com
2. Go to **Domain List** → Manage `innovativecropcare.com`
3. Click **Advanced DNS** tab
4. Scroll to **Host Records** section
5. For each record:
   - Click **"Add New Record"**
   - Type: **TXT Record**
   - Host: (use exact name from Resend - for `@` use `@`, for others use exact name)
   - Value: (paste exact value from Resend)
   - TTL: **Automatic**
   - Click **"Save All Changes"** (green checkmark)

### Option D: GoDaddy DNS

If your domain is on GoDaddy:

1. Go to: https://www.godaddy.com
2. Go to **My Products** → **DNS**
3. Find `innovativecropcare.com` and click **DNS**
4. Scroll to **Records** section
5. For each record:
   - Click **"Add"**
   - Type: **TXT**
   - Name: (use exact name from Resend)
   - Value: (paste exact value from Resend)
   - TTL: **1 Hour** (default)
   - Click **"Save"**

### Option E: Other DNS Provider

For any other DNS provider:

1. Log into your DNS management panel
2. Find the DNS records section for `innovativecropcare.com`
3. Add each TXT record with:
   - Type: **TXT**
   - Name/Host: (exact from Resend)
   - Value/Content: (exact from Resend)
   - TTL: **3600** or **Auto**

---

## Step 4: Wait for DNS Propagation

### How Long?

- **Minimum**: 5 minutes
- **Typical**: 10-30 minutes
- **Maximum**: 24-48 hours (rare)

### Check DNS Propagation

You can verify if your DNS records are live:

```bash
# Check SPF record
dig TXT innovativecropcare.com +short

# Check DKIM record
dig TXT resend._domainkey.innovativecropcare.com +short

# Check DMARC record
dig TXT _dmarc.innovativecropcare.com +short
```

Or use online tools:
- https://mxtoolbox.com/TXTLookup.aspx
- https://dnschecker.org

---

## Step 5: Verify Domain in Resend

### 5.1 Return to Resend Dashboard

Go back to: https://resend.com/domains

### 5.2 Click Verify

1. Find `innovativecropcare.com` in your domains list
2. Click the **"Verify"** button next to it
3. Resend will check your DNS records

### 5.3 Check Status

**Success**: You'll see a **green checkmark** ✅ next to your domain

**Still Pending**: If verification fails:
- Wait longer (DNS might still be propagating)
- Double-check your DNS records match exactly
- Try verifying again in 10 minutes

---

## Step 6: Test Email Sending

Once you see the green checkmark:

### 6.1 Test via Diagnostic Endpoint

Go to your admin test page:
```
http://localhost:3000/admin/test-email
```

1. Click **"Run Diagnostics"** - should now show "Configuration Ready"
2. Scroll to **"Step 2: PDFShift + Resend Email"**
3. Enter your email address
4. Click **"Test PDFShift + Resend"**
5. Check your inbox

### 6.2 Test BOL Email

Go to your orders page:
```
http://localhost:3000/admin/orders
```

1. Find order **ORD-MK6844N7-4HEI** (or any order)
2. Click to view order details
3. Click **"Email Bill of Lading"** button
4. Check terminal logs - should see success message

### 6.3 Verify in Resend Logs

Check that emails are being delivered:
```
https://resend.com/logs
```

Look for:
- Status: **Delivered** (not Failed)
- From: `noreply@innovativecropcare.com`
- Recent timestamps

---

## Troubleshooting

### Domain Verification Fails

**Error**: "DNS records not found"

**Solutions**:
1. **Wait longer**: DNS can take up to 24 hours
2. **Check DNS records**: Use `dig` command or online tools
3. **Verify exact values**: Make sure you copied the DKIM value exactly
4. **Check DNS provider**: Some providers have propagation delays

### Email Still Not Sending After Verification

**Check 1**: Restart your development server
```bash
# In terminal
Ctrl + C
pnpm dev
```

**Check 2**: Verify domain shows green checkmark in Resend

**Check 3**: Check Resend logs for specific error messages

**Check 4**: Run diagnostics again:
```
http://localhost:3000/admin/test-email
```

### DNS Records Not Propagating

**Issue**: Records added but not showing in DNS lookup

**Solutions**:
1. **Clear DNS cache** on your computer:
   ```bash
   # macOS
   sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
   
   # Windows
   ipconfig /flushdns
   
   # Linux
   sudo systemd-resolve --flush-caches
   ```

2. **Check different DNS servers**: Different providers propagate at different speeds

3. **Contact DNS provider support**: If stuck after 24 hours

---

## Quick Reference

| Step | Action | Time |
|------|--------|------|
| 1 | Add domain to Resend | 2 min |
| 2 | Copy DNS records | 1 min |
| 3 | Add records to DNS provider | 5 min |
| 4 | Wait for propagation | 10 min - 24 hrs |
| 5 | Verify in Resend | 1 min |
| 6 | Test emails | 5 min |

**Total**: 20 minutes to 24 hours (typically < 1 hour)

---

## Success Checklist

- [ ] Domain added to Resend dashboard
- [ ] SPF record added to DNS
- [ ] DKIM record added to DNS
- [ ] DMARC record added to DNS (optional)
- [ ] DNS records verified with `dig` or online tool
- [ ] Domain verified in Resend (green checkmark)
- [ ] Test email sends successfully
- [ ] BOL email sends without errors
- [ ] Emails show "Delivered" in Resend logs

---

## Need Help?

**Resend Documentation**: https://resend.com/docs/send-with-nextjs
**Resend Support**: https://resend.com/support
**Your Diagnostics**: http://localhost:3000/admin/test-email

**Common Questions**:
- "DNS records not found" → Wait longer or check DNS provider
- "Domain not verified" → Check DNS records are exact match
- "Still getting errors" → Restart dev server after verification
