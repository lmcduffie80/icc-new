-- Terms and Conditions Management System
CREATE TABLE IF NOT EXISTS terms_and_conditions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL DEFAULT 'Terms and Conditions',
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  updated_by TEXT REFERENCES admin_users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Only one active version allowed
CREATE UNIQUE INDEX IF NOT EXISTS idx_terms_active ON terms_and_conditions(is_active) WHERE is_active = true;

-- Index for queries
CREATE INDEX IF NOT EXISTS idx_terms_updated_at ON terms_and_conditions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_terms_version ON terms_and_conditions(version DESC);

-- Seed with current terms content
INSERT INTO terms_and_conditions (title, content, version, is_active)
VALUES (
  'Terms and Conditions',
  '1. ACCEPTANCE OF ORDER

These terms and conditions ("Terms") apply to all purchase orders issued by Innovative CropCare, LLC ("Buyer"). By accepting this purchase order, the vendor ("Seller") agrees to be bound by these Terms. Any additional or different terms proposed by Seller are hereby rejected unless expressly agreed to in writing by Buyer.

2. DELIVERY

Seller shall deliver all goods in accordance with the delivery schedule specified in the purchase order. Time is of the essence. If Seller fails to deliver on time, Buyer may cancel this order or any part hereof, purchase substitute goods elsewhere, and hold Seller accountable for all resulting damages.

All deliveries shall be made F.O.B. destination, freight prepaid and allowed, unless otherwise specified. Seller shall bear all risk of loss until goods are delivered to Buyer''s designated location.

3. INSPECTION AND ACCEPTANCE

All goods are subject to Buyer''s inspection and acceptance. Buyer may reject any goods that do not conform to specifications, are defective, or are not in accordance with this order. Rejected goods may be returned to Seller at Seller''s expense, or Seller may be required to correct or replace them promptly.

4. PRICE AND PAYMENT

Prices specified in this purchase order are fixed and may not be increased without Buyer''s written consent. Payment terms are as specified in the purchase order. Buyer''s payment shall not constitute acceptance of goods that do not conform to this order.

5. WARRANTIES

Seller warrants that all goods:
- Conform to all specifications, drawings, samples, or other descriptions furnished or referenced in this order
- Are of merchantable quality and fit for the particular purpose for which they are intended
- Are free from defects in materials and workmanship
- Comply with all applicable laws, regulations, and industry standards
- Do not infringe any patent, copyright, trademark, or other intellectual property right

All warranties shall survive delivery and inspection and shall not be deemed waived by payment or acceptance.

6. INDEMNIFICATION

Seller shall indemnify, defend, and hold harmless Buyer and its officers, directors, employees, and agents from and against all claims, damages, losses, liabilities, and expenses (including reasonable attorneys'' fees) arising out of or relating to:
- Any breach of Seller''s warranties
- Any defect in goods or services provided
- Any infringement of intellectual property rights
- Any violation of applicable laws or regulations
- Any injury to person or property caused by the goods

7. INSURANCE

Seller shall maintain comprehensive general liability insurance, product liability insurance, and workers'' compensation insurance in amounts and with carriers satisfactory to Buyer. Seller shall provide certificates of insurance upon request.

8. TITLE AND RISK OF LOSS

Title to goods shall pass to Buyer upon delivery and acceptance. Risk of loss shall remain with Seller until goods are delivered to Buyer''s designated location, inspected, and accepted by Buyer.

9. COMPLIANCE WITH LAWS

Seller warrants that all goods and services comply with all applicable federal, state, and local laws, regulations, and ordinances, including but not limited to environmental, safety, and labor laws. Seller shall obtain all necessary licenses and permits.

10. CONFIDENTIALITY

Seller shall treat all information received from Buyer as confidential and shall not disclose such information to any third party without Buyer''s prior written consent. This obligation shall survive termination of this order.

11. TERMINATION

Buyer may terminate this order, in whole or in part, at any time by written notice to Seller. Upon termination, Seller shall stop work immediately and Buyer shall pay Seller for goods delivered and accepted prior to termination, plus any reasonable costs incurred by Seller in performance of work prior to termination.

12. GOVERNING LAW

This purchase order shall be governed by and construed in accordance with the laws of the State of Georgia, without regard to its conflict of laws principles. Any disputes shall be resolved in the courts of Tift County, Georgia.

13. ENTIRE AGREEMENT

This purchase order, together with these Terms, constitutes the entire agreement between Buyer and Seller and supersedes all prior agreements, understandings, or communications, whether written or oral. This order may only be modified by a written amendment signed by both parties.

14. RETURNS POLICY

All sales are final, pending product performance. Innovative CropCare, LLC ("Buyer") stands behind the quality and performance of all products purchased through this order.

In the event that a product fails to perform as specified or does not meet the agreed-upon standards, any returns or product replacements must be coordinated and approved through Innovative CropCare, LLC. Buyer will work directly with the Supplier to resolve any performance issues and facilitate any necessary returns or replacements.

No returns will be accepted without prior written authorization from Innovative CropCare, LLC. All return requests must include detailed documentation of the performance issue and be submitted within a reasonable timeframe after discovery of the defect or performance failure.',
  1,
  true
) ON CONFLICT DO NOTHING;
