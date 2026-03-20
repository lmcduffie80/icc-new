'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Permission } from '@/lib/permissions';
import { Trash2, Loader2 } from 'lucide-react';

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
  const [processing, setProcessing] = useState(false);

  const canDelete = permissions.includes('users.delete');

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.'))
      return;

    setProcessing(true);
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
      setProcessing(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {canDelete && (
        <button
          onClick={handleDelete}
          disabled={processing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Delete User
        </button>
      )}
    </div>
  );
}
