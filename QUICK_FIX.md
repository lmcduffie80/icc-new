# QUICK FIX - Run Production Migration (No Installation Required)

## Problem
Your production site is broken because the database is missing the `deleted_at` column.

## Fastest Solution (30 seconds)

Run this ONE command with your production DATABASE_URL:

```bash
DATABASE_URL="your_production_url_here" pnpm exec tsx scripts/migrate.ts
```

### Step-by-Step:

1. **Get your production DATABASE_URL:**
   - Go to: https://vercel.com/dashboard
   - Click your project
   - Go to: Settings → Environment Variables
   - Copy the `DATABASE_URL` value (it looks like: `postgresql://user:pass@host.neon.tech/db?sslmode=require`)

2. **Run the migration (replace the URL):**
   ```bash
   DATABASE_URL="postgresql://your-actual-url" pnpm exec tsx scripts/migrate.ts
   ```

3. **Done!** Test your site:
   - https://innovativeagrecords.com/admin/products

## Alternative: Using the Script

If you prefer to use the automated script:

```bash
# Already have .env.production? Just run:
./run-prod-migration.sh

# It will:
# ✅ Verify your .env.production file
# ✅ Ask for confirmation
# ✅ Run the migration
# ✅ Show success/failure message
```

## What You'll See When It Works

```
Loaded environment from .env
Running migrations...
Skipping (already executed): 001_create_orders_tables.sql
...
Running migration: 054_add_product_soft_delete.sql
✓ Completed: 054_add_product_soft_delete.sql
All migrations completed successfully!
```

## Verify It Worked

1. Go to: https://innovativeagrecords.com/admin/products
2. Page should load without "Server Component Error"
3. Product list should display
4. Clear browser cache: Cmd+Shift+R (Mac) or Ctrl+Shift+F5 (Windows)

## Troubleshooting

**"command not found: pnpm"**
- You need to run this from your project directory
- Or use: `npx pnpm exec tsx scripts/migrate.ts`

**"Migration already executed"**
- That's fine! It means it already ran
- Check if your site works now

**Still seeing errors?**
- Check Vercel Runtime Logs
- Verify DATABASE_URL is correct
- Clear browser cache
