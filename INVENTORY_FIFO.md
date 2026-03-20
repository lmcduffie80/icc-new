# FIFO Inventory Allocation System

## Overview

The First-In-First-Out (FIFO) inventory allocation system ensures that inventory is systematically exhausted from the oldest supplier warehouses first before moving to newer inventory. This system supports "like products" (products with the same name from different suppliers) and tracks product substitutions for full traceability.

## How FIFO Works

### Core Principles

1. **Supplier Priority**: Inventory is allocated from the oldest supplier first (based on supplier account creation date)
2. **Warehouse Age**: Within each supplier, inventory is allocated from the oldest warehouse entries first (based on warehouse entry date)
3. **Complete Exhaustion**: All inventory from one warehouse is completely allocated before moving to the next
4. **Product Substitution**: System can automatically use "like products" (same name, different supplier) when original product is unavailable

### Allocation Flow

```
Order placed for "Product X" (10 units)
    ↓
Find all products named "Product X" (like products)
    ↓
Get warehouse inventory for all like products
    ↓
Sort by: 1) Supplier age (ASC), 2) Warehouse entry date (ASC)
    ↓
Allocate from Supplier A, Warehouse 1 (oldest) → 5 units
    ↓
Allocate from Supplier A, Warehouse 2 (newer) → 3 units
    ↓
Supplier A exhausted, move to Supplier B
    ↓
Allocate from Supplier B, Warehouse 1 → 2 units
    ↓
Order fully allocated (5 + 3 + 2 = 10 units)
```

## Configuration

### Environment Variables

Add to your `.env.local` file:

```bash
# Enable FIFO inventory allocation (default: false)
USE_FIFO_ALLOCATION=true

# Allow using like products from different suppliers (default: true)
ALLOW_PRODUCT_SUBSTITUTION=true

# Log FIFO allocation decisions for audit trail (default: true)
LOG_FIFO_DECISIONS=true
```

### Configuration File

Settings are defined in `lib/config.ts`:

```typescript
export const INVENTORY_CONFIG = {
  USE_FIFO_ALLOCATION: process.env.USE_FIFO_ALLOCATION === 'true',
  ALLOW_PRODUCT_SUBSTITUTION: process.env.ALLOW_PRODUCT_SUBSTITUTION !== 'false',
  LOG_FIFO_DECISIONS: process.env.LOG_FIFO_DECISIONS !== 'false',
};
```

## Database Schema

### New Columns in `order_items` Table

```sql
ALTER TABLE order_items 
  ADD COLUMN original_product_id TEXT,        -- Product that was ordered
  ADD COLUMN allocated_product_id TEXT,       -- Product actually allocated
  ADD COLUMN supplier_id TEXT,                -- Supplier of allocated product
  ADD COLUMN warehouse_entry_date TIMESTAMP;  -- When inventory entered warehouse
```

### Indexes for Performance

```sql
-- Index for FIFO warehouse queries
CREATE INDEX idx_product_warehouses_created_at 
  ON product_warehouses(created_at ASC);

-- Index for finding like products
CREATE INDEX idx_products_name_in_stock 
  ON products(name, in_stock) WHERE in_stock = true;

-- Composite index for optimal FIFO allocation
CREATE INDEX idx_pw_fifo_allocation 
  ON product_warehouses(product_id, warehouse_id, created_at ASC) 
  WHERE inventory_count > 0;
```

## Usage

### Automatic Allocation

When FIFO is enabled via `USE_FIFO_ALLOCATION=true`, the system automatically uses FIFO allocation when processing orders:

1. Customer places order
2. Admin changes order status to "pending"
3. System automatically allocates inventory using FIFO logic
4. Product substitutions are tracked in `order_items` table
5. FIFO allocations are logged for audit trail

### Manual Testing

To test FIFO allocation:

```typescript
import { allocateItemsToWarehousesFIFO } from '@/lib/warehouse-allocation';

const items = [
  { product_id: '123', quantity: 10, name: 'Product X' }
];

const result = await allocateItemsToWarehousesFIFO(items);

console.log('Allocations:', result.allocations);
console.log('Substitutions:', result.substitutions);
console.log('Warnings:', result.warnings);
```

## API Reference

### `allocateItemsToWarehousesFIFO()`

Allocates order items using FIFO logic.

