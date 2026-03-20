# Your Vercel Project Links - Quick Access

## Your Deployment Info

**App URL:** icc-jgvur4g13-innovative-crop-care.vercel.app
**Project Name:** innovative-crop-care

## 🔗 Direct Links to Get Your DATABASE_URL

### Option 1: Direct Link to Environment Variables
Click this link (you may need to log in):
https://vercel.com/innovative-crop-care/icc/settings/environment-variables

### Option 2: Step-by-Step Navigation
1. Go to: https://vercel.com/dashboard
2. Click on: **innovative-crop-care** project
3. Click: **Settings** (top navigation)
4. Click: **Environment Variables** (left sidebar)
5. Find: `DATABASE_URL`
6. Click: **"Show"** or the eye icon
7. **Copy the entire URL** (it's very long)

## What the DATABASE_URL Looks Like

It should be a long string starting with:
```
postgresql://neondb_owner:npg_...@ep-something-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
```

## Next Steps After You Get the URL

1. **Update your `.env.production` file:**
   ```bash
   # Open the file
   open .env.production
   
   # Replace this line:
   DATABASE_URL=your_actual_url_here
   
   # With your actual URL (paste what you copied from Vercel)
   ```

2. **Run the migration:**
   ```bash
   ./run-prod-migration.sh
   ```

3. **Type "yes" when prompted**

4. **Clean up:**
   ```bash
   rm .env.production
   ```

5. **Test your site:**
   - Go to: https://innovativeagrecords.com/admin/products
   - Should load without errors!

## Quick Command (Alternative)

If you want to skip the file and run directly:
```bash
DATABASE_URL="paste_your_url_here" pnpm exec tsx scripts/migrate.ts
```

Just replace `paste_your_url_here` with your actual DATABASE_URL from Vercel.

---

**Time to fix:** 3-5 minutes
**Result:** Production site working again!
