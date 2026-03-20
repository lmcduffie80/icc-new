# PO Approval System Fix Summary

**Date:** January 11, 2026  
**Issue:** Purchase orders over $25,000 were not creating approval requests or sending notification emails

## Problem Identified

### Root Cause
The database trigger `trigger_create_po_approval_request` was missing from the `purchase_orders` table. While the trigger function existed, the trigger itself was never installed, causing the approval workflow to fail silently.

### Affected Purchase Orders
- **PO-2026-000004** - $112,000
- **PO-2026-000005** - $112,000

Both POs were in SUBMITTED status but had no corresponding entries in the `po_approval_requests` table.

## What Was Fixed

### 1. Database Trigger Reinstalled
```sql
CREATE TRIGGER trigger_create_po_approval_request
  AFTER UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION create_po_approval_request();
```

### 2. Approval Requests Created
- Created pending approval requests for both orphaned POs
- Assigned both to Lee McDuffie (approval threshold: $25,000)
- Added entries to `po_approval_history` table

### 3. Notification Emails Sent
Sent approval notification emails to all 3 admins:
- Josh <josh@innovativecropcare.com>
- Lee McDuffie <lee@innovativecropcare.com>
- Mike Synder <mike@innovativecropcare.com>

Total: 6 emails sent (3 admins × 2 POs)

## Scripts Created

### 1. Diagnostic Script
**File:** `scripts/diagnose-po-approval.ts`

Checks the health of the PO approval system:
- Verifies PO details and approval requirements
- Checks for missing approval requests
- Validates database triggers and functions
- Lists admin users and email configuration
- Identifies orphaned POs

**Usage:**
```bash
pnpm exec dotenv -e .env.local -- npx tsx scripts/diagnose-po-approval.ts
```

### 2. Fix Script
**File:** `scripts/fix-po-approval.ts`

Repairs the approval system:
- Reinstalls missing database trigger
- Creates approval requests for orphaned POs
- Assigns approvals to Lee McDuffie
- Logs actions to approval history

**Usage:**
```bash
pnpm exec dotenv -e .env.local -- npx tsx scripts/fix-po-approval.ts
```

### 3. Notification Script
**File:** `scripts/send-po-notifications.ts`

Sends approval emails to admins:
- Finds pending approvals
- Sends emails to all admins with email addresses
- Includes approval links in emails

**Usage:**
```bash
pnpm exec dotenv -e .env.local -- npx tsx scripts/send-po-notifications.ts
```

### 4. Verification Script
**File:** `scripts/verify-po-approval-fix.ts`

Verifies the fix was successful:
- Confirms approval requests exist
- Checks target POs are in pending approvals list
- Validates trigger is active
- Ensures no orphaned POs remain

**Usage:**
```bash
pnpm exec dotenv -e .env.local -- npx tsx scripts/verify-po-approval-fix.ts
```

### 5. Monitoring Script
**File:** `scripts/monitor-po-approvals.ts`

Periodic health check for the approval system:
- Detects orphaned POs
- Validates trigger and function status
- Identifies stale approvals (>7 days)
- Checks admin email configuration
- Reports approval statistics

**Usage:**
```bash
pnpm exec dotenv -e .env.local -- npx tsx scripts/monitor-po-approvals.ts
```

**Recommended:** Run this script daily via cron or scheduled task.

## Verification Results

All checks passed ✅

1. ✅ Pending approvals exist in database
2. ✅ Both target POs (000004, 000005) are in approval queue
3. ✅ Database trigger is active and working
4. ✅ No orphaned POs remaining
5. ✅ All admin users have email addresses configured
6. ✅ Notification emails sent successfully

## How to Use the Approval System

### For Admins

#### View Pending Approvals
Navigate to: `http://localhost:3000/admin/purchase-orders/approvals`

#### Approve a PO
1. Click "Review" on a pending approval
2. Review PO details, line items, and totals
3. Add optional approval notes
4. Click "Approve" button

Or use the direct link from notification email:
`http://localhost:3000/admin/purchase-orders/[id]/approve`

#### Check Email Notifications
- Emails are sent from: `noreply@innovativecropcare.com`
- Subject: "Purchase Order [PO-NUMBER] Requires Approval"
- Contains: PO details, amount, vendor, approval link

### For Developers

#### When Creating/Editing POs
The system automatically:
1. Detects when PO total ≥ $25,000
2. Sets status to SUBMITTED (if not already)
3. Triggers database function to create approval request
4. Assigns to Lee McDuffie if threshold met
5. Sends notification emails to all admins

