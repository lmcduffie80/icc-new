# Resend Setup Checklist for innovativecropcare.com

## ✅ Completed

- [x] Environment variables configured
  - RESEND_API_KEY: Set and valid
  - EMAIL_FROM: `noreply@innovativecropcare.com`
- [x] Diagnostic endpoint created and working
- [x] Configuration verified programmatically

## 🔄 In Progress - Manual Actions Required

### Task 1: Add Domain to Resend ⏳

**URL**: https://resend.com/domains

**Steps**:
1. Click "Add Domain"
2. Enter: `innovativecropcare.com`
3. Click "Add"

**Status**: ⬜ Not started

---

### Task 2: Add DNS Records ⏳

**After adding domain, Resend will show you 2-3 TXT records.**

**Records to add**:

#### SPF Record
```
Type: TXT
Name: @
Value: v=spf1 include:_spf.resend.com ~all
```

#### DKIM Record  
```
Type: TXT
Name: resend._domainkey
Value: [Copy exact value from Resend - starts with "p=MII..."]
```

#### DMARC Record (Optional)
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:admin@innovativecropcare.com
```

**Where to add them**: Your DNS provider for `innovativecropcare.com`

**Common providers**:
- Vercel: Project → Settings → Domains → DNS Records
- Cloudflare: Domain → DNS → Records
- Namecheap: Domain → Advanced DNS
- GoDaddy: My Products → DNS

**Status**: ⬜ Not started

---

### Task 3: Verify Domain ⏳

**URL**: https://resend.com/domains

**Steps**:
1. Wait 10-30 minutes after adding DNS records
2. Click "Verify" button next to `innovativecropcare.com`
3. Look for green checkmark ✅

**Verify DNS propagation first**:
```bash
dig TXT innovativecropcare.com +short
dig TXT resend._domainkey.innovativecropcare.com +short
```

**Status**: ⬜ Waiting for DNS records

---

## 🎯 Testing (After Verification)

### Test 1: Diagnostic Endpoint

**URL**: http://localhost:3000/admin/test-email

**Steps**:
1. Click "Run Diagnostics"
2. Should show "Configuration Ready" (green)

**Expected Result**: ✅ All checks pass

---

### Test 2: Send Test Email

**URL**: http://localhost:3000/admin/test-email

**Steps**:
1. Go to "Step 2: PDFShift + Resend Email"
2. Enter your email address
3. Click "Test PDFShift + Resend"
4. Check your inbox

**Expected Result**: ✅ Test email received

---

### Test 3: BOL Email

**URL**: http://localhost:3000/admin/orders

**Steps**:
1. Find order: ORD-MK6844N7-4HEI
2. Click "Email Bill of Lading"
3. Check terminal logs

**Expected Result**: ✅ No errors, email sent

---

### Test 4: Verify in Resend Logs

**URL**: https://resend.com/logs

**Check**:
- [ ] Emails show "Delivered" status
- [ ] From: `noreply@innovativecropcare.com`
- [ ] No failed emails

---

## 📊 Progress Tracker

| Task | Status | Time Estimate |
|------|--------|---------------|
| Add domain to Resend | ⬜ Todo | 2 minutes |
| Add DNS records | ⬜ Todo | 5 minutes |
| Wait for DNS propagation | ⬜ Todo | 10-30 min |
| Verify domain in Resend | ⬜ Todo | 1 minute |
| Test diagnostic endpoint | ⬜ Todo | 2 minutes |
| Test email sending | ⬜ Todo | 3 minutes |
| Test BOL email | ⬜ Todo | 2 minutes |

**Total Time**: ~25-45 minutes

---

## 🚀 Quick Alternative (Immediate Testing)

**If you need to test BOL emails NOW** while DNS is being configured:

1. Edit `.env.local`:
   ```bash
   # Temporarily change this:
   EMAIL_FROM=onboarding@resend.dev
   ```

2. Restart server:
   ```bash
   Ctrl + C
   pnpm dev
   ```

3. Test BOL email - should work immediately

4. Change back after domain is verified:
   ```bash
   EMAIL_FROM=noreply@innovativecropcare.com
   ```

⚠️ **Only for testing - never use in production!**

---

## 📚 Documentation

- **Detailed Guide**: `RESEND_DOMAIN_VERIFICATION_GUIDE.md`
- **Original Setup**: `RESEND_SETUP.md`
- **Diagnostics**: `EMAIL_DIAGNOSTICS_SUMMARY.md`
- **Implementation**: `RESEND_DIAGNOSTIC_IMPLEMENTATION.md`

---

## ✅ Success Criteria

You'll know everything is working when:

1. ✅ Green checkmark in Resend dashboard
2. ✅ Diagnostic shows "Configuration Ready"
3. ✅ Test emails send successfully
4. ✅ BOL emails send without "Unable to fetch data" error
5. ✅ Resend logs show "Delivered" status

---

**Current Status**: Environment configured ✅ → Domain verification needed ⏳

**Next Action**: Go to https://resend.com/domains and add `innovativecropcare.com`
