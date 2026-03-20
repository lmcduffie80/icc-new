# PO Approval Username Column Fix

## Date
January 10, 2026

## Problem

The PO approval threshold migration (036) was failing with the following error:
```
error: column "username" does not exist
```

This occurred when trying to approve a Purchase Order because the database trigger functions were attempting to query a non-existent `username` column in the `admin_users` table.

## Root Cause

Migration `036_add_po_approval_threshold.sql` contained SQL queries that referenced a `username` column:

```sql
SELECT id INTO lee_admin_id
FROM admin_users
WHERE LOWER(name) LIKE '%lee%mcduffie%' OR LOWER(username) LIKE '%lee%'
LIMIT 1;
```

However, the `admin_users` table schema (from migrations 003 and 010) only has these columns:
- `id`, `user_id`, `role_id`, `custom_permissions`, `email`, `name`, `created_at`, `updated_at`

There is no `username` column!

## Solution Implemented

### Step 1: Updated Migration 036 (Source Fix)
Modified `migrations/036_add_po_approval_threshold.sql` to replace `username` with `email` in both functions:
- `check_po_approval_threshold()` - Line 20
- `create_po_approval_request()` - Line 66

**Changed:**
```sql
WHERE LOWER(name) LIKE '%lee%mcduffie%' OR LOWER(username) LIKE '%lee%'
```

**To:**
```sql
WHERE LOWER(name) LIKE '%lee%mcduffie%' OR LOWER(email) LIKE '%lee%'
```

### Step 2: Created Fix Migration 037
Created `migrations/037_fix_po_approval_username.sql` to fix the already-deployed database functions:
- Drops and recreates `check_po_approval_threshold()` function with correct column
- Drops and recreates `create_po_approval_request()` function with correct column
- Recreates the associated triggers

### Step 3: Executed Migration
Ran migration successfully:
```bash
pnpm run db:migrate:orders
```

**Result:**
- Migration 037 executed successfully ✓
- Warning about migration 036 being modified (expected and harmless)
- Functions now use `email` column instead of `username`

## Files Changed

1. **migrations/036_add_po_approval_threshold.sql**
   - Updated to use `email` instead of `username` (2 occurrences)
   - Serves as source of truth for future deployments

2. **migrations/037_fix_po_approval_username.sql** (NEW)
   - Fixes the deployed database functions
   - Ensures existing deployments get the correction

## How It Works Now

The admin user lookup now searches by:
1. **Name** containing "lee mcduffie" (primary match)
2. **Email** containing "lee" (fallback match)

This will successfully find Lee McDuffie's admin account whether the match is in the name field or email field.

## Testing Required

The fix is now deployed, but manual testing is needed to verify:

1. **Create a high-value PO** (>= $25,000)
   - Navigate to `/admin/purchase-orders/new`
   - Add line items totaling $25,000 or more
   - Save the PO

2. **Verify automatic submission**
   - Status should automatically change to SUBMITTED
   - Approval request should be created

3. **Check approval assignment**
   - Navigate to `/admin/purchase-orders/approvals`
   - High-value PO should appear with "High Value" badge
   - Should show "Assigned to: Lee McDuffie" (if account exists)

4. **Test approval flow**
   - Approve or reject the PO
   - Verify no database errors in server logs

5. **Monitor server logs**
   - No "username" column errors should appear
   - PO approval operations should complete successfully

## Expected Behavior

**Before Fix:**
```
error: column "username" does not exist
POST /api/admin/purchase-orders/2/approve 500 in 806ms
```

**After Fix:**
- PO approval requests complete successfully
- High-value POs automatically require approval
- Lee McDuffie is assigned as approver
- No database errors

## Related Files

- `migrations/036_add_po_approval_threshold.sql` - Original migration (corrected)
- `migrations/037_fix_po_approval_username.sql` - Fix migration (new)
- `app/api/admin/purchase-orders/[id]/approve/route.ts` - Approval endpoint
- `app/admin/(dashboard)/purchase-orders/approvals/page.tsx` - Approvals UI
- `migrations/003_create_admin_tables.sql` - Original admin_users schema
- `migrations/010_standalone_admin_users.sql` - Added email/name columns

## Prevention

To prevent similar issues in the future:
1. Always verify column names against actual table schemas before writing queries
2. Test database functions locally before committing
3. Review migration files for column references
4. Check migration output logs for errors during deployment

## Status

✅ **Fix Implemented and Deployed**
⏳ **Manual Testing Required** - Please test PO approval with high-value orders

## Next Steps

1. Test the PO approval flow with a $25,000+ order
2. Verify Lee McDuffie's account exists in admin_users table
3. Confirm no errors in server logs
4. Mark as fully resolved once testing passes