**Parameters:**
- `items` (OrderItem[]): Array of items to allocate
- `preferredWarehouseId` (string, optional): Preferred warehouse to try first

**Returns:**
```typescript
{
  allocations: FIFOWarehouseAllocation[];
  unfulfilledItems: OrderItem[];
  warnings: string[];
  substitutions: Array<{
    original_product_id: string;
    allocated_product_id: string;
    supplier_company: string | null;
  }>;
}
```

### `reserveInventoryFIFO()`

Reserves inventory using FIFO allocation logic.

**Parameters:**
- `db` (Pool): Database connection pool
- `items` (OrderItem[]): Items to reserve
- `skipICCQuantityDeduction` (boolean): Whether to skip ICC quantity deduction

**Returns:**
```typescript
{
  success: boolean;
  errors: string[];
  partiallyFulfilled: boolean;
  warnings: string[];
  allocations?: FIFOWarehouseAllocation[];
  substitutions?: Array<{...}>;
}
```

## Data Structures

### FIFOWarehouseAllocation

```typescript
interface FIFOWarehouseAllocation {
  warehouse_id: string;
  warehouse_name: string;
  warehouse_location: string | null;
  supplier_id: string | null;
  supplier_company: string | null;
  items: FIFOAllocatedItem[];
}
```

### FIFOAllocatedItem

```typescript
interface FIFOAllocatedItem {
  product_id: string;              // Allocated product
  quantity: number;                // Quantity allocated
  name: string;                    // Product name
  warehouse_id: string;            // Source warehouse
  warehouse_name: string;
  warehouse_location: string | null;
  supplier_id: string | null;
  supplier_company: string | null;
  original_product_id: string;     // Product that was ordered
  allocated_product_id: string;    // Product actually allocated
  warehouse_entry_date: Date;      // When inventory entered warehouse
}
```

## Viewing FIFO Allocations

### Admin Order Details

When viewing an order in the admin panel:

1. Go to Orders → [Order Details]
2. Scroll to "Order Items" section
3. If FIFO was used, you'll see:
   - **Original Product**: The product that was ordered
   - **Allocated Product**: The product actually allocated (may differ if substituted)
   - **Supplier**: Which supplier's product was used
   - **Warehouse Entry Date**: When the inventory entered the warehouse (for FIFO verification)

### Database Query

To verify FIFO allocations:

```sql
SELECT 
  oi.order_id,
  oi.name as product_name,
  oi.original_product_id,
  oi.allocated_product_id,
  oi.supplier_id,
  su.company_name as supplier_company,
  oi.warehouse_entry_date,
  CASE 
    WHEN oi.original_product_id != oi.allocated_product_id 
    THEN 'SUBSTITUTED' 
    ELSE 'ORIGINAL' 
  END as allocation_type
FROM order_items oi
LEFT JOIN supplier_users su ON su.id = oi.supplier_id
WHERE oi.original_product_id IS NOT NULL
ORDER BY oi.warehouse_entry_date ASC;
```

## Logging and Audit Trail

### Log Output

When FIFO is enabled, detailed logs are written to console:

```
[FIFO Allocation] Processing item: Product X (abc123), quantity: 10
[FIFO Allocation] Found 3 like products: abc123, def456, ghi789
[FIFO Allocation] Found 5 warehouse entries (FIFO ordered)
[FIFO Allocation] Allocating 5 units from warehouse Main Storage (entry date: 2024-01-01)
[FIFO Allocation] Product substitution: abc123 -> def456 (Supplier Co)
[FIFO Allocation] Complete: 3 warehouse allocations, 0 unfulfilled items, 1 substitutions
```

### Log Levels

- **Info**: Allocation decisions, warehouse selections
- **Warn**: Product substitutions, partial fulfillment
- **Error**: Allocation failures, database errors

## Edge Cases

### No Like Products Available

When no like products exist:
- System uses only the exact product ordered
- If insufficient inventory, marks as partial fulfillment
- Warning added to order

### All Suppliers Exhausted

When all suppliers run out of inventory:
- Allocates what's available
- Marks remaining as unfulfilled
- Order proceeds with partial fulfillment flag

### Price Differences

When substituted product has different price:
- Uses price from originally ordered product
- Logs warning about price difference
- Admin can manually review if needed

### Product Without Supplier

