# Clear Vercel Production Cache - Instructions

## Current Status

Your latest code changes have been pushed to GitHub (commit `743ecf1a`), which should trigger an automatic Vercel deployment. However, to ensure all cache is cleared, follow the steps below.

## Option 1: Verify Automatic Deployment (Recommended First Step)

Vercel automatically deploys when you push to `main`. Check if the deployment is already in progress:

1. **Visit your Vercel Dashboard:**
   - Go to: https://vercel.com/innovative-crop-care/icc-jgvur4g13/deployments
   - Or: https://icc-jgvur4g13-innovative-crop-care.vercel.app

2. **Check for Recent Deployment:**
   - Look for a deployment with commit message: "Fix product JOIN queries to filter deleted products"
   - Commit hash: `743ecf1a`
   - If it shows "Ready" or "Building", the deployment is already in progress

3. **Wait for Completion:**
   - The build typically takes 2-5 minutes
   - Once it shows "Ready", your changes are live with cache cleared

## Option 2: Manual Cache Clear via Vercel CLI (If Automatic Fails)

If the automatic deployment didn't trigger or you want to force a fresh build:

### Step 1: Install Vercel CLI

```bash
# Option A: Using npm (recommended)
npm install -g vercel

# Option B: Using pnpm (if you prefer)
# First set up pnpm global bin directory
pnpm setup
# Then install
pnpm add -g vercel
```

### Step 2: Login to Vercel

```bash
vercel login
```

This will open a browser window for authentication. Follow the prompts to log in with your Vercel account.

### Step 3: Link Your Project (First Time Only)

```bash
cd /Users/donaldmcduffie/Documents/GitHub/ICC/icc-clean
vercel link
```

When prompted:
- Select your team: "innovative-crop-care"
- Select your project: "icc-jgvur4g13" or the project name
- Link to existing project: Yes

### Step 4: Force Fresh Deployment (Clears All Cache)

```bash
# Navigate to project directory
cd /Users/donaldmcduffie/Documents/GitHub/ICC/icc-clean

# Force fresh production deployment (clears all cache)
vercel --prod --force
```

The `--force` flag ensures:
- ✅ Build cache is completely ignored
- ✅ Fresh build from scratch
- ✅ New deployment ID (clears edge cache)
- ✅ All environment variables re-fetched

## Option 3: Manual Cache Clear via Vercel Dashboard (Easiest)

If you prefer using the web interface:

### Step-by-Step:

1. **Open Vercel Dashboard:**
   - Visit: https://vercel.com/innovative-crop-care/icc-jgvur4g13

2. **Go to Deployments Tab:**
   - Click on "Deployments" in the navigation

3. **Find Latest Deployment:**
   - Look for commit `743ecf1a` - "Fix product JOIN queries to filter deleted products"
   - Or click on the most recent deployment

4. **Redeploy Without Cache:**
   - Click the three dots menu (⋯) on the deployment
   - Select "Redeploy"
   - **IMPORTANT**: Toggle OFF "Use existing Build Cache"
   - Click "Redeploy"

5. **Wait for Completion:**
   - Monitor the build progress
   - Once it shows "Ready", your cache is cleared

## Verification Steps

After deployment completes (whichever method you used):

### 1. Check Deployment Status

Visit your Vercel dashboard and verify:
- Latest deployment shows "Ready" status
- Deployment time is recent (within last few minutes)
- Commit shows `743ecf1a`

### 2. Test Your Application

Visit these pages to verify the fix is working:

- **Supplier Portal Products:** https://innovativecropcare.com/supplier/products
  - Should load without "Application error"
  - Should show active products only

- **Supplier Dashboard:** https://innovativecropcare.com/supplier/dashboard
  - Should display revenue stats correctly
  - Should show recent orders

- **Supplier Orders:** https://innovativecropcare.com/supplier/orders
  - Should list orders without errors

### 3. Hard Refresh Your Browser

To ensure you're not seeing cached content in your browser:

**Mac:**
- Chrome/Edge: `Cmd + Shift + R`
- Safari: `Cmd + Option + R`

**Windows:**
- Chrome/Edge: `Ctrl + Shift + R`
- Firefox: `Ctrl + F5`

**Or use Incognito/Private Mode:**
- This ensures no browser cache is used

## Expected Results

After cache is cleared and deployment is complete:

✅ Supplier Portal loads without errors  
✅ No "Application error: a server-side exception" message  
✅ All product queries filter out deleted products  
✅ Dashboard stats show accurate data  
✅ Orders display correctly  

## Troubleshooting

### If Deployment Fails:

1. **Check Build Logs:**
   - In Vercel Dashboard, click on the failed deployment
   - Review the "Build Logs" tab
   - Look for any error messages

2. **Verify Environment Variables:**
   - Go to: Project Settings → Environment Variables
   - Ensure all required variables are set:
     - `DATABASE_URL`
     - `BETTER_AUTH_SECRET`
     - `STRIPE_SECRET_KEY`
     - etc.

3. **Check Git Push:**
   ```bash
   git log -1 --oneline
   # Should show: 743ecf1a Fix product JOIN queries to filter deleted products
   ```

### If Error Persists After Deployment:

1. **Wait 2-3 Minutes:**
   - Edge cache propagation can take time
   - CDN nodes need to sync

2. **Clear Browser Cache:**
   - Hard refresh (see instructions above)
   - Or use incognito mode

3. **Check Database Migration:**
   - Verify the `deleted_at` column exists on production
   - If not, review `MIGRATION_SUCCESS.md` for migration steps

4. **Check Specific Error:**
   - Open browser console (F12)
   - Look for specific error messages
   - Share the error digest number if issue persists

## Summary

**Easiest Method:** Use Option 3 (Vercel Dashboard) - No CLI installation needed  
**Most Thorough:** Use Option 2 (Vercel CLI with --force flag)  
**Automatic:** Option 1 (Check if already deployed from git push)

All methods will clear the cache and deploy your latest fixes.

## What Was Fixed

The deployment includes:

1. **Commit 7789cca6:** Added `deleted_at IS NULL` to direct product queries (23 queries, 10 files)
2. **Commit 743ecf1a:** Added `deleted_at IS NULL` to product JOIN queries (17+ JOINs, 15 files)

**Total:** 33+ database queries updated across 25 files for complete soft delete coverage.

---

**Need Help?** If you encounter any issues, share the error message or deployment logs.
