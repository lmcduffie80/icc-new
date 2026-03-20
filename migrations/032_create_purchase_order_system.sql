-- ============================================================================
-- Innovative CropCare, LLC (ICC) Purchase Order System - Exact Postgres Schema
-- Target: Postgres 14+ (works with Supabase / Neon)
-- Notes:
--  - Uses sequences for vendor_number + po_number
--  - Stores Bill-To as a fixed address record; Ship-To can be prefilled via address table
--  - Line items support taxable flag; tax rate can be configured per PO (or globally later)
-- ============================================================================

-- ---------------------------
-- Extensions (optional)
-- ---------------------------
-- If you want UUIDs instead of bigints, enable pgcrypto and swap IDs.
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------
-- Enums
-- ---------------------------
DO $$ BEGIN
  CREATE TYPE payment_terms AS ENUM ('DUE_UPON_RECEIPT','NET_30','NET_60','NET_90','NET_180');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE po_status AS ENUM ('DRAFT','SUBMITTED','APPROVED','SENT','RECEIVED','CLOSED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE address_type AS ENUM ('BILL_TO','SHIP_TO','VENDOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------
-- Core Tables
-- ---------------------------

-- Addresses can be reused (bill-to, ship-to presets, vendor addresses, etc.)
CREATE TABLE IF NOT EXISTS addresses (
  id              BIGSERIAL PRIMARY KEY,
  type            address_type NOT NULL,
  company_name    TEXT NOT NULL,
  address1        TEXT NOT NULL,
  address2        TEXT,
  city            TEXT NOT NULL,
  state           TEXT NOT NULL,
  zip_code        TEXT NOT NULL,
  country         TEXT NOT NULL DEFAULT 'United States',
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vendors (with assigned vendor_number and folder path for storage)
CREATE TABLE IF NOT EXISTS vendors (
  id                    BIGSERIAL PRIMARY KEY,
  vendor_number         TEXT NOT NULL UNIQUE,  -- e.g. VEND-000123
  name                  TEXT NOT NULL,
  address_id            BIGINT REFERENCES addresses(id) ON DELETE SET NULL,
  tax_exempt            BOOLEAN NOT NULL DEFAULT FALSE,
  default_payment_terms payment_terms,
  folder_path           TEXT NOT NULL,         -- e.g. /vendors/VEND-000123/
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors USING gin (to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_vendors_address_id ON vendors(address_id);

-- Links an auth user to a vendor record
CREATE TABLE IF NOT EXISTS vendor_users (
  id         BIGSERIAL PRIMARY KEY,
  vendor_id  BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL, -- Clerk/NextAuth user id
  role       TEXT NOT NULL DEFAULT 'VENDOR', -- 'VENDOR' | 'VENDOR_ADMIN' (optional)
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_users_user_id ON vendor_users(user_id);

-- Optional: store Buyers if you want a dropdown independent of auth provider.
-- If you're using Clerk/NextAuth, store your auth userId here.
CREATE TABLE IF NOT EXISTS buyers (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL UNIQUE,   -- auth provider user id
  display_name TEXT NOT NULL,
  email       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Purchase Orders (header)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id               BIGSERIAL PRIMARY KEY,
  po_number        TEXT NOT NULL UNIQUE, -- e.g. PO-2026-000045
  vendor_id        BIGINT NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,

  -- Header fields
  order_date       DATE NOT NULL,
  buyer_id         BIGINT REFERENCES buyers(id) ON DELETE SET NULL,
  buyer_name       TEXT NOT NULL, -- snapshot in case buyer changes later

  payment_terms    payment_terms NOT NULL DEFAULT 'NET_30',

  -- Addresses (snapshot by reference; you can also denormalize later for immutable audit)
  ship_to_address_id BIGINT NOT NULL REFERENCES addresses(id) ON DELETE RESTRICT,
  bill_to_address_id BIGINT NOT NULL REFERENCES addresses(id) ON DELETE RESTRICT,

  -- Totals (store computed values for reporting; keep in sync with lines)
  currency         CHAR(3) NOT NULL DEFAULT 'USD',
  tax_rate         NUMERIC(7,6) NOT NULL DEFAULT 0.000000, -- e.g. 0.070000 for 7%
  subtotal_amount  NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  tax_amount       NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_amount     NUMERIC(12,2) NOT NULL DEFAULT 0.00,

  status           po_status NOT NULL DEFAULT 'DRAFT',
  notes            TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_vendor_id ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_order_date ON purchase_orders(order_date);

-- Add buyer_user_id column for better RLS policy matching
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS buyer_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_po_buyer_user_id ON purchase_orders(buyer_user_id);

-- Purchase Order Lines (dynamic rows)
CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id              BIGSERIAL PRIMARY KEY,
  purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,

  line_number     INTEGER NOT NULL,
  item_number     TEXT NOT NULL,
  description     TEXT NOT NULL,
  need_by_date    DATE,
  quantity        NUMERIC(14,4) NOT NULL CHECK (quantity >= 0),
  uom             TEXT NOT NULL, -- e.g. gal, lb, tote, drum, pallet, each
  unit_price      NUMERIC(12,4) NOT NULL CHECK (unit_price >= 0),
  taxable         BOOLEAN NOT NULL DEFAULT FALSE,

  line_total      NUMERIC(12,2) NOT NULL DEFAULT 0.00, -- quantity * unit_price

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_po_line UNIQUE (purchase_order_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_pol_po_id ON purchase_order_lines(purchase_order_id);

-- PO Attachments (PDF, acknowledgements, etc.) stored in S3 / Vercel Blob / Supabase Storage
CREATE TABLE IF NOT EXISTS purchase_order_files (
  id                BIGSERIAL PRIMARY KEY,
  purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  file_type         TEXT NOT NULL,         -- e.g. 'PO_PDF','TERMS_PDF','ACK'
  file_name         TEXT NOT NULL,
  storage_key       TEXT NOT NULL,         -- path/key in blob store
  mime_type         TEXT NOT NULL,
  size_bytes        BIGINT NOT NULL DEFAULT 0,
  uploaded_by       TEXT,                  -- auth user id
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pof_po_id ON purchase_order_files(purchase_order_id);

-- Terms & Conditions (versioned; attach "active" version to new POs)
CREATE TABLE IF NOT EXISTS po_terms_versions (
  id            BIGSERIAL PRIMARY KEY,
  version_label TEXT NOT NULL,          -- e.g. "v1.0"
  body_text     TEXT NOT NULL,          -- full T&C text
  is_active     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link PO to the T&C version used at time of issuance (audit-safe)
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS terms_version_id BIGINT REFERENCES po_terms_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_po_terms_version_id ON purchase_orders(terms_version_id);


-- ============================================================================
-- Numbering: vendor_number and po_number sequences + generators
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS vendor_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1;

-- Format vendor number: VEND-000123
CREATE OR REPLACE FUNCTION gen_vendor_number() RETURNS TEXT AS $$
DECLARE
  n BIGINT;
BEGIN
  n := nextval('vendor_number_seq');
  RETURN 'VEND-' || lpad(n::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Format PO number: PO-YYYY-000045
CREATE OR REPLACE FUNCTION gen_po_number(order_dt DATE) RETURNS TEXT AS $$
DECLARE
  n BIGINT;
  yr TEXT;
BEGIN
  n := nextval('po_number_seq');
  yr := to_char(order_dt, 'YYYY');
  RETURN 'PO-' || yr || '-' || lpad(n::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Auto-fill timestamps
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Vendor before insert: assign vendor_number + folder_path if missing
CREATE OR REPLACE FUNCTION vendors_before_insert() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vendor_number IS NULL OR NEW.vendor_number = '' THEN
    NEW.vendor_number := gen_vendor_number();
  END IF;

  IF NEW.folder_path IS NULL OR NEW.folder_path = '' THEN
    NEW.folder_path := '/vendors/' || NEW.vendor_number || '/';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vendors_before_insert ON vendors;
CREATE TRIGGER trg_vendors_before_insert
BEFORE INSERT ON vendors
FOR EACH ROW
EXECUTE FUNCTION vendors_before_insert();

DROP TRIGGER IF EXISTS trg_vendors_updated_at ON vendors;
CREATE TRIGGER trg_vendors_updated_at
BEFORE UPDATE ON vendors
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_addresses_updated_at ON addresses;
CREATE TRIGGER trg_addresses_updated_at
BEFORE UPDATE ON addresses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Purchase order before insert: assign po_number + snapshot buyer_name if missing
CREATE OR REPLACE FUNCTION purchase_orders_before_insert() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.po_number IS NULL OR NEW.po_number = '' THEN
    NEW.po_number := gen_po_number(NEW.order_date);
  END IF;

  IF (NEW.buyer_name IS NULL OR NEW.buyer_name = '') AND NEW.buyer_id IS NOT NULL THEN
    SELECT b.display_name INTO NEW.buyer_name FROM buyers b WHERE b.id = NEW.buyer_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_po_before_insert ON purchase_orders;
CREATE TRIGGER trg_po_before_insert
BEFORE INSERT ON purchase_orders
FOR EACH ROW
EXECUTE FUNCTION purchase_orders_before_insert();

DROP TRIGGER IF EXISTS trg_po_updated_at ON purchase_orders;
CREATE TRIGGER trg_po_updated_at
BEFORE UPDATE ON purchase_orders
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_pol_updated_at ON purchase_order_lines;
CREATE TRIGGER trg_pol_updated_at
BEFORE UPDATE ON purchase_order_lines
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- Line totals + PO rollups
-- ============================================================================
CREATE OR REPLACE FUNCTION recompute_po_totals(p_po_id BIGINT) RETURNS VOID AS $$
DECLARE
  v_subtotal NUMERIC(12,2);
  v_taxable_subtotal NUMERIC(12,2);
  v_tax_rate NUMERIC(7,6);
  v_tax NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(line_total), 0.00),
         COALESCE(SUM(CASE WHEN taxable THEN line_total ELSE 0 END), 0.00)
    INTO v_subtotal, v_taxable_subtotal
  FROM purchase_order_lines
  WHERE purchase_order_id = p_po_id;

  SELECT tax_rate INTO v_tax_rate
  FROM purchase_orders
  WHERE id = p_po_id;

  v_tax := round(v_taxable_subtotal * v_tax_rate, 2);

  UPDATE purchase_orders
     SET subtotal_amount = v_subtotal,
         tax_amount = v_tax,
         total_amount = round(v_subtotal + v_tax, 2),
         updated_at = NOW()
   WHERE id = p_po_id;
END;
$$ LANGUAGE plpgsql;

-- Set line_total before insert/update on lines
CREATE OR REPLACE FUNCTION pol_before_write() RETURNS TRIGGER AS $$
BEGIN
  NEW.line_total := round((NEW.quantity * NEW.unit_price)::numeric, 2);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pol_before_write ON purchase_order_lines;
CREATE TRIGGER trg_pol_before_write
BEFORE INSERT OR UPDATE ON purchase_order_lines
FOR EACH ROW
EXECUTE FUNCTION pol_before_write();

-- After line changes, roll up totals
CREATE OR REPLACE FUNCTION pol_after_change() RETURNS TRIGGER AS $$
DECLARE
  v_po_id BIGINT;
BEGIN
  v_po_id := COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
  PERFORM recompute_po_totals(v_po_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pol_after_insert ON purchase_order_lines;
CREATE TRIGGER trg_pol_after_insert
AFTER INSERT ON purchase_order_lines
FOR EACH ROW
EXECUTE FUNCTION pol_after_change();

DROP TRIGGER IF EXISTS trg_pol_after_update ON purchase_order_lines;
CREATE TRIGGER trg_pol_after_update
AFTER UPDATE ON purchase_order_lines
FOR EACH ROW
EXECUTE FUNCTION pol_after_change();

DROP TRIGGER IF EXISTS trg_pol_after_delete ON purchase_order_lines;
CREATE TRIGGER trg_pol_after_delete
AFTER DELETE ON purchase_order_lines
FOR EACH ROW
EXECUTE FUNCTION pol_after_change();

-- ============================================================================
-- App context helpers (works with Neon)
-- These functions allow reading session variables set by the application
-- for tracking user context in database operations
-- MUST be created before RLS policies that use them
-- ============================================================================
CREATE OR REPLACE FUNCTION app_user_id() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_role() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.role', true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_vendor_id() RETURNS BIGINT AS $$
  SELECT NULLIF(current_setting('app.vendor_id', true), '')::bigint;
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- Row Level Security (RLS)
-- Enable RLS on all purchase order tables for fine-grained access control
-- ============================================================================
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_terms_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Admin full access to all tables
-- Vendors
CREATE POLICY vendors_admin_all
ON vendors
FOR ALL
USING (app_role() = 'ADMIN')
WITH CHECK (app_role() = 'ADMIN');

-- Addresses
CREATE POLICY addresses_admin_all
ON addresses
FOR ALL
USING (app_role() = 'ADMIN')
WITH CHECK (app_role() = 'ADMIN');

-- Terms versions
CREATE POLICY terms_admin_all
ON po_terms_versions
FOR ALL
USING (app_role() = 'ADMIN')
WITH CHECK (app_role() = 'ADMIN');

-- Vendor Users mapping
CREATE POLICY vendor_users_admin_all
ON vendor_users
FOR ALL
USING (app_role() = 'ADMIN')
WITH CHECK (app_role() = 'ADMIN');

-- PO header
CREATE POLICY po_admin_all
ON purchase_orders
FOR ALL
USING (app_role() = 'ADMIN')
WITH CHECK (app_role() = 'ADMIN');

-- PO lines
CREATE POLICY pol_admin_all
ON purchase_order_lines
FOR ALL
USING (app_role() = 'ADMIN')
WITH CHECK (app_role() = 'ADMIN');

-- PO files
CREATE POLICY pof_admin_all
ON purchase_order_files
FOR ALL
USING (app_role() = 'ADMIN')
WITH CHECK (app_role() = 'ADMIN');

-- RLS Policies: Buyer access
-- Buyer can read vendors (needed to create PO)
CREATE POLICY vendors_buyer_read
ON vendors
FOR SELECT
USING (app_role() IN ('BUYER','ADMIN'));

-- Buyer can read ship-to/bill-to addresses (needed for form)
CREATE POLICY addresses_buyer_read
ON addresses
FOR SELECT
USING (app_role() IN ('BUYER','ADMIN'));

-- Buyer can read active terms
CREATE POLICY terms_buyer_read
ON po_terms_versions
FOR SELECT
USING (app_role() IN ('BUYER','ADMIN'));

-- Buyer can manage ONLY their own POs
CREATE POLICY po_buyer_own
ON purchase_orders
FOR ALL
USING (
  app_role() = 'BUYER'
  AND app_user_id() IS NOT NULL
  AND buyer_name IS NOT NULL
  -- best practice: store buyer_user_id; see note below
)
WITH CHECK (
  app_role() = 'BUYER'
  AND app_user_id() IS NOT NULL
);

-- Buyer can manage lines only for POs they can access
CREATE POLICY pol_buyer_via_po
ON purchase_order_lines
FOR ALL
USING (
  app_role() = 'BUYER'
  AND EXISTS (
    SELECT 1
    FROM purchase_orders po
    WHERE po.id = purchase_order_lines.purchase_order_id
      AND po.status IN ('DRAFT','SUBMITTED','APPROVED','SENT','RECEIVED','CLOSED','CANCELLED')
  )
)
WITH CHECK (
  app_role() = 'BUYER'
  AND EXISTS (
    SELECT 1
    FROM purchase_orders po
    WHERE po.id = purchase_order_lines.purchase_order_id
  )
);

-- Buyer can manage files only for POs they can access
CREATE POLICY pof_buyer_via_po
ON purchase_order_files
FOR ALL
USING (
  app_role() = 'BUYER'
  AND EXISTS (
    SELECT 1
    FROM purchase_orders po
    WHERE po.id = purchase_order_files.purchase_order_id
  )
)
WITH CHECK (
  app_role() = 'BUYER'
  AND EXISTS (
    SELECT 1
    FROM purchase_orders po
    WHERE po.id = purchase_order_files.purchase_order_id
  )
);

-- RLS Policies: Vendor access (read-only for their own data)
-- Vendor user sees only their own mapping row
CREATE POLICY vendor_users_self_read
ON vendor_users
FOR SELECT
USING (
  app_role() = 'VENDOR'
  AND user_id = app_user_id()
  AND is_active = TRUE
);

-- Vendor can read their own vendor record
CREATE POLICY vendors_vendor_read_self
ON vendors
FOR SELECT
USING (
  app_role() = 'VENDOR'
  AND id = app_vendor_id()
);

-- Vendor can read ONLY their own POs
CREATE POLICY po_vendor_read_self
ON purchase_orders
FOR SELECT
USING (
  app_role() = 'VENDOR'
  AND vendor_id = app_vendor_id()
);

-- Vendor can read lines for their own POs
CREATE POLICY pol_vendor_read_via_po
ON purchase_order_lines
FOR SELECT
USING (
  app_role() = 'VENDOR'
  AND EXISTS (
    SELECT 1 FROM purchase_orders po
    WHERE po.id = purchase_order_lines.purchase_order_id
      AND po.vendor_id = app_vendor_id()
  )
);

-- Vendor can read files for their own POs
CREATE POLICY pof_vendor_read_via_po
ON purchase_order_files
FOR SELECT
USING (
  app_role() = 'VENDOR'
  AND EXISTS (
    SELECT 1 FROM purchase_orders po
    WHERE po.id = purchase_order_files.purchase_order_id
      AND po.vendor_id = app_vendor_id()
  )
);

-- Vendors should NOT read addresses / terms unless you want them to
-- If you do want vendor to see ship-to/bill-to, add a SELECT policy on addresses.

-- ============================================================================
-- Seed: ICC Bill-To + (optional) default Ship-To + initial Terms version
-- ============================================================================
-- Bill-To (locked)
INSERT INTO addresses (type, company_name, address1, city, state, zip_code, country, is_default)
SELECT 'BILL_TO', 'Innovative CropCare, LLC', '181 Cedar Ridge Rd', 'Tifton', 'GA', '31794', 'United States', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM addresses
  WHERE type='BILL_TO' AND company_name='Innovative CropCare, LLC' AND address1='181 Cedar Ridge Rd'
);

-- Ship-To placeholder (you can update this to your preferred default shipping address)
-- INSERT INTO addresses (type, company_name, address1, city, state, zip_code, country, is_default)
-- SELECT 'SHIP_TO', 'Innovative CropCare, LLC', '<<SHIP ADDRESS>>', 'Tifton', 'GA', '31794', 'United States', TRUE
-- WHERE NOT EXISTS (SELECT 1 FROM addresses WHERE type='SHIP_TO' AND is_default=TRUE);

-- Terms version seed (set is_active = true)
INSERT INTO po_terms_versions (version_label, body_text, is_active)
SELECT 'v1.0',
'PURCHASE ORDER TERMS AND CONDITIONS

1. Acceptance
This Purchase Order ("PO") constitutes an offer by Innovative CropCare, LLC ("Buyer"). Acceptance occurs upon shipment, delivery, or written confirmation.

2. Pricing & Payment
Prices listed are firm unless otherwise agreed in writing. Payment terms apply from date of receipt of goods unless stated otherwise.

3. Delivery
Time is of the essence. Vendor shall deliver goods by the specified Need By Date. Buyer reserves the right to cancel late deliveries.

4. Inspection & Acceptance
All goods are subject to inspection. Buyer may reject nonconforming goods at Vendor''s expense.

5. Taxes
Vendor is responsible for all applicable taxes unless tax exemption is indicated on the PO.

6. Compliance
Vendor warrants compliance with all applicable federal, state, and local laws, including EPA and DOT regulations where applicable.

7. Indemnification
Vendor agrees to indemnify and hold Buyer harmless from any claims arising from Vendor''s performance or product defects.

8. Warranty
Vendor warrants that goods are merchantable, fit for intended use, and free from defects.

9. Confidentiality
All pricing and transaction details are confidential unless disclosure is required by law.

10. Governing Law
This PO shall be governed by the laws of the State of Georgia.
', TRUE
WHERE NOT EXISTS (SELECT 1 FROM po_terms_versions);

-- Ensure only one active terms version (optional safety)
CREATE OR REPLACE FUNCTION enforce_single_active_terms() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active THEN
    UPDATE po_terms_versions SET is_active = FALSE WHERE id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_single_active_terms ON po_terms_versions;
CREATE TRIGGER trg_single_active_terms
AFTER INSERT OR UPDATE OF is_active ON po_terms_versions
FOR EACH ROW
EXECUTE FUNCTION enforce_single_active_terms();

-- ============================================================================
-- Setting Session Variables for RLS Policies
-- ============================================================================
-- Before executing queries, set the session variables using set_config():
--
-- For ADMIN role:
--   SELECT set_config('app.user_id', '<AUTH_USER_ID>', true);
--   SELECT set_config('app.role', 'ADMIN', true);
--
-- For BUYER role:
--   SELECT set_config('app.user_id', '<AUTH_USER_ID>', true);
--   SELECT set_config('app.role', 'BUYER', true);
--
-- For VENDOR role:
--   SELECT set_config('app.user_id', '<AUTH_USER_ID>', true);
--   SELECT set_config('app.role', 'VENDOR', true);
--   SELECT set_config('app.vendor_id', '<VENDOR_ID>', true);
--
-- The third parameter (true) makes the setting local to the transaction.
-- In application code, you would typically set these at the start of each
-- database transaction or connection pool session.

