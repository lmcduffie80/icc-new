'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Permission } from '@/lib/permissions';
import { Eye, Trash2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { formatPhoneNumber } from '@/components/ui/phone-input';

interface ContactSubmission {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: string;
  is_spam: boolean;
  assigned_admin_id: string | null;
  assigned_admin_name: string | null;
  created_at: string;
  updated_at: string;
  unread_count: number;
}

interface ContactSubmissionsTableProps {
  submissions: ContactSubmission[];
  permissions: Permission[];
}

const subjectLabels: Record<string, string> = {
  general: 'General Inquiry',
  product: 'Product Information',
  support: 'Technical Support',
  pricing: 'Pricing & Membership',
  partnership: 'Partnership Opportunities',
  other: 'Other',
};

type StatusFilter = 'all' | 'new' | 'in_progress' | 'resolved' | 'spam';

export function ContactSubmissionsTable({
  submissions,
  permissions,
}: ContactSubmissionsTableProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [togglingSpam, setTogglingSpam] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const canDelete = permissions.includes('contact.delete');
  const canUpdate = permissions.includes('contact.update');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'new':
        return 'New';
      case 'in_progress':
        return 'In Progress';
      case 'resolved':
        return 'Resolved';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this submission? This action cannot be undone.')) {
      return;
    }

    setDeleting(id);
    try {
      const response = await fetch(`/api/admin/contact-submissions/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete submission');
      }
    } catch (err) {
      console.error('Error deleting submission:', err);
      alert('Failed to delete submission');
    } finally {
      setDeleting(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} submission(s)? This action cannot be undone.`)) {
      return;
    }

    setBulkDeleting(true);
    try {
      const response = await fetch('/api/admin/contact-submissions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      if (response.ok) {
        setSelectedIds(new Set());
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete submissions');
      }
    } catch (err) {
      console.error('Error bulk deleting submissions:', err);
      alert('Failed to delete submissions');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleToggleSpam = async (id: string, currentIsSpam: boolean) => {
    const action = currentIsSpam ? 'unmark as spam' : 'mark as spam';
    if (!confirm(`Are you sure you want to ${action} this submission?`)) return;

    setTogglingSpam(id);
    try {
      const response = await fetch(`/api/admin/contact-submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSpam: !currentIsSpam }),
      });

      if (response.ok) {
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || `Failed to ${action}`);
      }
    } catch (err) {
      console.error('Error toggling spam:', err);
      alert(`Failed to ${action}`);
    } finally {
      setTogglingSpam(null);
    }
  };

  const filteredSubmissions = submissions.filter((submission) => {
    const matchesSearch =
      submission.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      submission.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      submission.subject.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesStatus: boolean;
    if (statusFilter === 'spam') {
      matchesStatus = submission.is_spam === true;
    } else if (statusFilter === 'all') {
      matchesStatus = !submission.is_spam;
    } else {
      matchesStatus = !submission.is_spam && submission.status === statusFilter;
    }

    return matchesSearch && matchesStatus;
  });

  const spamCount = submissions.filter((s) => s.is_spam).length;

  const allVisibleSelected =
    filteredSubmissions.length > 0 &&
    filteredSubmissions.every((s) => selectedIds.has(s.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredSubmissions.forEach((s) => next.delete(s.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredSubmissions.forEach((s) => next.add(s.id));
        return next;
      });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const statusTabs: { value: StatusFilter; label: string; count?: number }[] = [
    { value: 'all', label: 'All' },
    { value: 'new', label: 'New' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'spam', label: 'Spam', count: spamCount },
  ];

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Filters */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by name, email, or subject..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 flex-wrap">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setStatusFilter(tab.value);
                setSelectedIds(new Set());
              }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors hover:cursor-pointer ${
                statusFilter === tab.value
                  ? tab.value === 'spam'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-emerald-100 text-emerald-800'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk actions bar */}
      {canDelete && selectedIds.size > 0 && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 flex items-center gap-3">
          <span className="text-sm text-blue-700 font-medium">
            {selectedIds.size} selected
          </span>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50 hover:cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {bulkDeleting ? 'Deleting...' : `Delete Selected (${selectedIds.size})`}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-blue-600 hover:text-blue-800 hover:cursor-pointer"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {canDelete && (
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 hover:cursor-pointer"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Subject
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Assigned To
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredSubmissions.length === 0 ? (
              <tr>
                <td colSpan={canDelete ? 7 : 6} className="px-4 py-8 text-center text-gray-500">
                  {statusFilter === 'spam'
                    ? 'No spam submissions found'
                    : 'No contact submissions found'}
                </td>
              </tr>
            ) : (
              filteredSubmissions.map((submission) => (
                <tr
                  key={submission.id}
                  className={`hover:bg-gray-50 ${submission.is_spam ? 'bg-red-50' : ''} ${selectedIds.has(submission.id) ? 'bg-blue-50' : ''}`}
                >
                  {canDelete && (
                    <td className="px-4 py-4 w-8">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(submission.id)}
                        onChange={() => toggleSelect(submission.id)}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 hover:cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-medium text-gray-900">{submission.name}</div>
                        <div className="text-sm text-gray-500">{submission.email}</div>
                        {submission.phone && (
                          <div className="text-sm text-gray-500">{formatPhoneNumber(submission.phone)}</div>
                        )}
                      </div>
                      {submission.unread_count > 0 && (
                        <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-medium">
                          {submission.unread_count}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-900">
                    {subjectLabels[submission.subject] || submission.subject}
                  </td>
                  <td className="px-4 py-4">
                    {submission.is_spam ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        Spam
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                          submission.status
                        )}`}
                      >
                        {getStatusLabel(submission.status)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-900">
                    {submission.assigned_admin_name || (
                      <span className="text-gray-400">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {formatDate(submission.created_at)}
                  </td>
                  <td className="px-4 py-4 text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      {!submission.is_spam && (
                        <Link
                          href={`/admin/contact-submissions/${submission.id}`}
                          className="text-emerald-600 hover:text-emerald-900 inline-flex items-center gap-1"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Link>
                      )}
                      {canUpdate && (
                        <button
                          onClick={() => handleToggleSpam(submission.id, submission.is_spam)}
                          disabled={togglingSpam === submission.id}
                          title={submission.is_spam ? 'Unmark as spam' : 'Mark as spam'}
                          className={`inline-flex items-center gap-1 disabled:opacity-50 hover:cursor-pointer ${
                            submission.is_spam
                              ? 'text-gray-500 hover:text-gray-700'
                              : 'text-orange-500 hover:text-orange-700'
                          }`}
                        >
                          {submission.is_spam ? (
                            <ShieldCheck className="h-4 w-4" />
                          ) : (
                            <ShieldAlert className="h-4 w-4" />
                          )}
                          <span className="sr-only">
                            {submission.is_spam ? 'Unmark spam' : 'Mark spam'}
                          </span>
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(submission.id)}
                          disabled={deleting === submission.id}
                          className="text-red-600 hover:text-red-900 inline-flex items-center gap-1 disabled:opacity-50 hover:cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                          {deleting === submission.id ? 'Deleting...' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination info */}
      <div className="px-4 py-3 border-t border-gray-200 text-sm text-gray-500">
        Showing {filteredSubmissions.length} of {submissions.length} submissions
        {spamCount > 0 && statusFilter !== 'spam' && (
          <span className="ml-2 text-red-500">
            ({spamCount} spam hidden —{' '}
            <button
              onClick={() => setStatusFilter('spam')}
              className="underline hover:text-red-700 hover:cursor-pointer"
            >
              view spam
            </button>
            )
          </span>
        )}
      </div>
    </div>
  );
}
