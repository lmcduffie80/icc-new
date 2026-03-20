# PO Margin Calculation Implementation

**Date:** January 11, 2026  
**Feature:** Automatic calculation of PO unit prices from agreed customer margins  
**Updated:** January 11, 2026 - Revised to use margin split model

## Overview

Implemented functionality to automatically calculate supplier purchase order unit prices based on store prices, supplier base prices, and agreed margin splits. 

**Key Concept:** When ICC and a supplier agree on a margin split (e.g., 40%), ICC receives that percentage of the **total margin** (the difference between what the customer pays and the supplier's base cost). The remaining portion flows back to the supplier in the PO amount.

This ensures:
- POs honor margin commitments to customers
- Suppliers share in the margin based on agreed percentages
- Full transparency in pricing structure

## What Was Implemented

### 1. Interface Updates

**File:** `app/admin/(dashboard)/purchase-orders/new/purchase-order-form.tsx`

Added margin fields to LineItem and Product interfaces:

```typescript
interface LineItem {
  // ... existing fields ...
  // Margin fields for supplier products
  store_price?: number;
  icc_margin_percent?: number;
  icc_margin_amount?: number;
  customer_margin_percent?: number;
  customer_margin_amount?: number;
  product_id?: string;
}

interface Product {
  // ... existing fields ...
  supplier_price?: string;
  icc_margin_percent?: number;
  customer_margin_percent?: number;
}
```

### 2. Margin Calculation Function

Added `calculateUnitPriceFromMargins()` function that calculates:
- Customer pays (after discount)
- Total margin available
- ICC margin share (ICC's percentage of total margin)
- Supplier margin share (remainder of total margin)
- Unit price (what ICC pays supplier = supplier base + supplier share)

**Formula (Margin Split Model):**
```
customer_pays = store_price × (1 - customer_margin_percent / 100)
total_margin = customer_pays - supplier_base_price
icc_share = total_margin × (icc_margin_percent / 100)
supplier_share = total_margin - icc_share
unit_price = supplier_base_price + supplier_share

Where:
  icc_margin_percent = ICC's share of the total margin (e.g., 40% means ICC gets 40% of margin)
  supplier_share = The portion of margin that flows back to supplier in the PO amount
```

### 3. Auto-calculation on Product Selection

When a user selects a supplier product:
1. Detects if product has margin data
2. Automatically calculates unit_price from margins
3. Populates all margin fields in the line item
4. Links the line item to the product

### 4. Visual Indicators

Added margin information display beneath unit price field:
- **Store Price:** Shows the retail price
- **Customer Pays:** Amount customer pays after discount
- **Supplier Base Cost:** Supplier's base price before margin split
- **Total Margin:** Available margin to split between ICC and supplier
- **ICC Share:** ICC's portion of the total margin
- **Supplier Share:** Supplier's portion of the total margin
- **PO Unit Price:** Final amount ICC pays supplier

Example display:
```
Margin Breakdown:
  Store Price: $100.00
  Customer Pays: $88.00 (saves $12.00)
  Supplier Base Cost: $70.00
  Total Margin: $18.00
  ICC Share (40.0%): $7.20
  Supplier Share: $10.80
  PO Unit Price: $80.80
```

### 5. Validation

Added comprehensive validation in `validateForm()`:

- **Positive margin check:** Ensures customer_pays > supplier_base_price (positive margin available)
- **Negative margin check:** Prevents negative customer margins
- **Calculation verification:** Validates that:
  - ICC share matches expected: (total_margin × icc_margin_percent / 100)
  - PO unit price matches: supplier_base_price + supplier_share
  - Tolerance: 0.01 for rounding differences

Error messages are specific and actionable, e.g.:
> "Line 1: PO unit price mismatch. Expected $80.80 but got $81.00. Please recalculate."
> "Line 1: ICC margin amount mismatch. Expected $7.20 but got $7.50. Please recalculate."

### 6. Data Persistence

Margin data is automatically included when submitting the PO:
- All margin fields are sent to the API
- Stored in `purchase_order_lines` table
- Available for future reference and auditing

## How It Works

### User Workflow

1. **Select Supplier:** Choose supplier from dropdown
2. **Add Line Item:** Click "Add Line" button
3. **Select Product:** Choose a supplier product from the product dropdown
4. **Auto-calculation:** System automatically:
   - Calculates unit_price from store price and margins
   - Displays margin breakdown
   - Populates all fields

5. **Review:** User can see:
   - Store price (what customers pay)
   - Unit cost (what ICC pays supplier)
   - Customer savings
   - ICC margin

6. **Submit:** Form validates margins before submission

### Example Calculation

**Glufosinate Product:**
- Store Price: $100.00
- Customer Discount: 12%
- ICC Margin Split: 40% (ICC gets 40% of total margin)
- Supplier Base Price: $70.00

System calculates:
1. Customer Pays: $100 × (1 - 0.12) = $88.00
2. Total Margin: $88.00 - $70.00 = $18.00
3. ICC Share: $18.00 × 0.40 = $7.20
4. Supplier Share: $18.00 - $7.20 = $10.80
5. **PO Unit Price: $70.00 + $10.80 = $80.80**

This means:
- Customer pays: $88.00 (saves $12.00 vs store price)
- Supplier base cost: $70.00
- Total margin available: $18.00
- ICC keeps: $7.20 (40% of $18.00 margin)
- Supplier's share of margin: $10.80 (60% of $18.00 margin)
- **Supplier receives in PO: $80.80** (base $70 + share $10.80)

## Benefits

1. **Accuracy:** Eliminates manual calculation errors
2. **Transparency:** Clear visibility into pricing structure
3. **Compliance:** Ensures agreed margins are honored
4. **Audit Trail:** Margin data stored with each PO line
5. **Efficiency:** Reduces time spent calculating prices

## Technical Details

### API Integration

The existing API endpoint already supports margin fields:
- `POST /api/admin/purchase-orders`
- Schema includes all margin fields (lines 19-24 in route.ts)
- Database table `purchase_order_lines` has margin columns

### Database Schema

Purchase order lines store:
```sql
store_price NUMERIC(12,2)
supplier_base_price DECIMAL(10,2)  -- NEW: Supplier's base cost before margin split
icc_margin_percent DECIMAL(5,2)    -- ICC's share of total margin (e.g., 40)
icc_margin_amount DECIMAL(10,2)    -- Calculated ICC share amount
customer_margin_percent DECIMAL(5,2)
customer_margin_amount DECIMAL(10,2)
```

**Migration:** `044_add_supplier_base_price_to_po_lines.sql` adds the `supplier_base_price` column.

### Compatibility

- **Vendor POs:** Not affected - no margin calculations
- **Manual Entry:** Users can still manually enter unit prices
- **Existing POs:** No changes to existing purchase orders
- **Products without margins:** Falls back to using store price as unit price

## Testing Recommendations

### Test Cases

1. **Standard Supplier Product**
   - Product with 8% ICC margin, 12% customer margin
   - Verify unit_price calculated correctly
   - Verify margin display shows correct values

2. **Edge Cases**
   - Zero margins (unit_price = store_price)
   - Very high margins (ensure non-negative unit_price)
   - Products without margin data (manual entry still works)

3. **Validation**
   - Try unit_price >= store_price (should fail)
   - Try negative margins (should fail)
   - Modify unit_price manually to break margin calculation (should warn)

4. **Database Persistence**
   - Submit PO with margins
   - Verify all margin fields saved to database
   - Check PO approval page shows correct values

### Manual Testing Steps

```bash
1. Navigate to: http://localhost:3000/admin/purchase-orders/new

2. Select "Supplier" radio button

3. Choose a supplier from dropdown

4. Click "Add Line"

5. Select a product that has margin data

6. Verify:
   - Unit price auto-calculated
   - Margin info displayed
   - Store price shows correctly
   
7. Try to submit with invalid margins

8. Submit valid PO and verify data saved
```

## Future Enhancements

Potential improvements:
1. **Margin Override:** Allow manual override with approval
2. **Margin History:** Track margin changes over time
3. **Bulk Import:** Import products with calculated margins
4. **Margin Reports:** Analytics on margin performance
5. **Price Alerts:** Notify when margins fall below thresholds

## Files Modified

1. **`app/admin/(dashboard)/purchase-orders/new/purchase-order-form.tsx`**
   - Updated LineItem interface to include `supplier_base_price` field
   - Updated Product interface (already had `supplier_price`)
   - Rewrote `calculateUnitPriceFromMargins()` function with new margin split formula
   - Modified product selection handler to pass `supplier_base_price` and handle missing values
   - Enhanced validation logic to verify margin split calculations
   - Updated visual margin indicators to show complete breakdown

2. **`app/api/admin/purchase-orders/products/route.ts`**
   - Added `supplier_price`, `icc_margin_percent`, `customer_margin_percent` to SELECT query
   - Updated ProductForPO interface to include margin fields

3. **`app/api/admin/purchase-orders/route.ts`**
   - Added `supplier_base_price` to purchaseOrderLineSchema validation

4. **`migrations/044_add_supplier_base_price_to_po_lines.sql`** (NEW)
   - Adds `supplier_base_price` column to `purchase_order_lines` table

5. **`PO_MARGIN_CALCULATION_IMPLEMENTATION.md`** (THIS FILE)
   - Updated documentation to reflect new margin split formula
   - Updated examples and calculations

## Migration Notes

- **Database migration required:** Run migration `044_add_supplier_base_price_to_po_lines.sql`
  ```bash
  pnpm run db:migrate:orders
  ```
- **API schema updated:** Added `supplier_base_price` to line item validation
- **Backward compatible:** Existing POs without `supplier_base_price` will still work
- **Products API updated:** Now returns `supplier_price`, `icc_margin_percent`, `customer_margin_percent`

## Documentation

- Code comments added for clarity
- Validation error messages are self-explanatory
- UI labels indicate when margins are being used

## Success Criteria

✅ Unit price automatically calculated from margins  
✅ Margin information clearly displayed  
✅ Validation prevents invalid margin configurations  
✅ Margin data persisted with PO  
✅ No impact on vendor POs  
✅ Manual entry still possible  

---

**Status:** ✅ UPDATED - Margin Split Model Implemented  
**Last Updated:** January 11, 2026  
**Implementation Time:** ~2 hours total  
**Files Changed:** 5 files (form, 2 API routes, migration, documentation)
