import { describe, it, expect } from 'vitest';
import {
  getAllPermissions,
  isValidPermission,
  getPermissionLabel,
  getPermissionCategory,
  getEffectivePermissions,
  Permission,
} from '@/lib/permissions';

describe('permissions utility functions', () => {
  describe('getAllPermissions', () => {
    it('should return all available permissions', () => {
      const permissions = getAllPermissions();
      expect(permissions).toBeInstanceOf(Array);
      expect(permissions.length).toBeGreaterThan(0);
      expect(permissions).toContain('products.view');
      expect(permissions).toContain('orders.view');
      expect(permissions).toContain('users.view');
    });

    it('should return unique permissions', () => {
      const permissions = getAllPermissions();
      const uniquePermissions = [...new Set(permissions)];
      expect(permissions.length).toBe(uniquePermissions.length);
    });
  });

  describe('isValidPermission', () => {
    it('should return true for valid permissions', () => {
      expect(isValidPermission('products.view')).toBe(true);
      expect(isValidPermission('orders.update_status')).toBe(true);
      expect(isValidPermission('admins.manage_permissions')).toBe(true);
    });

    it('should return false for invalid permissions', () => {
      expect(isValidPermission('invalid.permission')).toBe(false);
      expect(isValidPermission('products.invalid')).toBe(false);
      expect(isValidPermission('')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isValidPermission('products')).toBe(false);
      expect(isValidPermission('products.')).toBe(false);
    });
  });

  describe('getPermissionLabel', () => {
    it('should return correct label for valid permissions', () => {
      expect(getPermissionLabel('products.view')).toBe('View products');
      expect(getPermissionLabel('products.create')).toBe('Create products');
      expect(getPermissionLabel('orders.refund')).toBe('Process refunds');
    });

    it('should return label for all permission types', () => {
      const allPermissions = getAllPermissions();
      allPermissions.forEach((permission) => {
        const label = getPermissionLabel(permission);
        expect(label).toBeDefined();
        expect(label.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getPermissionCategory', () => {
    it('should return correct category for permissions', () => {
      expect(getPermissionCategory('products.view')).toBe('products');
      expect(getPermissionCategory('orders.update_status')).toBe('orders');
      expect(getPermissionCategory('users.delete')).toBe('users');
      expect(getPermissionCategory('admins.create')).toBe('admins');
    });

    it('should extract category from all permissions', () => {
      const allPermissions = getAllPermissions();
      allPermissions.forEach((permission) => {
        const category = getPermissionCategory(permission);
        expect(category).toBeDefined();
        expect(category.length).toBeGreaterThan(0);
        expect(permission.startsWith(category)).toBe(true);
      });
    });
  });

  describe('getEffectivePermissions', () => {
    it('should return base role permissions when no custom permissions', () => {
      const rolePermissions: Permission[] = ['products.view', 'products.create'];
      const customPermissions = { grant: [], revoke: [] };
      
      const result = getEffectivePermissions(rolePermissions, customPermissions);
      
      expect(result).toEqual(['products.view', 'products.create']);
    });

    it('should add granted permissions', () => {
      const rolePermissions: Permission[] = ['products.view'];
      const customPermissions = { 
        grant: ['products.create', 'products.update'] as Permission[], 
        revoke: [] 
      };
      
      const result = getEffectivePermissions(rolePermissions, customPermissions);
      
      expect(result).toContain('products.view');
      expect(result).toContain('products.create');
      expect(result).toContain('products.update');
      expect(result.length).toBe(3);
    });

    it('should remove revoked permissions', () => {
      const rolePermissions: Permission[] = ['products.view', 'products.create', 'products.update'];
      const customPermissions = { 
        grant: [], 
        revoke: ['products.create'] as Permission[] 
      };
      
      const result = getEffectivePermissions(rolePermissions, customPermissions);
      
      expect(result).toContain('products.view');
      expect(result).toContain('products.update');
      expect(result).not.toContain('products.create');
      expect(result.length).toBe(2);
    });

    it('should handle both grants and revokes', () => {
      const rolePermissions: Permission[] = ['products.view', 'products.create'];
      const customPermissions = { 
        grant: ['orders.view', 'orders.update_status'] as Permission[], 
        revoke: ['products.create'] as Permission[] 
      };
      
      const result = getEffectivePermissions(rolePermissions, customPermissions);
      
      expect(result).toContain('products.view');
      expect(result).toContain('orders.view');
      expect(result).toContain('orders.update_status');
      expect(result).not.toContain('products.create');
      expect(result.length).toBe(3);
    });

    it('should ignore invalid granted permissions', () => {
      const rolePermissions: Permission[] = ['products.view'];
      const customPermissions = {
        grant: ['invalid.permission' as Permission, 'products.create' as Permission],
        revoke: [] as Permission[]
      };

      const result = getEffectivePermissions(rolePermissions, customPermissions);
      
      expect(result).toContain('products.view');
      expect(result).toContain('products.create');
      expect(result).not.toContain('invalid.permission');
    });

    it('should not duplicate permissions', () => {
      const rolePermissions: Permission[] = ['products.view', 'products.create'];
      const customPermissions = { 
        grant: ['products.view', 'products.create'] as Permission[], 
        revoke: [] 
      };
      
      const result = getEffectivePermissions(rolePermissions, customPermissions);
      
      expect(result.length).toBe(2);
      expect(result.filter(p => p === 'products.view').length).toBe(1);
      expect(result.filter(p => p === 'products.create').length).toBe(1);
    });

    it('should handle empty role permissions', () => {
      const rolePermissions: Permission[] = [];
      const customPermissions = { 
        grant: ['products.view'] as Permission[], 
        revoke: [] 
      };
      
      const result = getEffectivePermissions(rolePermissions, customPermissions);
      
      expect(result).toEqual(['products.view']);
    });

    it('should handle revoking a permission that was granted', () => {
      const rolePermissions: Permission[] = ['products.view'];
      const customPermissions = { 
        grant: ['products.create'] as Permission[], 
        revoke: ['products.create'] as Permission[] 
      };
      
      const result = getEffectivePermissions(rolePermissions, customPermissions);
      
      expect(result).toContain('products.view');
      expect(result).not.toContain('products.create');
    });
  });
});