#### Testing the System
```bash
# 1. Create a test PO over $25,000
# 2. Set status to SUBMITTED
# 3. Run monitoring script
pnpm exec dotenv -e .env.local -- npx tsx scripts/monitor-po-approvals.ts

# 4. Check pending approvals page
open http://localhost:3000/admin/purchase-orders/approvals
```

## Prevention Measures

### 1. Regular Monitoring
Add to cron or scheduled tasks:
```bash
# Daily at 9am
0 9 * * * cd /path/to/icc && pnpm exec dotenv -e .env.local -- npx tsx scripts/monitor-po-approvals.ts
```

### 2. Database Migration Checklist
When deploying:
- ✅ Verify all migrations applied
- ✅ Check trigger exists: `trigger_create_po_approval_request`
- ✅ Check function exists: `create_po_approval_request()`
- ✅ Run monitoring script

### 3. Testing Checklist
Before marking PO features complete:
- ✅ Create test PO over $25,000
- ✅ Verify approval request created
- ✅ Check pending approvals page shows PO
- ✅ Confirm emails sent to admins
- ✅ Test approval workflow end-to-end

## Database Schema

### Tables Involved

#### `po_approval_requests`
- `id` - Approval request ID
- `purchase_order_id` - FK to purchase_orders
- `requested_by` - Admin user ID who submitted
- `requested_at` - Timestamp
- `status` - PENDING, APPROVED, REJECTED
- `approval_threshold` - Dollar amount threshold (25000.00)
- `assigned_to` - Admin user ID assigned to approve

#### `po_approval_history`
- Logs all approval-related actions
- Used for audit trail

### Trigger Flow
```
UPDATE purchase_orders
  └─> trigger_create_po_approval_request() [AFTER UPDATE]
      └─> create_po_approval_request() function
          ├─> Check if status = SUBMITTED
          ├─> Check if total_amount >= 25000
          ├─> Create approval request
          ├─> Assign to Lee McDuffie if over threshold
          └─> Log to approval_history
```

## Troubleshooting

### Approval Not Created

**Symptoms:** PO status is SUBMITTED but no approval request exists

**Solution:**
```bash
# 1. Run diagnostic
pnpm exec dotenv -e .env.local -- npx tsx scripts/diagnose-po-approval.ts

# 2. Run fix script
pnpm exec dotenv -e .env.local -- npx tsx scripts/fix-po-approval.ts

# 3. Send notifications
pnpm exec dotenv -e .env.local -- npx tsx scripts/send-po-notifications.ts
```

### Emails Not Received

**Possible Causes:**
- Admin user has no email address
- RESEND_API_KEY not configured
- Emails in spam folder

**Solution:**
```bash
# Check admin emails
SELECT id, name, email FROM admin_users;

# Check environment variables
echo $RESEND_API_KEY

# Resend notifications
pnpm exec dotenv -e .env.local -- npx tsx scripts/send-po-notifications.ts
```

### PO Not Showing in UI

**Possible Causes:**
- Approval request status is not PENDING
- Permission check failing
- Query filtering out the PO

**Solution:**
```bash
# Verify approval exists
SELECT ar.*, po.po_number, po.status 
FROM po_approval_requests ar
JOIN purchase_orders po ON po.id = ar.purchase_order_id
WHERE po.po_number = 'PO-2026-XXXXX';

# Check user permissions
SELECT permissions FROM admin_users WHERE id = 'USER_ID';
```

## Related Files

### Backend
- `app/api/admin/purchase-orders/[id]/route.ts` - PO update API (sends emails)
- `app/api/admin/purchase-orders/route.ts` - PO creation API (sends emails)
- `app/api/admin/purchase-orders/[id]/approve/route.ts` - Approval endpoint
- `lib/email.ts` - Email sending functions

### Frontend
- `app/admin/(dashboard)/purchase-orders/approvals/page.tsx` - Pending approvals list
- `app/admin/(dashboard)/purchase-orders/approvals/pending-approvals-table.tsx` - Table component
- `app/admin/(dashboard)/purchase-orders/[id]/approve/page.tsx` - Approval form

### Database
- `migrations/033_create_po_approval_system.sql` - Initial approval system
- `migrations/036_add_po_approval_threshold.sql` - $25k threshold
- `migrations/037_fix_po_approval_username.sql` - Fixed trigger/function

## Contact

For issues or questions about the PO approval system:
- Check this document first
- Run monitoring script for diagnostics
- Review security logs: `logs/security-combined.log`

---

**Status:** ✅ Fixed and Verified  
**Last Updated:** January 11, 2026  
**Fixed POs:** 2 (PO-2026-000004, PO-2026-000005)  
**Emails Sent:** 6 notifications
