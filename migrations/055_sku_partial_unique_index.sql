-- Replace the full-table UNIQUE constraint on sku with a partial unique index.
-- This allows soft-deleted products' SKUs to be reused by new products.

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_unique;
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique_active ON products(sku) WHERE deleted_at IS NULL;
