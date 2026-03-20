# SDS Document Duplicate Fix

**Date:** January 9, 2026  
**Issue:** Duplicate SDS documents appearing in BOL email modal  
**Status:** ✅ Fixed

---

## Problem Summary

The BOL email modal was showing the same SDS document twice when sending emails. The duplicate appeared because:

1. The same SDS PDF was stored in the database in **two different URL formats**:
   - **Proxy URL**: `/api/images/proxy?url=https%3A%2F%2Fadhoc-icc-demo.s3...file.pdf`
   - **Direct S3 URL**: `https://adhoc-icc-demo.s3.us-west-2.amazonaws.com/...file.pdf`

2. The deduplication logic was comparing **raw URL strings**, so it didn't recognize these as the same document

## Root Cause

In `/app/api/admin/orders/[id]/bill-of-lading/documents/route.ts`, the endpoint collects SDS documents from three places:

1. Product `documents` field (Features & Docs)
2. Product `attributes.documents` field (backward compatibility)
3. Product `sds_url` column

The same SDS file was stored in multiple locations with different URL formats, and the `seenUrls` Set couldn't detect duplicates because the URLs were different strings.

## Solution Implemented

Added URL normalization before deduplication:

### 1. Created `normalizeUrl()` Helper Function

```typescript
/**
 * Normalize URL by extracting the actual S3 URL from proxy URLs
 * This ensures we can detect duplicates regardless of URL format
 */
function normalizeUrl(url: string): string {
  // If it's a proxy URL, extract the actual S3 URL
  if (url.startsWith('/api/images/proxy?url=')) {
    try {
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const actualUrl = urlParams.get('url');
      return actualUrl || url;
    } catch {
      return url;
    }
  }
  return url;
}
```

### 2. Updated Deduplication Logic

Changed all three document collection sections to normalize URLs before checking for duplicates:

**Before:**
```typescript
if (isSDS && !seenUrls.has(docObj.url)) {
  seenUrls.add(docObj.url);
  // ...
}
```

**After:**
```typescript
if (isSDS) {
  const normalizedUrl = normalizeUrl(docObj.url);
  if (!seenUrls.has(normalizedUrl)) {
    seenUrls.add(normalizedUrl);
    // ...
  }
}
```

## How It Works

1. When checking if an SDS document is a duplicate, we now extract the **underlying S3 URL** from proxy URLs
2. Both formats resolve to the same normalized URL:
   - `/api/images/proxy?url=https%3A%2F%2Fs3.com%2Ffile.pdf` → `https://s3.com/file.pdf`
   - `https://s3.com/file.pdf` → `https://s3.com/file.pdf`
3. The `seenUrls` Set compares normalized URLs, so duplicates are properly detected

## Files Modified

- ✅ `/app/api/admin/orders/[id]/bill-of-lading/documents/route.ts`
  - Added `normalizeUrl()` helper function (lines 12-32)
  - Updated product documents deduplication (lines ~88-95)
  - Updated attributes documents deduplication (lines ~117-124)
  - Updated sds_url deduplication (lines ~140-147)

## Testing

- ✅ **Linting:** No errors
- ✅ **Tests:** All 861 tests passed
- ✅ **Type checking:** No TypeScript errors

## Expected Behavior

### Before Fix
When viewing an order with SDS documents, the modal would show:
```
☑ Safety Data Sheet (SDS)
  From: Glufosinate 280SL

☑ Safety Data Sheet (SDS)
  From: Glufosinate 280SL
```

### After Fix
The modal will show only one entry:
```
☑ Safety Data Sheet (SDS)
  From: Glufosinate 280SL
```

## Verification Steps

1. Navigate to an order details page in the admin dashboard
2. Click "Send BOL Email" button
3. Check the "Documents to Send" section in the modal
4. Verify that each SDS document appears only once

## Technical Details

### URL Normalization Logic

- **Proxy URLs** are detected by checking if they start with `/api/images/proxy?url=`
- The actual S3 URL is extracted from the `url` query parameter
- If extraction fails for any reason, the original URL is used (fail-safe)
- Direct S3 URLs pass through unchanged

### Deduplication Strategy

- Uses a `Set<string>` called `seenUrls` to track normalized URLs
- Normalized URLs are added to the Set before checking
- Original URLs are stored in the response (for frontend display)
- This preserves the user's preferred URL format while preventing duplicates

## Benefits

1. ✅ **Eliminates duplicate SDS documents** in the email modal
2. ✅ **Maintains backward compatibility** - works with both URL formats
3. ✅ **Fail-safe design** - if normalization fails, uses original URL
4. ✅ **No breaking changes** - frontend receives URLs in the same format

## Related Issues

This fix also improves the BOL email error messages implemented earlier today. Both changes enhance the BOL email functionality.

---

**Summary:** The duplicate SDS issue is now fixed. The deduplication logic properly recognizes that proxy URLs and direct S3 URLs pointing to the same file are duplicates.
