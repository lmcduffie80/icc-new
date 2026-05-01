'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { formatPhoneNumber } from '@/components/ui/phone-input';
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  Send,
  User,
  Shield,
} from 'lucide-react';

type SubmissionStatus = 'new' | 'in_progress' | 'resolved';

type Message = {
  id: string;
  message: string;
  isAdminReply: boolean;
  adminName: string | null;
  createdAt: string;
};

type Submission = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: SubmissionStatus;
  createdAt: string;
  updatedAt: string;
};

const statusConfig = {
  new: {
    label: 'New',
    icon: AlertCircle,
    color: 'text-primary bg-blue-50 border-blue-200',
  },
  in_progress: {
    label: 'In Progress',
    icon: Clock,
    color: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  },
  resolved: {
    label: 'Resolved',
    icon: CheckCircle,
    color: 'text-primary bg-green-50 border-green-200',
  },
};

const subjectLabels: Record<string, string> = {
  general: 'General Inquiry',
  product: 'Product Information',
  support: 'Technical Support',
  pricing: 'Pricing & Membership',
  partnership: 'Partnership Opportunities',
  other: 'Other',
};

export default function ContactSubmissionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user, isPending: isAuthPending } = useAuth();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isAuthPending && !user) {
      router.push('/auth/sign-in');
    }
  }, [user, isAuthPending, router]);

  const fetchSubmission = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/profile/contact-submissions/${params.id}`);
      if (!response.ok) {
        if (response.status === 404) {
          setError('Submission not found');
        } else {
          throw new Error('Failed to fetch submission');
        }
        return;
      }
      const data = await response.json();
      setSubmission(data.submission);
      setMessages(data.messages);
    } catch (err) {
      console.error('Error fetching submission:', err);
      setError('Unable to load the submission. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (user && params.id) {
      fetchSubmission();
    }
  }, [user, params.id, fetchSubmission]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setIsSending(true);
    try {
      const response = await fetch('/api/profile/contact-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: params.id,
          message: newMessage,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessages((prev) => [...prev, data.message]);
        setNewMessage('');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to send message');
      }
    } catch (err) {
      console.error('Error sending message:', err);
      alert('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleMarkResolved = async () => {
    if (!confirm('Are you sure you want to mark this submission as resolved?')) return;

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/profile/contact-submissions/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });

      if (response.ok) {
        setSubmission((prev) => (prev ? { ...prev, status: 'resolved' } : null));
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

  const handleDelete = async () => {
    if (
      !confirm(
        'Are you sure you want to delete this submission? This action cannot be undone.'
      )
    )
      return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/profile/contact-submissions/${params.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/account/contact-submissions');
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

  if (isAuthPending || isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
          <span className="text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (error || !submission) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-muted/30">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <p className="text-red-600">{error || 'Submission not found'}</p>
            <Button variant="outline" className="mt-4" asChild>
              <Link href="/account/contact-submissions">Back to Submissions</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const status = statusConfig[submission.status];
  const StatusIcon = status.icon;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/account/contact-submissions"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Submissions
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {subjectLabels[submission.subject] || submission.subject}
              </h1>
              <p className="text-muted-foreground mt-1">
                Submitted on{' '}
                {new Date(submission.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${status.color}`}
            >
              <StatusIcon className="h-4 w-4" />
              {status.label}
            </div>
          </div>
        </div>

        {/* Original Submission */}
        <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
          <div className="p-6 border-b border-border bg-muted/30">
            <h2 className="font-semibold text-lg">Original Submission</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Name</p>
                <p className="font-medium">{submission.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Email</p>
                <p className="font-medium">{submission.email}</p>
              </div>
              {submission.phone && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    Phone
                  </p>
                  <p className="font-medium">{formatPhoneNumber(submission.phone)}</p>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Message</p>
              <p className="whitespace-pre-wrap">{submission.message}</p>
            </div>
          </div>
        </div>

        {/* Conversation Thread */}
        {messages.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
            <div className="p-6 border-b border-border bg-muted/30">
              <h2 className="font-semibold text-lg">Conversation</h2>
            </div>
            <div className="p-6 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.isAdminReply ? '' : 'flex-row-reverse'}`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      msg.isAdminReply ? 'bg-emerald-100 text-emerald-600' : 'bg-primary/10 text-primary'
                    }`}
                  >
                    {msg.isAdminReply ? (
                      <Shield className="h-4 w-4" />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={`flex-1 rounded-lg p-4 ${
                      msg.isAdminReply ? 'bg-emerald-50 border border-emerald-100' : 'bg-muted'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">
                        {msg.isAdminReply ? msg.adminName || 'Support Team' : 'You'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(msg.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add Follow-up Message */}
        {submission.status !== 'resolved' && (
          <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
            <div className="p-6 border-b border-border bg-muted/30">
              <h2 className="font-semibold text-lg">Add Follow-up Message</h2>
            </div>
            <form onSubmit={handleSendMessage} className="p-6">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message here..."
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
              <div className="flex justify-end mt-4">
                <Button type="submit" disabled={isSending || !newMessage.trim()}>
                  <Send className="h-4 w-4 mr-2" />
                  {isSending ? 'Sending...' : 'Send Message'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            variant="outline"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {isDeleting ? 'Deleting...' : 'Delete Submission'}
          </Button>
          {submission.status !== 'resolved' && (
            <Button variant="outline" onClick={handleMarkResolved} disabled={isUpdating}>
              <CheckCircle className="h-4 w-4 mr-2" />
              {isUpdating ? 'Updating...' : 'Mark as Resolved'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

