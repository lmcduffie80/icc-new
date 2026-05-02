'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Permission } from '@/lib/permissions';
import { Trash2, Loader2, UserCheck } from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string;
}

interface UserActionsProps {
  user: User;
  permissions: Permission[];
}

export function UserActions({ user, permissions }: UserActionsProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [impersonating, setImpersonating] = useState(false);

  const canDelete = permissions.includes('users.delete');
  const canImpersonate = permissions.includes('users.view');

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.'))
      return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/admin/users');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  const handleImpersonate = async () => {
    setImpersonating(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/impersonate`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        window.location.href = data.redirectUrl;
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to start impersonation');
        setImpersonating(false);
      }
    } catch (error) {
      console.error('Error starting impersonation:', error);
      alert('Failed to start impersonation');
      setImpersonating(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {canImpersonate && (
        <button
          onClick={handleImpersonate}
          disabled={impersonating}
          className="inline-flex items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50 hover:cursor-pointer"
        >
          {impersonating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserCheck className="h-4 w-4" />
          )}
          {impersonating ? 'Starting...' : 'Impersonate'}
        </button>
      )}
      {canDelete && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 hover:cursor-pointer"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Delete User
        </button>
      )}
    </div>
  );
}
