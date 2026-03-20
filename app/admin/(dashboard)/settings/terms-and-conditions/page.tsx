'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Save, X, Clock, User } from 'lucide-react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface TermsRecord {
  id: string;
  title: string;
  content: string;
  version: number;
  is_active: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  admin_name?: string;
  content_length?: number;
}

interface TermsData {
  activeTerms: TermsRecord | null;
  versionHistory: TermsRecord[];
}

export default function TermsAndConditionsPage() {
  const [data, setData] = useState<TermsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  useEffect(() => {
    fetchTerms();
  }, []);

  const fetchTerms = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/terms-and-conditions');
      
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("You don't have permission to manage terms and conditions");
        }
        throw new Error('Failed to fetch terms and conditions');
      }

      const result = await response.json();
      setData(result);
      
      if (result.activeTerms) {
        setTitle(result.activeTerms.title);
        setContent(result.activeTerms.content);
      }
    } catch (err) {
      console.error('Error fetching terms:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    setHasChanges(true);
  };

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setHasChanges(true);
  };

  const handleCancel = () => {
    if (data?.activeTerms) {
      setTitle(data.activeTerms.title);
      setContent(data.activeTerms.content);
      setHasChanges(false);
      setSuccess(null);
      setError(null);
    }
  };

  const handleSave = () => {
    setShowConfirmDialog(true);
  };

  const confirmSave = async () => {
    setShowConfirmDialog(false);
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/admin/terms-and-conditions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, content }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to save terms and conditions');
      }

      const result = await response.json();
      setSuccess(result.message || 'Terms and conditions saved successfully');
      setHasChanges(false);
      
      // Refresh data to get updated version history
      await fetchTerms();
    } catch (err) {
      console.error('Error saving terms:', err);
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/3"></div>
          <div className="h-64 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Terms & Conditions</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  const characterCount = content.length;
  const characterLimit = 50000;
  const isNearLimit = characterCount > characterLimit * 0.9;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/admin/settings"
          className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 text-emerald-600" />
          <div>
            <h1 className="text-3xl font-bold">Terms & Conditions</h1>
            <p className="text-slate-600 mt-1">
              Manage purchase order terms and conditions
            </p>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 border border-red-200">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-primary border border-green-200">
          {success}
        </div>
      )}

      {/* Editor Form */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="space-y-4">
          {/* Title Field */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-slate-700 mb-2">
              Document Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              maxLength={200}
              className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              placeholder="e.g., Terms and Conditions"
            />
            <p className="mt-1 text-xs text-slate-500">{title.length} / 200 characters</p>
          </div>

          {/* Content Field */}
          <div>
            <label htmlFor="content" className="block text-sm font-medium text-slate-700 mb-2">
              Content
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              maxLength={characterLimit}
              rows={25}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              placeholder="Enter terms and conditions content..."
            />
            <p className={`mt-1 text-xs ${isNearLimit ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
              {characterCount.toLocaleString()} / {characterLimit.toLocaleString()} characters
              {isNearLimit && ' (Approaching limit!)'}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Tip: Use numbered sections (e.g., &ldquo;1. HEADING&rdquo;) and bullet points starting with &ldquo;- &rdquo; for lists.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <div className="text-sm text-slate-500">
              {hasChanges && (
                <span className="text-amber-600 font-medium">● Unsaved changes</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={!hasChanges || saving}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || saving || !title.trim() || content.length < 10}
              >
                {saving ? (
                  <>
                    <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save New Version
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Version History */}
      {data?.versionHistory && data.versionHistory.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Version History</h2>
            <p className="text-sm text-slate-500 mt-1">Previous versions of terms and conditions</p>
          </div>
          <div className="divide-y divide-slate-200">
            {data.versionHistory.map((version) => (
              <div
                key={version.id}
                className="px-6 py-4 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                      version.is_active 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      v{version.version}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">
                        {version.title}
                        {version.is_active && (
                          <span className="ml-2 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Active
                          </span>
                        )}
                      </p>
                      <div className="mt-1 flex items-center gap-4 text-sm text-slate-500">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(version.updated_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                        {version.admin_name && (
                          <div className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {version.admin_name}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-slate-500">
                    {version.content_length?.toLocaleString() || 'N/A'} chars
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              Save New Version?
            </h3>
            <p className="text-sm text-slate-600 mb-6">
              This will create version {(data?.activeTerms?.version || 0) + 1} and make it the active version for all new purchase orders. The current version will be archived.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowConfirmDialog(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Confirm & Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
