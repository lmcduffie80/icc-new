# 🔧 File Picker Freeze - Diagnostic Steps

## Current Status
- ✅ **Test HTML file created**: `/Users/donaldmcduffie/Desktop/test-picker.html`
- ✅ **Accessibility warnings fixed**: No more linter warnings in product-form.tsx
- ⚠️ **Main issue remains**: macOS blocking file picker in browsers

---

## 🚨 Critical: What's Happening

Both Safari and Chrome are affected, which confirms this is a **macOS system-level permission block** (TCC - Transparency, Consent, and Control), not a code issue.

**Symptoms:**
- Safari: Won't load the page or stalls completely
- Chrome: Shows colorful spinning wheel (beach ball) when clicking file inputs

---

## 📋 Step-by-Step Diagnostic Process

### Step 1: Test the Isolated HTML File

Open the test file to verify if the issue is system-wide or app-specific:

```bash
open /Users/donaldmcduffie/Desktop/test-picker.html
```

**Try opening in both:**
- Safari: `open -a Safari /Users/donaldmcduffie/Desktop/test-picker.html`
- Chrome: `open -a "Google Chrome" /Users/donaldmcduffie/Desktop/test-picker.html`

**What to observe:**
- ✅ If file picker opens → Problem is in Next.js app
- ❌ If spinning wheel appears → macOS is blocking at system level
- ❌ If Safari won't load → Severe system restriction

---

### Step 2: Check Your macOS Version

```bash
sw_vers
```

**Note the version** - Different macOS versions have different TCC behaviors:
- macOS 14.x (Sonoma) - Stricter TCC
- macOS 15.x (Sequoia) - Even stricter TCC

---

### Step 3: Reset Browser TCC Permissions

This resets the permission database for file access:

```bash
# Reset Chrome permissions
tccutil reset SystemPolicyAllFiles com.google.Chrome
tccutil reset SystemPolicyDownloadsFolder com.google.Chrome

# Reset Safari permissions
tccutil reset SystemPolicyAllFiles com.apple.Safari
tccutil reset SystemPolicyDownloadsFolder com.apple.Safari
```

**CRITICAL:** After running these commands:
1. Close all browser windows
2. **Restart your Mac** (full restart, not just log out)
3. Try again after restart

---

### Step 4: Check System Settings Permissions

1. Open **System Settings** (or System Preferences)
2. Go to **Privacy & Security**
3. Check these sections:

#### Files and Folders
- Look for Chrome and Safari
- Ensure they have access to Downloads folder

#### Full Disk Access
- Check if Chrome or Safari are listed
- If not, click the **+** button and add:
  - `/Applications/Google Chrome.app`
  - `/Applications/Safari.app`
- Toggle them ON if present

**Screenshot locations for reference:**
- System Settings → Privacy & Security → Files and Folders
- System Settings → Privacy & Security → Full Disk Access

---

### Step 5: Check for Corporate/MDM Restrictions

If this is a work or school computer, it might have Mobile Device Management (MDM) profiles blocking file access:

```bash
sudo profiles show
```

**If you see output:**
- Your Mac has corporate/school restrictions
- Contact your IT department - they need to allowlist file picker access
- You may need admin privileges to modify these

**If command returns nothing:**
- No MDM profiles detected
- Proceed to next step

---

### Step 6: Check Console for TCC Denials

1. Open **Console.app** (Applications → Utilities → Console)
2. In the search bar, type: `TCC`
3. Click "Clear" to clear the log
4. Try clicking a file input in Chrome
5. Look for red error messages containing:
   - "TCC deny"
   - "SystemPolicyAllFiles"
   - "operation not permitted"

**Take a screenshot** of any errors and share them.

---

### Step 7: Try Firefox (Unaffected Browser)

Download and test with Firefox to rule out Chrome/Safari-specific issues:

```bash
# If you have Firefox installed
open -a Firefox /Users/donaldmcduffie/Desktop/test-picker.html

# Or download Firefox
open https://www.mozilla.org/firefox/
```

If Firefox works but Chrome/Safari don't, this confirms TCC blocking.

---

### Step 8: Nuclear Option - Reset All TCC Permissions

**⚠️ WARNING:** This resets ALL privacy permissions for your entire system:

```bash
# Create backup first
sudo cp /Library/Application\ Support/com.apple.TCC/TCC.db ~/TCC.db.backup

# Reset ALL TCC permissions (requires restart)
sudo tccutil reset All
```

After running:
1. Restart Mac
2. Reopen browsers - they will ask for permissions again
3. Grant all permissions when prompted

---

## 🔍 Alternative Test: Direct File Input Test

Create this simple test in your Next.js app:

```bash
# Create a test page
touch /Users/donaldmcduffie/Documents/GitHub/ICC/icc/app/test-upload/page.tsx
```

Then add this minimal code:

```tsx
'use client'

export default function TestUpload() {
  return (
    <div style={{ padding: '50px' }}>
      <h1>Minimal Upload Test</h1>
      <input type="file" onChange={(e) => {
        console.log('File selected:', e.target.files?.[0]?.name);
        alert('File selected: ' + e.target.files?.[0]?.name);
      }} />
    </div>
  )
}
```

Then visit: `http://localhost:3000/test-upload`

If this works but the product form doesn't, the issue is in the product form logic.

---

## 📊 Expected Outcomes

| Scenario | Cause | Solution |
|----------|-------|----------|
| Test HTML works, Next.js doesn't | App code issue | Debug product-form.tsx |
| Nothing works, spinning wheel | TCC block | Steps 3-8 above |
| Safari won't even load pages | Severe TCC restriction | Contact Apple Support or reset Mac |
| Firefox works, others don't | Chrome/Safari TCC issue | Reset those specific permissions |
| Works after restart | TCC cache issue | Problem solved! |

---

## ✅ Next Steps After Fixing

Once file picker works:

1. Test the product form at `http://localhost:3000/admin/products/new`
2. Try uploading an image
3. Verify it uploads to S3
4. Check browser console for any errors

---

## 🆘 If Nothing Works

If all diagnostic steps fail:

1. **Boot in Safe Mode:**
   - Restart Mac, hold Shift key during boot
   - Try file picker in Safe Mode
   - If it works, a third-party app is interfering

2. **Create new user account:**
   - System Settings → Users & Groups → Add Account
   - Log in as new user
   - Test file picker
   - If it works, your user profile has corrupted TCC database

3. **Contact Apple Support:**
   - Explain: "File picker dialogs don't open in any browser"
   - They can diagnose system-level TCC issues

---

## 📝 Report Back

After running diagnostics, please report:

1. ✅/❌ Which steps you completed
2. 🔍 What you observed at each step
3. 📸 Screenshots of any error messages
4. 💻 Output of `sw_vers` command
5. 📋 Whether you have MDM profiles (`sudo profiles show`)

This will help narrow down the exact cause!
