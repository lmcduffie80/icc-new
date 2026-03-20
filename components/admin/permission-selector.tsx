'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, RotateCcw, Shield, ShieldCheck, ShieldX } from 'lucide-react';
import { Permission, PERMISSION_CATEGORIES, PERMISSIONS } from '@/lib/permissions';
import { AdminRole } from '@/lib/admin-auth';

interface PermissionSelectorProps {
  roles: AdminRole[];
  selectedRoleId: string;
  onRoleChange: (roleId: string) => void;
  selectedPermissions: Permission[];
  onPermissionsChange: (permissions: Permission[]) => void;
  customPermissions: { grant: Permission[]; revoke: Permission[] };
  onCustomPermissionsChange: (custom: { grant: Permission[]; revoke: Permission[] }) => void;
}

export function PermissionSelector({
  roles,
  selectedRoleId,
  onRoleChange,
  selectedPermissions,
  onPermissionsChange,
  customPermissions,
  onCustomPermissionsChange,
}: PermissionSelectorProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  
  const selectedRole = roles.find(r => r.id === selectedRoleId);
  const rolePermissions = selectedRole?.permissions || [];
  
  // Calculate effective permissions from role + customizations
  const calculateEffectivePermissions = useCallback((
    rolePerms: Permission[],
    custom: { grant: Permission[]; revoke: Permission[] }
  ): Permission[] => {
    const perms = new Set(rolePerms);
    for (const p of custom.grant) perms.add(p);
    for (const p of custom.revoke) perms.delete(p);
    return Array.from(perms);
  }, []);

  // When role changes, recalculate permissions
  useEffect(() => {
    const newRole = roles.find(r => r.id === selectedRoleId);
    if (newRole) {
      // Reset custom permissions when role changes
      onCustomPermissionsChange({ grant: [], revoke: [] });
      onPermissionsChange([...newRole.permissions]);
    }
  }, [selectedRoleId, roles, onCustomPermissionsChange, onPermissionsChange]);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const togglePermission = (permission: Permission) => {
    const isCurrentlyEnabled = selectedPermissions.includes(permission);
    const isInRole = rolePermissions.includes(permission);
    
    let newGrant = [...customPermissions.grant];
    let newRevoke = [...customPermissions.revoke];
    
    if (isCurrentlyEnabled) {
      // Disabling this permission
      if (isInRole) {
        // Permission is from role, add to revoke list
        if (!newRevoke.includes(permission)) {
          newRevoke.push(permission);
        }
        // Remove from grant if it was there
        newGrant = newGrant.filter(p => p !== permission);
      } else {
        // Permission was custom granted, remove from grant list
        newGrant = newGrant.filter(p => p !== permission);
      }
    } else {
      // Enabling this permission
      if (isInRole) {
        // Permission is from role but was revoked, remove from revoke list
        newRevoke = newRevoke.filter(p => p !== permission);
      } else {
        // Permission is not from role, add to grant list
        if (!newGrant.includes(permission)) {
          newGrant.push(permission);
        }
      }
      // Remove from revoke if it was there
      newRevoke = newRevoke.filter(p => p !== permission);
    }
    
    const newCustom = { grant: newGrant, revoke: newRevoke };
    onCustomPermissionsChange(newCustom);
    onPermissionsChange(calculateEffectivePermissions(rolePermissions, newCustom));
  };

  const resetToDefaults = () => {
    onCustomPermissionsChange({ grant: [], revoke: [] });
    onPermissionsChange([...rolePermissions]);
  };

  const hasCustomizations = customPermissions.grant.length > 0 || customPermissions.revoke.length > 0;
  
  const getPermissionStatus = (permission: Permission): 'role' | 'granted' | 'revoked' | 'disabled' => {
    const isEnabled = selectedPermissions.includes(permission);
    const isInRole = rolePermissions.includes(permission);
    
    if (isEnabled) {
      if (customPermissions.grant.includes(permission)) return 'granted';
      if (isInRole) return 'role';
    } else {
      if (customPermissions.revoke.includes(permission)) return 'revoked';
    }
    return 'disabled';
  };

  const getCategoryStats = (permissions: Permission[]) => {
    const enabled = permissions.filter(p => selectedPermissions.includes(p)).length;
    const total = permissions.length;
    const hasCustom = permissions.some(p => 
      customPermissions.grant.includes(p) || customPermissions.revoke.includes(p)
    );
    return { enabled, total, hasCustom };
  };

  return (
    <div className="space-y-6">
      {/* Role Selection */}
      <div>
        <p className="block text-sm font-medium text-slate-700 mb-2">
          Select Base Role *
        </p>
        <p className="text-sm text-slate-500 mb-3">
          Choose a role as a starting point, then customize individual permissions below.
        </p>
        <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Base role selection">
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => onRoleChange(role.id)}
              className={`rounded-lg border p-4 text-left transition-colors ${
                selectedRoleId === role.id
                  ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className="font-medium text-slate-900">{role.name}</p>
              <p className="mt-1 text-sm text-slate-500">{role.description}</p>
              <p className="mt-2 text-xs text-slate-400">
                {role.permissions.length} permissions
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Permission Customization */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="block text-sm font-medium text-slate-700">
              Customize Permissions
            </p>
            <p className="text-sm text-slate-500">
              Fine-tune access by enabling or disabling specific permissions.
            </p>
          </div>
          {hasCustomizations && (
            <button
              type="button"
              onClick={resetToDefaults}
              className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to Defaults
            </button>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
            <span>From role</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-blue-100 border border-blue-400" />
            <span>Custom granted</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-amber-100 border border-amber-400" />
            <span>Custom revoked</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-slate-100 border border-slate-200" />
            <span>Disabled</span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 divide-y divide-slate-200">
          {Object.entries(PERMISSION_CATEGORIES).map(([key, category]) => {
            const isExpanded = expandedCategories.has(key);
            const stats = getCategoryStats(category.permissions);
            
            return (
              <div key={key}>
                <button
                  type="button"
                  onClick={() => toggleCategory(key)}
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    )}
                    <Shield className="h-4 w-4 text-slate-500" />
                    <span className="font-medium text-slate-900">{category.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {stats.hasCustom && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Customized
                      </span>
                    )}
                    <span className="text-sm text-slate-500">
                      {stats.enabled}/{stats.total}
                    </span>
                  </div>
                </button>
                
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 bg-slate-50">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {category.permissions.map((permission) => {
                        const status = getPermissionStatus(permission);
                        const isEnabled = selectedPermissions.includes(permission);
                        
                        return (
                          <label
                            key={permission}
                            className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                              status === 'role'
                                ? 'bg-emerald-50 border-emerald-200'
                                : status === 'granted'
                                ? 'bg-blue-50 border-blue-300'
                                : status === 'revoked'
                                ? 'bg-amber-50 border-amber-300'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={() => togglePermission(permission)}
                              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {status === 'granted' && (
                                  <ShieldCheck className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                )}
                                {status === 'revoked' && (
                                  <ShieldX className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                                )}
                                <span className="text-sm font-medium text-slate-700 truncate">
                                  {PERMISSIONS[permission]}
                                </span>
                              </div>
                              <span className="text-xs text-slate-500 font-mono">
                                {permission}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      {hasCustomizations && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
          <h4 className="text-sm font-medium text-slate-900 mb-2">Customization Summary</h4>
          <div className="space-y-2 text-sm">
            {customPermissions.grant.length > 0 && (
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-medium text-blue-700">Added:</span>{' '}
                  <span className="text-slate-600">
                    {customPermissions.grant.map(p => PERMISSIONS[p]).join(', ')}
                  </span>
                </div>
              </div>
            )}
            {customPermissions.revoke.length > 0 && (
              <div className="flex items-start gap-2">
                <ShieldX className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-medium text-amber-700">Removed:</span>{' '}
                  <span className="text-slate-600">
                    {customPermissions.revoke.map(p => PERMISSIONS[p]).join(', ')}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

