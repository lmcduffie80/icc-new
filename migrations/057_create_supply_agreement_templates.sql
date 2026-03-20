-- Supply Agreement Template Management System
CREATE TABLE IF NOT EXISTS supply_agreement_templates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL DEFAULT 'Supply Agreement',
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  updated_by TEXT REFERENCES admin_users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Only one active version allowed
CREATE UNIQUE INDEX IF NOT EXISTS idx_supply_agreement_active ON supply_agreement_templates(is_active) WHERE is_active = true;

-- Indexes for queries
CREATE INDEX IF NOT EXISTS idx_supply_agreement_updated_at ON supply_agreement_templates(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_supply_agreement_version ON supply_agreement_templates(version DESC);

-- Seed with current default supply agreement language
INSERT INTO supply_agreement_templates (title, content, version, is_active)
VALUES (
  'Supply Agreement',
  'SUPPLY AGREEMENT

This Supply Agreement ("Agreement") is entered into between Innovative CropCare, LLC ("ICC") and the Supplier identified herein ("Supplier"), collectively referred to as the "Parties."

1. SCOPE OF AGREEMENT

Supplier agrees to supply the products listed in the Products and Pricing Schedule below to ICC under the terms and conditions set forth in this Agreement. ICC shall make such products available for resale through its platform and distribution channels.

2. PRICING AND PAYMENT

All product pricing, margin splits, and cost structures are defined in the Products and Pricing Schedule attached to this Agreement. ICC agrees to pay Supplier the agreed-upon supplier cost for each product sold. Payment terms are Net 30 from date of invoice unless otherwise agreed upon in writing.

3. PRODUCT LIABILITY AND PERFORMANCE

Supplier acknowledges and agrees that Innovative CropCare, LLC shall not be held liable for any product supplied under this Agreement, including but not limited to product defects, failures, or underperformance. In the event that any product does not perform as expected in the field, Supplier agrees to, at the sole discretion of Innovative CropCare, LLC, either (a) replace the non-performing product at no additional cost to Innovative CropCare, LLC, or (b) reimburse Innovative CropCare, LLC in full for any such non-performing product. This obligation shall survive the termination or expiration of this Agreement.

4. PRODUCT QUALITY AND COMPLIANCE

Supplier warrants that all products supplied under this Agreement shall conform to their product labels, specifications, and all applicable federal, state, and local laws and regulations. Supplier shall maintain all necessary registrations, licenses, and permits required for the manufacture, sale, and distribution of its products.

5. TERM AND TERMINATION

This Agreement shall be effective as of the Effective Date and shall remain in effect until the Expiry Date, unless terminated earlier by either Party with thirty (30) days written notice. Either Party may terminate this Agreement immediately upon material breach by the other Party.

6. CONFIDENTIALITY

Both Parties agree to keep confidential all proprietary business information, pricing structures, margin details, and customer data shared under this Agreement. This confidentiality obligation shall survive termination of this Agreement for a period of two (2) years.

7. INDEMNIFICATION

Supplier agrees to indemnify and hold harmless ICC, its officers, directors, employees, and agents from and against any and all claims, damages, losses, costs, and expenses (including reasonable attorneys'' fees) arising out of or related to Supplier''s products, including but not limited to product liability claims, regulatory violations, and intellectual property infringement.

8. GOVERNING LAW

This Agreement shall be governed by and construed in accordance with the laws of the State in which ICC is incorporated, without regard to its conflict of laws provisions.

9. ENTIRE AGREEMENT

This Agreement, including the Products and Pricing Schedule, constitutes the entire agreement between the Parties and supersedes all prior negotiations, representations, or agreements relating to its subject matter.',
  1,
  true
) ON CONFLICT DO NOTHING;
