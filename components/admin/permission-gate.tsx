'use client';

import { Permission } from '@/lib/permissions';
import { createContext, useContext, ReactNode } from 'react';

// Context for providing permissions to child components
const PermissionsContext = createContext<Permission[]>([]);

export function PermissionsProvider({
  permissions,
  children,
}: {
  permissions: Permission[];
  children: ReactNode;
}) {
  return (
    <PermissionsContext.Provider value={permissions}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}

export function useHasPermission(permission: Permission): boolean {
  const permissions = usePermissions();
  return permissions.includes(permission);
}

export function useHasAnyPermission(requiredPermissions: Permission[]): boolean {
  const permissions = usePermissions();
  return requiredPermissions.some((p) => permissions.includes(p));
}

export function useHasAllPermissions(requiredPermissions: Permission[]): boolean {
  const permissions = usePermissions();
  return requiredPermissions.every((p) => permissions.includes(p));
}

// Component that conditionally renders children based on permissions
interface PermissionGateProps {
  permission?: Permission;
  permissions?: Permission[];
  requireAll?: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}

export function PermissionGate({
  permission,
  permissions: requiredPermissions,
  requireAll = false,
  fallback = null,
  children,
}: PermissionGateProps) {
  const userPermissions = usePermissions();

  // Single permission check
  if (permission) {
    if (!userPermissions.includes(permission)) {
      return <>{fallback}</>;
    }
    return <>{children}</>;
  }

  // Multiple permissions check
  if (requiredPermissions && requiredPermissions.length > 0) {
    const hasPermission = requireAll
      ? requiredPermissions.every((p) => userPermissions.includes(p))
      : requiredPermissions.some((p) => userPermissions.includes(p));

    if (!hasPermission) {
      return <>{fallback}</>;
    }
  }

  return <>{children}</>;
}

