-- Label templates table for reusable product labels
CREATE TABLE IF NOT EXISTS label_templates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  label_image_url TEXT NOT NULL,
  short_description TEXT NOT NULL,
  long_description TEXT,
  approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  created_by_admin_id TEXT,
  approved_by_admin_id TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_label_templates_product_name ON label_templates(product_name);
CREATE INDEX idx_label_templates_approval_status ON label_templates(approval_status);
CREATE INDEX idx_label_templates_is_active ON label_templates(is_active);

-- Add label_template_id to products table to track which template was used
ALTER TABLE products ADD COLUMN IF NOT EXISTS label_template_id TEXT REFERENCES label_templates(id) ON DELETE SET NULL;
CREATE INDEX idx_products_label_template_id ON products(label_template_id);

-- Add comments for documentation
COMMENT ON TABLE label_templates IS 'Reusable label templates that can be selected by suppliers when creating products';
COMMENT ON COLUMN label_templates.product_name IS 'Product name/type this template applies to';
COMMENT ON COLUMN label_templates.template_name IS 'Descriptive name for this template';
COMMENT ON COLUMN label_templates.label_image_url IS 'S3 URL of the label image';
COMMENT ON COLUMN label_templates.short_description IS 'Short product description (auto-fills product.description)';
COMMENT ON COLUMN label_templates.long_description IS 'Long product description (auto-fills product.full_description)';
COMMENT ON COLUMN label_templates.approval_status IS 'Admin approval status: pending, approved, or rejected';
COMMENT ON COLUMN label_templates.is_active IS 'Soft delete flag - inactive templates are hidden';
COMMENT ON COLUMN products.label_template_id IS 'Reference to the label template used when creating this product';
