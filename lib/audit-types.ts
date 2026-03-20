// Shared audit types and utilities - safe for client components

export interface AuditLogEntry {
  id: string;
  admin_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  // Joined fields
  admin_email?: string;
  admin_name?: string;
}

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'status_change'
  | 'refund'
  | 'login'
  | 'permission_change'
  | 'role_change'
  | 'publish'
  | 'unpublish'
  | 'update_shipping';

export type ResourceType =
  | 'product'
  | 'order'
  | 'user'
  | 'admin_user'
  | 'admin_role'
  | 'supplier_user'
  | 'content'
  | 'settings'
  | 'tax_rate'
  | 'warehouse';

export interface AuditLogFilter {
  adminUserId?: string;
  action?: AuditAction;
  resourceType?: ResourceType;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// Format audit action for display
export function formatAuditAction(action: AuditAction, resourceType: ResourceType): string {
  const actionLabels: Record<AuditAction, string> = {
    create: 'Created',
    update: 'Updated',
    delete: 'Deleted',
    status_change: 'Changed status of',
    refund: 'Refunded',
    login: 'Logged in',
    permission_change: 'Changed permissions for',
    role_change: 'Changed role of',
    publish: 'Published',
    unpublish: 'Unpublished',
    update_shipping: 'Updated shipping for',
  };

  const resourceLabels: Record<ResourceType, string> = {
    product: 'product',
    order: 'order',
    user: 'user',
    admin_user: 'admin user',
    admin_role: 'admin role',
    supplier_user: 'supplier user',
    content: 'content',
    settings: 'settings',
    tax_rate: 'tax rate',
    warehouse: 'warehouse',
  };

  return `${actionLabels[action]} ${resourceLabels[resourceType]}`;
}

