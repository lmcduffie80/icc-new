'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { DataTable, Column } from '@/components/admin/data-table';
import { Permission } from '@/lib/permissions';
import { Eye, Trash2, User as UserIcon, CheckCircle, UserPlus, X } from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string;
  image: string | null;
  email_verified: boolean;
  created_at: string;
  orders_count: number;
  total_spent: string;
}

interface UsersTableProps {
  users: User[];
  permissions: Permission[];
}

export function UsersTable({ users, permissions }: UsersTableProps) {
  const router = useRouter();
  const [processing, setProcessing] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '' });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const canDelete = permissions.includes('users.delete');
  const canCreate = permissions.includes('users.update');

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || 'Failed to create user');
        return;
      }
      setShowCreateModal(false);
      setCreateForm({ name: '', email: '', password: '' });
      router.refresh();
    } catch {
      setCreateError('Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.'))
      return;

    setProcessing(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user');
    } finally {
      setProcessing(null);
    }
  };

  const formatCurrency = (amount: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      parseFloat(amount)
    );

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'User',
      sortable: true,
      render: (user) => (
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 overflow-hidden rounded-full bg-slate-100">
            {user.image ? (
              <Image
                src={user.image}
                alt={user.name}
                fill
                sizes="40px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <UserIcon className="h-5 w-5 text-slate-400" />
              </div>
            )}
          </div>
          <div>
            <p className="font-medium text-slate-900">{user.name || 'Unknown'}</p>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'email_verified',
      header: 'Verified',
      render: (user) =>
        user.email_verified ? (
          <CheckCircle className="h-5 w-5 text-primary" />
        ) : (
          <span className="text-sm text-slate-400">No</span>
        ),
    },
    {
      key: 'orders_count',
      header: 'Orders',
      sortable: true,
      render: (user) => <span className="font-medium">{user.orders_count}</span>,
    },
    {
      key: 'total_spent',
      header: 'Total Spent',
      sortable: true,
      render: (user) => (
        <span className="font-medium">{formatCurrency(user.total_spent)}</span>
      ),
    },
    {
      key: 'created_at',
      header: 'Joined',
      sortable: true,
      render: (user) => (
        <span className="text-slate-500">
          {new Date(user.created_at).toLocaleDateString()}
        </span>
      ),
    },
  ];

  const actions = (user: User) => (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={`/admin/users/${user.id}`}
        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <Eye className="h-4 w-4" />
      </Link>
      {canDelete && (
        <button
          onClick={() => handleDelete(user.id)}
          disabled={processing === user.id}
          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          title="Delete user"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  return (
    <>
      {canCreate && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => { setShowCreateModal(true); setCreateError(''); }}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 hover:cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            Create User
          </button>
        </div>
      )}

      <DataTable
        data={users}
        columns={columns}
        keyExtractor={(user) => user.id}
        searchKeys={['name', 'email']}
        searchPlaceholder="Search users..."
        emptyMessage="No users found"
        actions={actions}
      />

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Create Customer Account</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 hover:cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email Address</label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={createForm.password}
                  onChange={(e) => setCreateForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Min. 6 characters"
                />
              </div>
              {createError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{createError}</p>
              )}
              <p className="text-xs text-slate-500">
                This account will be pre-verified and ready to log in immediately. The user can reset their password from the sign-in page.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 hover:cursor-pointer"
                >
                  {creating ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

