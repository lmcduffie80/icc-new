# Purchase Order Email Button Fix

## Date
January 10, 2026

## Problem

The PO email button was failing with error "Failed to send purchase order" because it was sending an empty POST request without the required `to` and `subject` fields that the API endpoint expects.

**Error:**
```
Console Error: Failed to send purchase order
app/admin/(dashboard)/purchase-orders/[id]/po-email-button.tsx (49:15) @ handleSendEmail
```

**Root Cause:**
The button was making a POST request with no body:
```typescript
const response = await fetch(`/api/admin/purchase-orders/${poId}/send`, {
  method: 'POST',  // No body!
});
```

But the API requires:
- `to` - Recipient email address (required)
- `subject` - Email subject (required)
- `message` - Email message (optional)

## Solution Implemented

Created a modal-based email workflow that:
1. Fetches vendor/supplier contact information
2. Pre-fills email for suppliers (who have emails in database)
3. Allows manual entry for vendors (who don't have emails)
4. Shows editable subject and message fields
5. Validates input before sending
6. Sends proper request body to API

## Files Created

### 1. Contact API Route
**File:** `app/api/admin/purchase-orders/[id]/contact/route.ts`

**Purpose:** Returns vendor or supplier contact information for a PO

**Endpoint:** `GET /api/admin/purchase-orders/[id]/contact`

**Response:**
```json
{
  "type": "vendor" | "supplier",
  "name": "Company Name",
  "email": "email@example.com" | null
}
```

**Features:**
- Admin authentication required
- Returns supplier email from `supplier_users` table
- Returns null email for vendors (no email column in database)
- Security logging for errors

### 2. Email Modal Component
**File:** `app/admin/(dashboard)/purchase-orders/[id]/po-email-modal.tsx`

**Purpose:** Modal dialog for composing and sending PO emails

**Features:**
- Auto-fetches contact info on open
- Pre-fills email for suppliers
- Shows "No email on file" badge for vendors
- Editable fields:
  - Recipient email (with validation)
  - Subject (pre-filled with "Purchase Order {PO_NUMBER}")
  - Message (optional, with default template)
- Email format validation
- Loading states during API calls
- Error handling and display
- Backdrop click to close
- Sends proper JSON body to send API

**UI Components:**
- Modal overlay with backdrop
- Form with labeled inputs
- Status badges for vendor/supplier type
- Attachment notice (PDF + Terms)
- Action buttons (Cancel, Send)
- Loading spinners
- Error messages

## Files Modified

### 1. Email Button Component
**File:** `app/admin/(dashboard)/purchase-orders/[id]/po-email-button.tsx`

**Changes:**
- Removed `handleSendEmail` function (old direct API call)
- Removed `isSending` state
- Added `showEmailModal` state
- Updated "Email to Vendor" button to open modal
- Imported and rendered `POEmailModal` component
- Success alert moved to modal callback

**Before:**
```typescript
<Button onClick={handleSendEmail} disabled={isSending}>
  {isSending ? 'Sending...' : 'Email to Vendor'}
</Button>
```

**After:**
```typescript
<Button onClick={() => setShowEmailModal(true)}>
  Email to Vendor
</Button>

<POEmailModal
  poId={poId}
  poNumber={poNumber}
  isOpen={showEmailModal}
  onClose={() => setShowEmailModal(false)}
  onSuccess={() => {
    setShowEmailModal(false);
    alert('Purchase order sent successfully!');
  }}
/>
```

## User Experience Flow

```
1. User clicks "Email to Vendor" button
2. Modal opens and fetches vendor/supplier info
3. Modal displays:
   - Vendor/Supplier name
   - Pre-filled email (for suppliers) or empty (for vendors)
   - Pre-filled subject: "Purchase Order PO-12345"
   - Default message template
4. User reviews and edits:
   - Email address (required)
   - Subject (required)
   - Message (optional)
5. User clicks "Send Email"
6. Modal validates:
   - Email not empty
   - Valid email format
   - Subject not empty
7. Modal sends POST request:
   {
     "to": "vendor@example.com",
     "subject": "Purchase Order PO-12345",
     "message": "Dear Vendor,..."
   }
8. API generates PDF and sends email
9. Success: Modal closes, alert shown
10. Error: Error message displayed in modal
```

## Database Schema Context

### Suppliers (Have Email)
```sql
CREATE TABLE supplier_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  ...
);
```

### Vendors (No Email Column)
```sql
CREATE TABLE vendors (
  id BIGSERIAL PRIMARY KEY,
  vendor_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address_id BIGINT REFERENCES addresses(id),
  -- NO EMAIL COLUMN
  ...
);
```

This is why the modal pre-fills email for suppliers but requires manual entry for vendors.

## Validation

### TypeScript
✅ No type errors (`npx tsc --noEmit`)

### Linting
✅ No linting errors (`pnpm run lint`)

Fixed linter warnings:
- Added eslint-disable comment for useEffect dependencies
- Removed unused `recipientType` variable
- Changed backdrop div to button for keyboard accessibility
- Added aria-label to backdrop button

## API Integration

The modal now properly calls the send API with required fields:

**Request:**
```typescript
POST /api/admin/purchase-orders/[id]/send
Content-Type: application/json

{
  "to": "vendor@example.com",
  "subject": "Purchase Order PO-12345",
  "message": "Dear Vendor,\n\nPlease find attached..."
}
```

**API Response (Success):**
```json
{
  "success": true,
  "messageId": "resend-message-id",
  "message": "Purchase order sent successfully"
}
```

**API Response (Error):**
```json
{
  "error": "Email address and subject are required"
}
```

## Testing Checklist

Manual testing required:

### Supplier PO Test
- [ ] Open PO with supplier
- [ ] Click "Email to Vendor" button
- [ ] Verify modal opens
- [ ] Verify supplier name displayed
- [ ] Verify email pre-filled from supplier_users table
- [ ] Verify subject pre-filled
- [ ] Edit message if desired
- [ ] Click "Send Email"
- [ ] Verify success message
- [ ] Check Resend dashboard for delivery

### Vendor PO Test
- [ ] Open PO with vendor
- [ ] Click "Email to Vendor" button
- [ ] Verify modal opens
- [ ] Verify vendor name displayed
- [ ] Verify "No email on file" badge shown
- [ ] Verify email field is empty
- [ ] Enter valid email address
- [ ] Click "Send Email"
- [ ] Verify success message
- [ ] Check Resend dashboard for delivery

### Validation Tests
- [ ] Try sending without email - should show error
- [ ] Try sending with invalid email format - should show error
- [ ] Try sending without subject - should show error
- [ ] Click backdrop to close modal
- [ ] Click Cancel button to close modal

### PDF Attachment Test
- [ ] Verify email includes PO PDF
- [ ] Verify email includes Terms & Conditions PDF

## Security Features

- Admin authentication required (via `verifyAdminAuth`)
- Email format validation on client side
- API validates required fields on server side
- Security logging for errors
- Rate limiting already in place on API routes

## Benefits Over Previous Implementation

1. **Better UX**: Users can review email details before sending
2. **Safer**: No accidental sends without confirmation
3. **More Flexible**: Users can customize message for each send
4. **Clearer Errors**: Validation errors shown inline
5. **Works for Both**: Handles vendors (no email) and suppliers (with email)
6. **No Database Changes**: Uses existing schema

## Environment Requirements

Same as before:
- `RESEND_API_KEY` - Resend API key
- `EMAIL_FROM` - Verified sender email
- Domain verified in Resend dashboard

## Known Limitations

1. **Vendors don't have emails in database** - Users must manually enter each time
2. **No email history** - Previous recipient emails not saved
3. **Single recipient only** - Can't CC or BCC

## Future Enhancements

Potential improvements:
1. Add email address to vendors table
2. Save last-used email for vendors
3. Add CC/BCC fields
4. Email template library
5. Save draft messages
6. Email history/audit log

## Status

✅ **Implementation Complete**
✅ **TypeScript validation passed**
✅ **Linting passed**
⏳ **Manual testing required**

## Next Steps

1. Test with actual supplier PO in development
2. Test with actual vendor PO in development
3. Verify PDF attachments are correct
4. Check Resend dashboard for delivery status
5. Consider adding vendor email to database schema for future convenience
