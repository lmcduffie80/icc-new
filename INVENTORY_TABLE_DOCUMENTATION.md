# Inventory Table Documentation

## Overview
The inventory table displays all supplier-owned products with their warehouse locations and available inventory counts. The data is pulled from the SQL database using a comprehensive JOIN query.

## Database Structure

### Primary Tables Used

1. **`product_warehouses`** - Core inventory table
   - `id` - Primary key
   - `product_id` - References products table
   - `warehouse_id` - References warehouses table
   - `inventory_count` - Available inventory quantity
   - `warehouse_location` - Physical location within warehouse (e.g., "A-12-B")
   - `created_at` - Timestamp
   - `updated_at` - Timestamp

2. **`products`** - Product information
   - `id` - Product ID
   - `name` - Product name
   - `sku` - Product SKU
   - `supplier_id` - References supplier_users table (Customer/Supplier ID)

3. **`supplier_users`** - Supplier/Customer information
   - `id` - Supplier ID (Customer ID)
   - `name` - Supplier contact name
   - `company_name` - Supplier company name
   - `supplier_number` - Unique supplier identifier (e.g., SUP-001)

4. **`warehouses`** - Warehouse information
   - `id` - Warehouse ID
   - `name` - Warehouse name
   - `address_street` - Street address
   - `address_city` - City
   - `address_state` - State
   - `address_zip` - ZIP code

## SQL Query

The inventory data is retrieved using the following SQL query:

```sql
SELECT 
  pw.id,
  pw.product_id,
  p.name as product_name,
  p.sku as product_sku,
  pw.warehouse_id,
  w.name as warehouse_name,
  CONCAT(w.address_street, ', ', w.address_city, ', ', w.address_state, ' ', w.address_zip) as warehouse_address,
  pw.inventory_count,
  pw.warehouse_location,
  pw.updated_at,
  su.id as supplier_id,
  COALESCE(su.name, 'Innovative Crop Care') as supplier_name,
  COALESCE(su.company_name, 'Innovative Crop Care, LLC') as supplier_company,
  su.supplier_number
FROM product_warehouses pw
INNER JOIN products p ON p.id = pw.product_id
INNER JOIN warehouses w ON w.id = pw.warehouse_id
LEFT JOIN supplier_users su ON su.id = p.supplier_id
ORDER BY 
  COALESCE(su.company_name, 'Innovative Crop Care, LLC'),
  p.name,
  w.name
```

**Note:** Products without a supplier (where `supplier_id` is NULL) are automatically assigned to "Innovative Crop Care, LLC" as the supplier company.

## Data Fields in Inventory Table

The inventory table displays the following fields:

1. **Supplier / Supplier ID**
   - Supplier Company Name
   - Supplier ID (Customer ID) - `supplier_id`
   - Supplier Number (if assigned)
   - Supplier Contact Name

2. **Product**
   - Product Name
   - Product SKU (if available)

3. **Warehouse / Warehouse ID**
   - Warehouse Name
   - Warehouse ID - `warehouse_id`
   - Warehouse Full Address
   - Warehouse Location (physical location within warehouse, if specified)

4. **Available Inventory**
   - Inventory Count - `inventory_count` from `product_warehouses` table
   - Color-coded display:
     - Red: 0 inventory
     - Yellow: < 10 inventory
     - Green: ≥ 10 inventory

5. **Last Updated**
   - Timestamp from `product_warehouses.updated_at`

## Data Flow

1. **Supplier Portal Input** → Suppliers update inventory through the supplier portal
2. **Database Update** → Changes are saved to `product_warehouses` table
3. **Admin Inventory View** → Admin panel queries and displays the data in real-time

## Key Relationships

- `product_warehouses.product_id` → `products.id`
- `product_warehouses.warehouse_id` → `warehouses.id`
- `products.supplier_id` → `supplier_users.id` (Customer/Supplier ID)

## Notes

- **All products** with warehouse inventory are displayed in the inventory table, including:
  - Products with suppliers (shows actual supplier information)
  - Products without suppliers (automatically assigned to "Innovative Crop Care, LLC")
- The query uses INNER JOINs for products and warehouses to ensure data integrity
- The query uses LEFT JOIN for suppliers and COALESCE to default to "Innovative Crop Care, LLC" for products without suppliers
- All inventory data is stored in the `product_warehouses` table on the SQL server
- Warehouse locations are included for all inventory items

