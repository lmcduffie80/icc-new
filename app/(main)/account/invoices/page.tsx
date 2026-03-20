'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { StateSelect } from '@/components/ui/state-select';
import {
  ArrowLeft,
  FileText,
  Loader2,
  Trash2,
  Plus,
  Upload,
  X,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { US_STATE_NAMES } from '@/lib/constants/states';

interface Invoice {
  id: string;
  state: string;
  fileUrl: string;
  filename: string;
  fileType: string;
  createdAt: string;
  updatedAt: string;
}

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Get MIME type from file extension (fallback when browser doesn't detect correctly)
const getMimeTypeFromExtension = (filename: string): string | null => {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    default: return null;
  }
};

export default function InvoicesPage() {
  const router = useRouter();
  const { user, isPending: isAuthPending } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Upload state
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedState, setSelectedState] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAuthPending && !user) {
      router.push('/auth/sign-in');
    }
  }, [user, isAuthPending, router]);

  useEffect(() => {
    if (user) {
      fetchInvoices();
    }
  }, [user]);

  const fetchInvoices = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/profile/invoices');
      if (!response.ok) {
        throw new Error('Failed to fetch invoices');
      }
      const data = await response.json();
      setInvoices(data.invoices);
    } catch (err) {
      console.error('Error fetching invoices:', err);
      setError('Unable to load your invoices. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
      return;
    }

    setDeleting(id);
    try {
      const response = await fetch(`/api/profile/invoices/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setInvoices((prev) => prev.filter((inv) => inv.id !== id));
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete invoice');
      }
    } catch (err) {
      console.error('Error deleting invoice:', err);
      alert('Failed to delete invoice');
    } finally {
      setDeleting(null);
    }
  };

  const validateFile = useCallback((file: File): { error: string | null; mimeType: string | null } => {
    // Check MIME type first, then fall back to extension
    let detectedType = file.type;

    if (!ALLOWED_MIME_TYPES.includes(detectedType)) {
      // Try to determine type from extension (browsers sometimes don't detect PDF correctly)
      const extensionType = getMimeTypeFromExtension(file.name);
      if (extensionType) {
        detectedType = extensionType;
      }
    }

    // Also check extension is valid
    const ext = '.' + (file.name.toLowerCase().split('.').pop() || '');
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return { error: 'Please upload a PDF, JPG, JPEG, or PNG file', mimeType: null };
    }

    if (!ALLOWED_MIME_TYPES.includes(detectedType)) {
      return { error: 'Please upload a PDF, JPG, JPEG, or PNG file', mimeType: null };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { error: 'File size must be less than 5MB', mimeType: null };
    }
    if (file.size === 0) {
      return { error: 'File size must be greater than 0', mimeType: null };
    }
    return { error: null, mimeType: detectedType };
  }, []);

  // Store detected MIME type for files where browser detection fails
  const [detectedMimeType, setDetectedMimeType] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    (file: File) => {
      const { error, mimeType } = validateFile(file);
      if (error) {
        setUploadError(error);
        setSelectedFile(null);
        setDetectedMimeType(null);
        return;
      }
      setSelectedFile(file);
      setDetectedMimeType(mimeType);
      setUploadError(null);
    },
    [validateFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect]
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedState || !detectedMimeType) {
      setUploadError('Please select a file and state');
      return;
    }

    // Check if invoice for this state already exists
    if (invoices.some((inv) => inv.state === selectedState)) {
      setUploadError(`You already have an invoice for ${US_STATE_NAMES[selectedState] || selectedState}. Please delete the existing one first.`);
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // Step 1: Get presigned URL (use detected MIME type for consistency)
      const presignResponse = await fetch('/api/profile/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: detectedMimeType,
          fileName: selectedFile.name,
          size: selectedFile.size,
          state: selectedState,
        }),
      });

      if (!presignResponse.ok) {
        const error = await presignResponse.json();
        throw new Error(error.error || 'Failed to get upload URL');
      }

      const { uploadUrl, publicUrl } = await presignResponse.json();

      // Step 2: Upload to S3 (use detected MIME type)
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': detectedMimeType },
        body: selectedFile,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }

      // Step 3: Confirm upload and save to database
      const confirmResponse = await fetch('/api/profile/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceUrl: publicUrl,
          state: selectedState,
          filename: selectedFile.name,
          fileType: detectedMimeType,
        }),
      });

      if (!confirmResponse.ok) {
        const error = await confirmResponse.json();
        throw new Error(error.error || 'Failed to save invoice');
      }

      const { invoice } = await confirmResponse.json();

      // Add to list and reset form
      setInvoices((prev) => [invoice, ...prev]);
      setSelectedFile(null);
      setDetectedMimeType(null);
      setSelectedState('');
      setShowUploadForm(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const resetUploadForm = () => {
    setSelectedFile(null);
    setDetectedMimeType(null);
    setSelectedState('');
    setUploadError(null);
    setShowUploadForm(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType === 'application/pdf') {
      return <FileText className="h-8 w-8 text-red-500" />;
    }
    return <FileText className="h-8 w-8 text-blue-500" />;
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
              <h1 className="text-2xl font-semibold tracking-tight">My Invoices</h1>
              <p className="text-muted-foreground mt-1">
                Manage your farm invoices for checkout verification
              </p>
            </div>
            {!showUploadForm && (
              <Button onClick={() => setShowUploadForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Upload Invoice
              </Button>
            )}
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
            <p className="text-red-600">{error}</p>
            <Button variant="outline" className="mt-4" onClick={fetchInvoices}>
              Try Again
            </Button>
          </div>
        )}

        {/* Upload Form */}
        {showUploadForm && (
          <div className="bg-card border border-border rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Upload New Invoice</h2>
              <Button variant="ghost" size="sm" onClick={resetUploadForm}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              {/* File Upload Zone */}
              <div>
                <label htmlFor="invoice-file" className="block text-sm font-medium mb-2">
                  Invoice File <span className="text-red-500">*</span>
                </label>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Drag and drop invoice file here, or click browse to select a file"
                  className={cn(
                    'border-2 border-dashed rounded-xl p-8 text-center transition-colors',
                    isDragging
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-muted/30 hover:border-primary/50',
                    selectedFile && 'border-green-500 bg-green-50'
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleBrowseClick();
                    }
                  }}
                >
                  <input
                    id="invoice-file"
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileInputChange}
                    className="hidden"
                    disabled={isUploading}
                  />

                  {selectedFile ? (
                    <div className="flex flex-col items-center gap-3">
                      {getFileIcon(detectedMimeType || selectedFile.type)}
                      <div>
                        <p className="font-medium text-sm">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedFile(null);
                          setDetectedMimeType(null);
                          if (fileInputRef.current) {
                            fileInputRef.current.value = '';
                          }
                        }}
                        disabled={isUploading}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Clear
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-1">
                          Drag and drop your invoice here, or{' '}
                          <button
                            type="button"
                            onClick={handleBrowseClick}
                            className="text-primary hover:underline"
                            disabled={isUploading}
                          >
                            browse
                          </button>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          PDF, JPG, JPEG, or PNG (max 5MB)
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* State Selection */}
              <div>
                <label htmlFor="invoice-state" className="block text-sm font-medium mb-2">
                  State on Invoice <span className="text-red-500">*</span>
                </label>
                <StateSelect
                  id="invoice-state"
                  value={selectedState}
                  onChange={setSelectedState}
                  placeholder="Select the state shown on your invoice"
                  disabled={isUploading}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  You can upload one invoice per state
                </p>
              </div>

              {/* Error Message */}
              {uploadError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-600">{uploadError}</p>
                </div>
              )}

              {/* Upload Button */}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={resetUploadForm} disabled={isUploading}>
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || !selectedState || isUploading}
                  className="flex-1"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Invoice
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-primary/10 border border-primary rounded-xl p-4 mb-6">
          <h4 className="text-sm font-medium text-primary mb-2">Why do we need invoices?</h4>
          <p className="text-sm text-primary">
            We require a copy of your farm invoice to verify your location for checkout.
            Upload invoices for each state where you have farms to ship products to those locations.
          </p>
        </div>

        {/* Invoices List */}
        {!error && invoices.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No invoices yet</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Upload your farm invoices to enable checkout. You need at least one invoice
              matching your shipping address state.
            </p>
            {!showUploadForm && (
              <Button onClick={() => setShowUploadForm(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload Invoice
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                {/* Invoice Header */}
                <div className="p-6 border-b border-border bg-muted/30">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-6">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          State
                        </p>
                        <p className="font-medium">
                          {US_STATE_NAMES[invoice.state] || invoice.state} ({invoice.state})
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Uploaded
                        </p>
                        <p className="font-medium">
                          {new Date(invoice.createdAt).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium text-primary bg-green-50 border-green-200">
                      {getFileIcon(invoice.fileType)}
                      <span className="ml-1">Verified</span>
                    </div>
                  </div>
                </div>

                {/* Invoice Content */}
                <div className="p-6">
                  <div className="flex items-center gap-3">
                    {getFileIcon(invoice.fileType)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{invoice.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {invoice.fileType === 'application/pdf' ? 'PDF Document' : 'Image'}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(invoice.id)}
                      disabled={deleting === invoice.id}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {deleting === invoice.id ? 'Deleting...' : 'Delete'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                    >
                      <a href={invoice.fileUrl} target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
