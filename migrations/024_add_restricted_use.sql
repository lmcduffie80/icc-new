-- Migration: Add restricted_use to products and has_restricted_products to orders
-- Purpose: Track restricted use products and flag orders containing them for reporting

-- Add restricted_use column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS restricted_use BOOLEAN DEFAULT false;

-- Add has_restricted_products column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS has_restricted_products BOOLEAN DEFAULT false;

-- Partial indexes for efficient reporting queries
CREATE INDEX IF NOT EXISTS idx_products_restricted_use ON products(restricted_use) WHERE restricted_use = true;
CREATE INDEX IF NOT EXISTS idx_orders_has_restricted_products ON orders(has_restricted_products) WHERE has_restricted_products = true;
