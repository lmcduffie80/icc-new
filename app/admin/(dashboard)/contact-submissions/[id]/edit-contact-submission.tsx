'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Permission } from '@/lib/permissions';
import { formatPhoneNumber } from '@/components/ui/phone-input';
import {
  ArrowLeft,
  Send,
  StickyNote,
  User,
  Shield,
  Trash2,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

interface ContactSubmission {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: string;
  assigned_admin_id: string | null;
  assigned_admin_name: string | null;
  created_at: string;
  updated_at: string;
}

interface ContactMessage {
  id: string;
  message: string;
  is_admin_reply: boolean;
  admin_name: string | null;
  user_name: string | null;
  created_at: string;
}

interface ContactNote {
  id: string;
  note: string;
  admin_name: string;
  created_at: string;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
}

interface EditContactSubmissionProps {
  submission: ContactSubmission;
  messages: ContactMessage[];
  notes: ContactNote[];
  admins: AdminUser[];
  permissions: Permission[];
  currentAdminId: string;
  currentAdminName: string;
}

const subjectLabels: Record<string, string> = {
  general: 'General Inquiry',
  product: 'Product Information',
  support: 'Technical Support',
  pricing: 'Pricing & Membership',
  partnership: 'Partnership Opportunities',
  other: 'Other',
};

const statusConfig = {
  new: {
    label: 'New',
    icon: AlertCircle,
    color: 'bg-blue-100 text-blue-800',
  },
  in_progress: {
    label: 'In Progress',
    icon: Clock,
    color: 'bg-yellow-100 text-yellow-800',
  },
  resolved: {
    label: 'Resolved',
    icon: CheckCircle,
    color: 'bg-green-100 text-green-800',
  },
};

export function EditContactSubmission({
  submission,
  messages: initialMessages,
  notes: initialNotes,
  admins,
  permissions,
  currentAdminName,
}: EditContactSubmissionProps) {
  const router = useRouter();
  const [status, setStatus] = useState(submission.status);
  const [assignedAdminId, setAssignedAdminId] = useState(submission.assigned_admin_id || '');
  const [replyMessage, setReplyMessage] = useState('');
  const [noteText, setNoteText] = useState('');
  const [messages, setMessages] = useState(initialMessages);
  const [notes, setNotes] = useState(initialNotes);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const canUpdate = permissions.includes('contact.update');
  const canReply = permissions.includes('contact.reply');
  const canDelete = permissions.includes('contact.delete');

  const handleUpdateStatus = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/admin/contact-submissions/${submission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          assignedAdminId: assignedAdminId || null,
        }),
      });

      if (response.ok) {
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to update submission');
      }
    } catch (err) {
      console.error('Error updating submission:', err);
      alert('Failed to update submission');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim()) return;

    setIsSendingReply(true);
    try {
      const response = await fetch('/api/admin/contact-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: submission.id,
          message: replyMessage,
          isNote: false,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessages((prev) => [
          ...prev,
          {
            id: data.message.id,
            message: data.message.message,
            is_admin_reply: true,
            admin_name: currentAdminName,
            user_name: null,
            created_at: data.message.createdAt,
          },
        ]);
        setReplyMessage('');
        if (status === 'new') {
          setStatus('in_progress');
        }
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to send reply');
      }
    } catch (err) {
      console.error('Error sending reply:', err);
      alert('Failed to send reply');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;

    setIsAddingNote(true);
    try {
      const response = await fetch('/api/admin/contact-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: submission.id,
          message: noteText,
          isNote: true,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNotes((prev) => [
          {
            id: data.note.id,
            note: data.note.note,
            admin_name: currentAdminName,
            created_at: data.note.createdAt,
          },
          ...prev,
        ]);
        setNoteText('');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to add note');
      }
    } catch (err) {
      console.error('Error adding note:', err);
      alert('Failed to add note');
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        'Are you sure you want to delete this submission? This action cannot be undone.'
      )
    )
      return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/contact-submissions/${submission.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/admin/contact-submissions');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete submission');
      }
    } catch (err) {
      console.error('Error deleting submission:', err);
      alert('Failed to delete submission');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const currentStatus = statusConfig[status as keyof typeof statusConfig] || statusConfig.new;
  const StatusIcon = currentStatus.icon;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin/contact-submissions"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Contact Submissions
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {subjectLabels[submission.subject] || submission.subject}
            </h1>
            <p className="mt-1 text-slate-500">
              Submitted on {formatDate(submission.created_at)}
            </p>
          </div>
          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${currentStatus.color}`}
          >
            <StatusIcon className="h-4 w-4" />
            {currentStatus.label}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Original Submission */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="font-semibold text-gray-900 text-lg">Original Submission</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Name</p>
                  <p className="font-medium text-gray-900">{submission.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Email</p>
                  <p className="font-medium text-gray-900">{submission.email}</p>
                </div>
                {submission.phone && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Phone</p>
                    <p className="font-medium text-gray-900">{formatPhoneNumber(submission.phone)}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Message</p>
                <p className="text-gray-900 whitespace-pre-wrap">{submission.message}</p>
              </div>
            </div>
          </div>

          {/* Conversation Thread */}
          {messages.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="font-semibold text-gray-900">Conversation</h2>
              </div>
              <div className="p-6 space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.is_admin_reply ? 'flex-row-reverse' : ''}`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        msg.is_admin_reply
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-blue-100 text-primary'
                      }`}
                    >
                      {msg.is_admin_reply ? (
                        <Shield className="h-4 w-4" />
                      ) : (
                        <User className="h-4 w-4" />
                      )}
                    </div>
                    <div
                      className={`flex-1 rounded-lg p-4 ${
                        msg.is_admin_reply
                          ? 'bg-emerald-50 border border-emerald-100'
                          : 'bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900">
                          {msg.is_admin_reply
                            ? msg.admin_name || 'Support Team'
                            : msg.user_name || submission.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(msg.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{msg.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reply Form */}
          {canReply && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="font-semibold text-gray-900 text-lg">Send Reply</h2>
              </div>
              <form onSubmit={handleSendReply} className="p-6">
                <textarea
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder="Type your reply here..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
                <div className="flex justify-end mt-4">
                  <button
                    type="submit"
                    disabled={isSendingReply || !replyMessage.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="h-4 w-4" />
                    {isSendingReply ? 'Sending...' : 'Send Reply'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status & Assignment */}
          {canUpdate && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="font-semibold text-gray-900 text-lg">Manage Submission</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label htmlFor="submission-status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    id="submission-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="new">New</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="submission-assignee" className="block text-sm font-medium text-gray-700 mb-1">
                    Assign To
                  </label>
                  <select
                    id="submission-assignee"
                    value={assignedAdminId}
                    onChange={(e) => setAssignedAdminId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Unassigned</option>
                    {admins.map((admin) => (
                      <option key={admin.id} value={admin.id}>
                        {admin.name || admin.email}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleUpdateStatus}
                  disabled={isUpdating}
                  className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {/* Internal Notes */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2 text-lg">
                <StickyNote className="h-4 w-4" />
                Internal Notes
              </h2>
              <p className="text-xs text-gray-500 mt-1">Only visible to admins</p>
            </div>
            <div className="p-6">
              {canReply && (
                <form onSubmit={handleAddNote} className="mb-4">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add an internal note..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none text-sm"
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      type="submit"
                      disabled={isAddingNote || !noteText.trim()}
                      className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isAddingNote ? 'Adding...' : 'Add Note'}
                    </button>
                  </div>
                </form>
              )}
              {notes.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No notes yet</p>
              ) : (
                <div className="space-y-3">
                  {notes.map((note) => (
                    <div
                      key={note.id}
                      className="p-3 bg-yellow-50 border border-yellow-100 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700">{note.admin_name}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(note.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{note.note}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Delete */}
          {canDelete && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-red-50">
                <h2 className="font-semibold text-red-900 text-lg">Danger Zone</h2>
              </div>
              <div className="p-6">
                <p className="text-sm text-gray-600 mb-4">
                  Permanently delete this submission and all associated messages and notes.
                </p>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-4 w-4" />
                  {isDeleting ? 'Deleting...' : 'Delete Submission'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

