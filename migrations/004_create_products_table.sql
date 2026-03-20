-- Products table (migrating from hardcoded data)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  original_price DECIMAL(10,2),
  image TEXT,
  in_stock BOOLEAN DEFAULT true,
  inventory_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Site content (banners, announcements, pages)
CREATE TABLE IF NOT EXISTS site_content (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type TEXT NOT NULL CHECK (type IN ('banner', 'announcement', 'page')),
  title TEXT,
  slug TEXT UNIQUE,
  content JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  starts_at TIMESTAMP WITH TIME ZONE,
  ends_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Site settings (key-value store)
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for products
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_in_stock ON products(in_stock);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);

-- Indexes for site content
CREATE INDEX IF NOT EXISTS idx_site_content_type ON site_content(type);
CREATE INDEX IF NOT EXISTS idx_site_content_is_active ON site_content(is_active);
CREATE INDEX IF NOT EXISTS idx_site_content_slug ON site_content(slug);

-- Seed initial products from hardcoded data
INSERT INTO products (id, name, category, description, price, original_price, image, in_stock, inventory_count) VALUES
  ('1', 'Premium Corn Seed - Hybrid 5000', 'Seeds', 'High-yield hybrid corn seed with excellent drought resistance and disease tolerance.', 299.99, 349.99, 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400&h=400&fit=crop', true, 100),
  ('2', 'Organic Nitrogen Fertilizer', 'Fertilizers', 'Slow-release organic nitrogen fertilizer for sustainable crop nutrition.', 89.99, NULL, 'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?w=400&h=400&fit=crop', true, 250),
  ('3', 'Advanced Herbicide Solution', 'Pesticides', 'Broad-spectrum herbicide for effective weed control with minimal crop impact.', 149.99, NULL, 'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?w=400&h=400&fit=crop', true, 75),
  ('4', 'Precision Soil Moisture Sensor', 'Equipment', 'Smart sensor system for real-time soil moisture monitoring and irrigation optimization.', 449.99, 499.99, 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=400&fit=crop', true, 30),
  ('5', 'Soybean Seed - Elite Variety', 'Seeds', 'Premium soybean seed with superior protein content and yield potential.', 199.99, NULL, 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&h=400&fit=crop', true, 150),
  ('6', 'Complete NPK Fertilizer Blend', 'Fertilizers', 'Balanced NPK fertilizer blend optimized for crop growth and soil health.', 119.99, NULL, 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=400&fit=crop', false, 0),
  ('7', 'Biological Insect Control', 'Pesticides', 'Eco-friendly biological solution for pest management without harmful chemicals.', 79.99, NULL, 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=400&h=400&fit=crop', true, 200),
  ('8', 'Drip Irrigation Starter Kit', 'Irrigation', 'Complete drip irrigation system for efficient water delivery and conservation.', 599.99, NULL, 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400&h=400&fit=crop', true, 45),
  ('9', 'Winter Wheat Seed', 'Seeds', 'Hardy winter wheat variety with excellent cold tolerance and yield stability.', 179.99, NULL, 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=400&h=400&fit=crop', true, 120),
  ('10', 'Micronutrient Supplement', 'Fertilizers', 'Essential micronutrient blend for optimal plant health and productivity.', 64.99, NULL, 'https://images.unsplash.com/photo-1615671524827-c1fe3973b648?w=400&h=400&fit=crop', true, 300),
  ('11', 'Fungicide Treatment Pro', 'Pesticides', 'Professional-grade fungicide for preventing and treating crop diseases.', 189.99, NULL, 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400&h=400&fit=crop', true, 60),
  ('12', 'Smart Weather Station', 'Equipment', 'Advanced weather monitoring system with remote data access and alerts.', 799.99, NULL, 'https://images.unsplash.com/photo-1592210454359-9043f067919b?w=400&h=400&fit=crop', true, 25)
ON CONFLICT (id) DO NOTHING;

-- Seed initial site settings
INSERT INTO site_settings (key, value) VALUES
  ('shipping', '{"standard": {"name": "Standard Shipping", "price": 9.99, "days": "5-7"}, "express": {"name": "Express Shipping", "price": 19.99, "days": "2-3"}, "overnight": {"name": "Overnight Shipping", "price": 39.99, "days": "1"}, "free_threshold": 100}'),
  ('tax', '{"default_rate": 0.08, "rates_by_state": {}}'),
  ('payment', '{"stripe_enabled": true, "paypal_enabled": false}')
ON CONFLICT (key) DO NOTHING;