Products without a supplier_id:
- Sorted with `NULLS LAST` in SQL
- Treated as lowest priority
- Still allocated using FIFO based on warehouse entry date

## Performance Considerations

### Query Optimization

1. **Indexes**: All required indexes are created in migration `039_add_fifo_tracking.sql`
2. **Batching**: Like product queries are batched per item
3. **Caching**: Supplier info is fetched once per allocation

### Expected Performance

- Single item allocation: ~50-100ms
- 10 items with multiple suppliers: ~200-300ms
- 50 items with complex allocations: ~500-800ms

### Monitoring

Monitor these metrics:
- Average allocation time per order
- Number of product substitutions
- Warehouse exhaustion rate
- Partial fulfillment rate

## Troubleshooting

### FIFO Not Working

**Symptom**: Inventory not allocated in FIFO order

**Solutions**:
1. Check `USE_FIFO_ALLOCATION=true` in `.env.local`
2. Verify migration `039_add_fifo_tracking.sql` was run
3. Check logs for FIFO allocation messages
4. Ensure products have `in_stock = true`

### Product Substitutions Not Tracked

**Symptom**: `original_product_id` is NULL in order_items

**Solutions**:
1. Verify migration was run successfully
2. Check that FIFO reservation completed without errors
3. Look for database UPDATE failures in logs

### Performance Issues

**Symptom**: Slow order processing

**Solutions**:
1. Run `ANALYZE` on `product_warehouses` and `products` tables
2. Verify all indexes exist: `\di` in psql
3. Check for missing indexes from migration
4. Consider reducing number of like products by standardizing names

## Migration Guide

### Applying the Migration

```bash
# Run the FIFO tracking migration
pnpm run db:migrate:orders
```

### Rolling Back

If needed, create a rollback migration:

```sql
-- Rollback FIFO tracking
ALTER TABLE order_items 
  DROP COLUMN IF EXISTS original_product_id,
  DROP COLUMN IF EXISTS allocated_product_id,
  DROP COLUMN IF EXISTS supplier_id,
  DROP COLUMN IF EXISTS warehouse_entry_date;

DROP INDEX IF EXISTS idx_product_warehouses_created_at;
DROP INDEX IF EXISTS idx_products_name_in_stock;
DROP INDEX IF EXISTS idx_order_items_supplier_id;
DROP INDEX IF EXISTS idx_products_name_supplier;
DROP INDEX IF EXISTS idx_pw_fifo_allocation;
```

## Best Practices

### 1. Product Naming

- Use consistent product names across suppliers
- Include key identifiers (EPA#, active ingredient) in name
- Avoid supplier-specific suffixes in product name

### 2. Warehouse Management

- Add products to warehouses as soon as they arrive
- Don't backdate warehouse entries
- Keep warehouse records accurate

### 3. Supplier Onboarding

- Set supplier account creation date accurately
- Older suppliers get inventory priority
- Consider business relationships when setting dates

### 4. Monitoring

- Review FIFO logs weekly
- Check for unusual substitution patterns
- Monitor partial fulfillment rates
- Verify oldest inventory is being exhausted

### 5. Testing

- Test with multiple suppliers offering same product
- Verify oldest warehouse is exhausted first
- Check substitution tracking accuracy
- Test partial fulfillment scenarios

## Security Considerations

- FIFO allocation happens server-side only
- Clients cannot influence allocation order
- All allocations are logged for audit trail
- Product substitutions are tracked and visible to admin
- Price manipulation is prevented (uses original product price)

## Future Enhancements

Potential improvements:
1. Supplier preference weighting
2. Geographic optimization (allocate from nearest warehouse)
3. Cost optimization (prefer lower-cost inventory)
4. Expiration date tracking (FEFO - First-Expired-First-Out)
5. Batch/lot tracking integration
6. Real-time inventory reservation UI
7. Predictive allocation suggestions

## Support

For issues or questions:
1. Check logs in console for detailed allocation information
2. Review this documentation
3. Check database for FIFO tracking data
4. Contact development team with order ID and error logs

## Related Documentation

- [Warehouse Management](./WAREHOUSE_MANAGEMENT.md)
- [Order Processing](./ORDER_PROCESSING.md)
- [Supplier Portal](./SUPPLIER_PORTAL.md)
- [Database Schema](./DATABASE_SCHEMA.md)
