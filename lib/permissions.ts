// All available permissions in the system
export const PERMISSIONS = {
  // Products
  'products.view': 'View products',
  'products.create': 'Create products',
  'products.update': 'Update products',
  'products.delete': 'Delete products',
  'products.manage_inventory': 'Manage product inventory',
  'products.approve_margin': 'Approve/reject margin splits',

  // Orders
  'orders.view': 'View orders',
  'orders.update': 'Update orders',
  'orders.update_status': 'Update order status',
  'orders.refund': 'Process refunds',
  'orders.cancel': 'Cancel orders',
  'orders.export': 'Export order data',

  // Users
  'users.view': 'View users',
  'users.create': 'Create customer accounts',
  'users.update': 'Update user information',
  'users.delete': 'Delete users',
  'users.view_orders': 'View user orders',

  // Admins
  'admins.view': 'View admin users',
  'admins.create': 'Create admin users',
  'admins.update': 'Update admin users',
  'admins.delete': 'Delete admin users',
  'admins.manage_permissions': 'Manage admin permissions',

  // Content
  'content.view': 'View content',
  'content.create': 'Create content',
  'content.update': 'Update content',
  'content.delete': 'Delete content',
  'content.publish': 'Publish content',

  // Settings
  'settings.view': 'View settings',
  'settings.view_tax': 'View tax rates',
  'settings.update_store_info': 'Update store information',
  'settings.update_shipping': 'Update shipping settings',
  'settings.update_tax': 'Update tax settings',
  'settings.update_payment': 'Update payment settings',
  'settings.update_categories': 'Update product categories',
  'settings.update_units_of_measure': 'Update units of measure',
  'settings.manage': 'Manage system settings and terms',

  // Terms and Conditions
  'terms.view': 'View terms and conditions',
  'terms.update': 'Update terms and conditions',

  // Analytics
  'analytics.view_sales': 'View sales analytics',
  'analytics.view_traffic': 'View traffic analytics',
  'analytics.export_reports': 'Export reports',

  // Reports
  'reports.view_overview': 'View financial overview report',
  'reports.view_profit_loss': 'View profit & loss statement',
  'reports.view_balance_sheet': 'View balance sheet',
  'reports.view_customers': 'View customer reports',
  'reports.view_transactions': 'View inventory transaction history (MB51)',

  // Contact Submissions
  'contact.view': 'View contact submissions',
  'contact.update': 'Update status and assignment',
  'contact.reply': 'Reply to contact submissions',
  'contact.delete': 'Delete contact submissions',

  // Contracts
  'contracts.view': 'View supplier contracts',
  'contracts.sign': 'Sign supplier contracts (Signature Authority)',
  'contracts.manage_template': 'Edit Supply Agreement template language',
  'contracts.delete': 'Delete supplier contracts',

  // Innovative Crop Planning
  'acrepack.view': 'View Crop Planning programs',
  'acrepack.manage_programs': 'Create, edit, and delete Crop Planning programs and passes',
  'acrepack.manage_products': 'Assign and configure products in Crop Planning passes',
} as const;

export type Permission = keyof typeof PERMISSIONS;

// Permission categories for grouping in UI
export const PERMISSION_CATEGORIES = {
  products: {
    label: 'Products',
    permissions: [
      'products.view',
      'products.create',
      'products.update',
      'products.delete',
      'products.manage_inventory',
      'products.approve_margin',
    ] as Permission[],
  },
  orders: {
    label: 'Orders',
    permissions: [
      'orders.view',
      'orders.update',
      'orders.update_status',
      'orders.refund',
      'orders.cancel',
      'orders.export',
    ] as Permission[],
  },
  users: {
    label: 'Users',
    permissions: [
      'users.view',
      'users.create',
      'users.update',
      'users.delete',
      'users.view_orders',
    ] as Permission[],
  },
  admins: {
    label: 'Admins',
    permissions: [
      'admins.view',
      'admins.create',
      'admins.update',
      'admins.delete',
      'admins.manage_permissions',
    ] as Permission[],
  },
  content: {
    label: 'Content',
    permissions: [
      'content.view',
      'content.create',
      'content.update',
      'content.delete',
      'content.publish',
    ] as Permission[],
  },
  settings: {
    label: 'Settings',
    permissions: [
      'settings.view',
      'settings.view_tax',
      'settings.update_store_info',
      'settings.update_shipping',
      'settings.update_tax',
      'settings.update_payment',
      'settings.update_categories',
      'settings.update_units_of_measure',
      'settings.manage',
    ] as Permission[],
  },
  terms: {
    label: 'Terms & Conditions',
    permissions: [
      'terms.view',
      'terms.update',
    ] as Permission[],
  },
  analytics: {
    label: 'Analytics',
    permissions: [
      'analytics.view_sales',
      'analytics.view_traffic',
      'analytics.export_reports',
    ] as Permission[],
  },
  reports: {
    label: 'Reports',
    permissions: [
      'reports.view_overview',
      'reports.view_profit_loss',
      'reports.view_balance_sheet',
      'reports.view_customers',
      'reports.view_transactions',
    ] as Permission[],
  },
  contact: {
    label: 'Contact Submissions',
    permissions: [
      'contact.view',
      'contact.update',
      'contact.reply',
      'contact.delete',
    ] as Permission[],
  },
  contracts: {
    label: 'Contracts',
    permissions: [
      'contracts.view',
      'contracts.sign',
      'contracts.manage_template',
      'contracts.delete',
    ] as Permission[],
  },
  acrepack: {
    label: 'Crop Planning',
    permissions: [
      'acrepack.view',
      'acrepack.manage_programs',
      'acrepack.manage_products',
    ] as Permission[],
  },
} as const;

// Get all permission keys as an array
export function getAllPermissions(): Permission[] {
  return Object.keys(PERMISSIONS) as Permission[];
}

// Check if a permission string is valid
export function isValidPermission(permission: string): permission is Permission {
  return permission in PERMISSIONS;
}

// Get permission label
export function getPermissionLabel(permission: Permission): string {
  return PERMISSIONS[permission];
}

// Get category for a permission
export function getPermissionCategory(permission: Permission): string {
  return permission.split('.')[0];
}

// Calculate effective permissions from role + custom grants/revokes
export function getEffectivePermissions(
  rolePermissions: Permission[],
  customPermissions: { grant: Permission[]; revoke: Permission[] }
): Permission[] {
  const permissions = new Set(rolePermissions);

  // Add granted permissions
  for (const perm of customPermissions.grant) {
    if (isValidPermission(perm)) {
      permissions.add(perm);
    }
  }

  // Remove revoked permissions
  for (const perm of customPermissions.revoke) {
    permissions.delete(perm);
  }

  return Array.from(permissions);
}
