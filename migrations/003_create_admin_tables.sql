-- Admin roles table
CREATE TABLE IF NOT EXISTS admin_roles (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]',
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User admin assignments (links users to roles + custom permissions)
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES admin_roles(id),
  custom_permissions JSONB DEFAULT '{"grant": [], "revoke": []}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Full audit log
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  admin_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  before_value JSONB,
  after_value JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON admin_users(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_role_id ON admin_users(role_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_user_id ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_resource ON admin_audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);

-- Insert default system roles
INSERT INTO admin_roles (id, name, description, permissions, is_system) VALUES
  ('super-admin', 'Super Admin', 'Full access to all features', '["products.view", "products.create", "products.update", "products.delete", "products.manage_inventory", "orders.view", "orders.update_status", "orders.refund", "orders.cancel", "orders.export", "users.view", "users.update", "users.ban", "users.delete", "users.view_orders", "admins.view", "admins.create", "admins.update", "admins.delete", "admins.manage_permissions", "content.view", "content.create", "content.update", "content.delete", "content.publish", "settings.view", "settings.update_shipping", "settings.update_tax", "settings.update_payment", "analytics.view_sales", "analytics.view_traffic", "analytics.export_reports"]', true),
  ('admin', 'Admin', 'Administrative access without system settings', '["products.view", "products.create", "products.update", "products.delete", "products.manage_inventory", "orders.view", "orders.update_status", "orders.refund", "orders.cancel", "orders.export", "users.view", "users.update", "users.ban", "users.delete", "users.view_orders", "admins.view", "admins.create", "admins.update", "content.view", "content.create", "content.update", "content.delete", "content.publish", "analytics.view_sales", "analytics.view_traffic", "analytics.export_reports"]', true),
  ('support', 'Support', 'Customer support access', '["products.view", "orders.view", "orders.update_status", "users.view", "users.view_orders"]', true)
ON CONFLICT (id) DO NOTHING;

