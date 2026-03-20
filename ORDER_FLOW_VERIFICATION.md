# Order Flow Verification

This document verifies that orders flow correctly from store → Admin Panel → Supplier Portal.

## Order Creation Flow

When a customer places an order:

1. **Order is created** in `app/api/orders/route.ts` (POST handler)
   - Inserts into `orders` table with order details
   - Inserts into `order_items` table with product references
   - Each `order_item` has a `product_id` that links to the `products` table

2. **Order appears in Admin Panel** (`app/admin/(dashboard)/orders/page.tsx`)
   - Query: `SELECT o.* FROM orders o WHERE o.status != 'cancelled'`
   - Shows ALL orders (except cancelled)
   - Includes customer information, order items, totals, etc.

3. **Order appears in Supplier Portal** (`app/supplier/(dashboard)/orders/page.tsx`)
   - Query joins: `orders` → `order_items` → `products`
   - Filters: `WHERE p.supplier_id = $1`
   - Only shows orders containing products belonging to that supplier
   - If an order has multiple products from different suppliers, each supplier sees only their products

## Key Points

✅ **Admin Panel**: Shows all orders regardless of supplier
✅ **Supplier Portal**: Shows only orders containing their products
✅ **Multi-supplier orders**: If an order has products from Supplier A and Supplier B:
   - Admin sees the complete order
   - Supplier A sees only their products in the order
   - Supplier B sees only their products in the order

## Database Structure

```
orders
  ├── id
  ├── order_number
  ├── status
  ├── shipping_address (JSONB)
  └── ...

order_items
  ├── id
  ├── order_id (FK → orders.id)
  ├── product_id (FK → products.id)
  ├── quantity
  └── price

products
  ├── id
  ├── supplier_id (FK → supplier_users.id, nullable)
  └── ...

supplier_users
  ├── id
  └── ...
```

## Query Verification

### Admin Orders Query
```sql
SELECT o.*, u.email as user_email, u.name as user_name
FROM orders o
JOIN "user" u ON u.id = o.user_id
WHERE o.status != 'cancelled'
ORDER BY o.created_at DESC
```
✅ Returns all non-cancelled orders

### Supplier Orders Query
```sql
SELECT 
  o.id as order_id,
  o.order_number,
  o.status as order_status,
  o.created_at as order_date,
  -- customer info from shipping_address
  oi.name as product_name,
  oi.product_id,
  oi.quantity,
  oi.price,
  -- ... other fields
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN products p ON p.id = oi.product_id
WHERE p.supplier_id = $1
ORDER BY o.created_at DESC
```
✅ Returns only orders with products from the specified supplier

## Testing Checklist

- [ ] Place an order with a product from Supplier A
- [ ] Verify order appears in Admin Panel
- [ ] Verify order appears in Supplier A's portal
- [ ] Verify order does NOT appear in Supplier B's portal (if different supplier)
- [ ] Place an order with products from multiple suppliers
- [ ] Verify each supplier sees only their products
- [ ] Verify admin sees the complete order

