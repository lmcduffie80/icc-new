# Production Migration Guide - URGENT FIX

## What This Fixes

Your production site is showing errors because the code expects a `deleted_at` column that doesn't exist yet in the production database.

## Quick Fix (5 minutes)

### Option 1: Run Migration Script (RECOMMENDED)

1. **Get your production DATABASE_URL from Vercel:**
   - Go to: https://vercel.com/dashboard
   - Select your project
   - Go to Settings → Environment Variables
   - Copy the `DATABASE_URL` value

2. **Create temporary production environment file:**
   ```bash
   # In your terminal, from the project root:
   echo "DATABASE_URL=YOUR_PRODUCTION_URL_HERE" > .env.production
   ```
   
   Replace `YOUR_PRODUCTION_URL_HERE` with the actual URL from Vercel.

3. **Run the migration:**
   ```bash
   dotenv -e .env.production -- pnpm exec tsx scripts/migrate.ts
   ```

4. **Verify success - you should see:**
   ```
   Running migration: 054_add_product_soft_delete.sql
   ✓ Completed: 054_add_product_soft_delete.sql
   All migrations completed successfully!
   ```

5. **Clean up (IMPORTANT - don't commit production credentials):**
   ```bash
   rm .env.production
   ```

6. **Test production:**
   - Go to: https://innovativeagrecords.com/admin/products
   - Page should load without errors!

### Option 2: Run SQL Directly in Database Console

If you prefer to use your database console (Neon, pgAdmin, etc.):

1. **Connect to your production database**

2. **Copy and paste this SQL:**

```sql
-- Add soft delete support to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON products(deleted_at) WHERE deleted_at IS NULL;

-- Add documentation
COMMENT ON COLUMN products.deleted_at IS 'Soft delete timestamp. NULL = active, timestamp = deleted';
COMMENT ON COLUMN products.deleted_by IS 'Admin user ID who soft deleted the product';
```

3. **Execute the SQL**

4. **Test production** (same as Option 1, step 6)

## Safety Notes

✅ **This migration is 100% safe:**
- Uses `IF NOT EXISTS` - won't fail if run twice
- Only adds columns - doesn't modify existing data
- All existing products remain active (deleted_at = NULL)
- Zero downtime - site continues working during migration

✅ **What it does:**
- Adds `deleted_at` column (NULL = active product)
- Adds `deleted_by` column (tracks who deleted it)
- Creates index for fast queries
- No data is changed or lost

## Verification Checklist

After running the migration, verify these pages work:

- [ ] https://innovativeagrecords.com/admin/products (admin product list)
- [ ] https://innovativeagrecords.com/shop (public shop page)
- [ ] Product detail pages
- [ ] Product approval functionality

## Troubleshooting

**If you see: "command not found: dotenv"**
```bash
pnpm install -g dotenv-cli
```

**If migration shows "already executed":**
- That's fine! It means it ran successfully before
- Your production might already be fixed

**If you still see errors after migration:**
- Clear your browser cache (Cmd+Shift+R or Ctrl+Shift+F5)
- Check Vercel deployment shows latest commit
- Check Vercel runtime logs for specific error messages

## Need Help?

If anything goes wrong:
1. The migration is reversible (columns can be dropped)
2. Check Vercel logs for detailed error messages
3. Verify DATABASE_URL is correct in Vercel settings
