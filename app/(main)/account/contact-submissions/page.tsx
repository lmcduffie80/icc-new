'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  MessageSquare,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Eye,
  Trash2,
  Plus,
} from 'lucide-react';

type SubmissionStatus = 'new' | 'in_progress' | 'resolved';

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
  unreadCount: number;
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

export default function ContactSubmissionsPage() {
  const router = useRouter();
  const { user, isPending: isAuthPending } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthPending && !user) {
      router.push('/auth/sign-in');
    }
  }, [user, isAuthPending, router]);

  useEffect(() => {
    if (user) {
      fetchSubmissions();
    }
  }, [user]);

  const fetchSubmissions = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/profile/contact-submissions');
      if (!response.ok) {
        throw new Error('Failed to fetch submissions');
      }
      const data = await response.json();
      setSubmissions(data.submissions);
    } catch (err) {
      console.error('Error fetching submissions:', err);
      setError('Unable to load your submissions. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this submission? This action cannot be undone.')) {
      return;
    }

    setDeleting(id);
    try {
      const response = await fetch(`/api/profile/contact-submissions/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSubmissions((prev) => prev.filter((s) => s.id !== id));
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

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/account"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Account
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Contact Submissions</h1>
              <p className="text-muted-foreground mt-1">
                View and manage your contact form submissions
              </p>
            </div>
            <Button asChild>
              <Link href="/contact">
                <Plus className="h-4 w-4 mr-2" />
                New Submission
              </Link>
            </Button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
            <p className="text-red-600">{error}</p>
            <Button variant="outline" className="mt-4" onClick={fetchSubmissions}>
              Try Again
            </Button>
          </div>
        )}

        {/* Submissions List */}
        {!error && submissions.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <MessageSquare className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No submissions yet</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              When you submit a contact form, it will appear here. You can track responses from our
              team.
            </p>
            <Button asChild>
              <Link href="/contact">Contact Us</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {submissions.map((submission) => {
              const status = statusConfig[submission.status];
              const StatusIcon = status.icon;

              return (
                <div
                  key={submission.id}
                  className="bg-card border border-border rounded-xl overflow-hidden"
                >
                  {/* Submission Header */}
                  <div className="p-6 border-b border-border bg-muted/30">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-6">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">
                            Subject
                          </p>
                          <p className="font-medium">
                            {subjectLabels[submission.subject] || submission.subject}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">
                            Date
                          </p>
                          <p className="font-medium">
                            {new Date(submission.createdAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {submission.unreadCount > 0 && (
                          <span className="inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                            {submission.unreadCount} new
                          </span>
                        )}
                        <div
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${status.color}`}
                        >
                          <StatusIcon className="h-4 w-4" />
                          {status.label}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Submission Content */}
                  <div className="p-6">
                    <p className="text-muted-foreground line-clamp-2">{submission.message}</p>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-border">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(submission.id)}
                        disabled={deleting === submission.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {deleting === submission.id ? 'Deleting...' : 'Delete'}
                      </Button>
                      <Button size="sm" asChild>
                        <Link href={`/account/contact-submissions/${submission.id}`}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

