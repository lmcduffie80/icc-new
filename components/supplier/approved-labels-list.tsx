'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, FileText, ExternalLink, Loader2, AlertCircle, ChevronDown, ChevronUp, Clock, User, Calendar, Info } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { getImageProxyUrl } from '@/lib/image-proxy';

interface ApprovalTimelineEvent {
  action: 'admin_approved' | 'label_modified' | 'supplier_approved_label';
  performed_by: string | null;
  performed_by_name: string | null;
  notes: string | null;
  label_url: string | null;
  created_at: string;
}

interface ApprovedLabel {
  product_id: string;
  product_name: string;
  image: string | null;
  label_url: string | null;
  admin_label_url: string | null;
  approval_status: string;
  approval_notes: string | null;
  product_created_at: string;
  approval_timeline: ApprovalTimelineEvent[];
}

export function ApprovedLabelsList() {
  const [approvedLabels, setApprovedLabels] = useState<ApprovedLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [expandedApprovalDetails, setExpandedApprovalDetails] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchApprovedLabels() {
      try {
        const response = await fetch('/api/supplier/approvals/approved');
        if (!response.ok) {
          throw new Error('Failed to fetch approved labels');
        }
        const data = await response.json();
        setApprovedLabels(data.approvedLabels || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load approved labels');
      } finally {
        setLoading(false);
      }
    }

    fetchApprovedLabels();
  }, []);

  const toggleExpanded = (productId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const toggleApprovalDetails = (productId: string) => {
    setExpandedApprovalDetails((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 7) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } else if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  };

  const formatFullDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'admin_approved':
        return <CheckCircle className="h-4 w-4 text-emerald-600" />;
      case 'label_modified':
        return <FileText className="h-4 w-4 text-amber-600" />;
      case 'supplier_approved_label':
        return <CheckCircle className="h-4 w-4 text-blue-600" />;
      default:
        return <Clock className="h-4 w-4 text-slate-400" />;
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'admin_approved':
        return 'Product Approved';
      case 'label_modified':
        return 'Label Modified';
      case 'supplier_approved_label':
        return 'Label Approved';
      default:
        return action;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-2 text-red-800">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (approvedLabels.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-slate-400" />
        <h3 className="mt-4 text-lg font-medium text-slate-900">No Approved Labels Yet</h3>
        <p className="mt-2 text-sm text-slate-500">
          Approved labels will appear here once you approve admin-modified labels.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {approvedLabels.map((label) => {
        const isExpanded = expandedItems.has(label.product_id);
        const latestEvent = label.approval_timeline[label.approval_timeline.length - 1];
        // Derive the product approver from the timeline
        const productApprover = label.approval_timeline.find(
          event => event.action === 'admin_approved'
        )?.performed_by_name;

        return (
          <div
            key={label.product_id}
            className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden"
          >
            {/* Header */}
            <div className="p-6">
              <div className="flex items-start gap-4">
                {/* Product Image */}
                {label.image && (
                  <div className="flex-shrink-0">
                    <Image
                      src={getImageProxyUrl(label.image) || '/placeholder.png'}
                      alt={label.product_name}
                      width={80}
                      height={80}
                      className="rounded-md object-cover"
                    />
                  </div>
                )}

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {label.product_name}
                  </h3>
                  {latestEvent && (
                    <p className="mt-1 text-sm text-slate-500">
                      Label approved{' '}
                      <span title={formatFullDateTime(latestEvent.created_at)}>
                        {formatRelativeTime(latestEvent.created_at)}
                      </span>
                    </p>
                  )}

                  {/* Quick Links */}
                  <div className="mt-3 flex flex-wrap gap-3">
                    {label.admin_label_url && (
                      <a
                        href={label.admin_label_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
                      >
                        <FileText className="h-4 w-4" />
                        View Label
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <Link
                      href={`/supplier/products/${label.product_id}`}
                      className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View Product
                    </Link>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex-shrink-0 flex gap-2">
                  <button
                    onClick={() => toggleExpanded(label.product_id)}
                    className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {isExpanded ? 'Hide' : 'Show'} Timeline
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => toggleApprovalDetails(label.product_id)}
                    className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Info className="h-4 w-4" />
                    Details
                  </button>
                </div>
              </div>
            </div>

            {/* Approval Details Section (Expandable) */}
            {expandedApprovalDetails.has(label.product_id) && (
              <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Approval Details</h4>
                <div className="space-y-3">
                  {/* Product Approval Status */}
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Product Status</p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {label.approval_status === 'published' ? 'Published' : label.approval_status}
                      </p>
                    </div>
                  </div>

                  {/* Approved By */}
                  {productApprover && (
                    <div className="flex items-start gap-2">
                      <User className="h-4 w-4 text-blue-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">Product Approved By</p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {productApprover}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Product Creation Date */}
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-slate-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Product Created</p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {formatFullDateTime(label.product_created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Approval Notes */}
                  {label.approval_notes && (
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 text-amber-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">Approval Notes</p>
                        <div className="mt-1 rounded-md bg-white border border-slate-200 p-2">
                          <p className="text-xs text-slate-700">{label.approval_notes}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Timeline (Expandable) */}
            {isExpanded && label.approval_timeline.length > 0 && (
              <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-4">Approval Timeline</h4>
                <div className="space-y-4">
                  {label.approval_timeline.map((event, index) => (
                    <div key={index} className="flex gap-3">
                      {/* Icon */}
                      <div className="flex-shrink-0 mt-0.5">
                        {getActionIcon(event.action)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-slate-900">
                            {getActionLabel(event.action)}
                          </p>
                          <p
                            className="text-xs text-slate-500 flex-shrink-0"
                            title={formatFullDateTime(event.created_at)}
                          >
                            {formatRelativeTime(event.created_at)}
                          </p>
                        </div>

                        {event.performed_by_name && (
                          <p className="mt-0.5 text-xs text-slate-600">
                            By: {event.performed_by_name}
                          </p>
                        )}

                        {event.notes && (
                          <div className="mt-2 rounded-md bg-white border border-slate-200 p-2">
                            <p className="text-xs text-slate-700">{event.notes}</p>
                          </div>
                        )}

                        {event.label_url && event.action === 'label_modified' && (
                          <a
                            href={event.label_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                          >
                            <FileText className="h-3 w-3" />
                            View modified label
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
