'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, X, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StateSelect } from '@/components/ui/state-select';
import { cn } from '@/lib/utils';
import type { InvoiceMetadata } from '@/lib/types/checkout';

interface InvoiceUploadProps {
  onUploadComplete: (metadata: InvoiceMetadata) => void;
  onUploadStart: () => void;
  onUploadError: (error: string) => void;
  isUploading: boolean;
  currentInvoice: InvoiceMetadata | null;
  onRemove: () => void;
}

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function InvoiceUpload({
  onUploadComplete,
  onUploadStart,
  onUploadError,
  isUploading,
  currentInvoice,
  onRemove,
}: InvoiceUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedState, setSelectedState] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Please upload a PDF, JPG, JPEG, or PNG file';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File size must be less than 5MB';
    }
    if (file.size === 0) {
      return 'File size must be greater than 0';
    }
    return null;
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    const error = validateFile(file);
    if (error) {
      setUploadError(error);
      onUploadError(error);
      return;
    }
    setSelectedFile(file);
    setUploadError(null);
  }, [validateFile, onUploadError]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

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
    if (!selectedFile || !selectedState) {
      setUploadError('Please select a file and state before uploading');
      onUploadError('Please select a file and state before uploading');
      return;
    }

    setUploadError(null);
    onUploadStart();

    try {
      // Step 1: Get presigned URL
      const presignResponse = await fetch('/api/invoice/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: selectedFile.type,
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

      // Step 2: Upload to S3
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': selectedFile.type },
        body: selectedFile,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }

      // Step 3: Confirm upload and get metadata
      const confirmResponse = await fetch('/api/invoice/upload', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceUrl: publicUrl,
          state: selectedState,
          filename: selectedFile.name,
          fileType: selectedFile.type,
        }),
      });

      if (!confirmResponse.ok) {
        const error = await confirmResponse.json();
        throw new Error(error.error || 'Failed to confirm upload');
      }

      const { invoiceMetadata } = await confirmResponse.json();

      // Success - notify parent and reset form
      onUploadComplete(invoiceMetadata);
      setSelectedFile(null);
      setSelectedState('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error uploading invoice:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload invoice';
      setUploadError(errorMessage);
      onUploadError(errorMessage);
    }
  };

  const handleRemove = () => {
    setSelectedFile(null);
    setSelectedState('');
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onRemove();
  };

  const getFileIcon = (fileType: string) => {
    if (fileType === 'application/pdf') {
      return <FileText className="h-8 w-8 text-red-500" />;
    }
    return <FileText className="h-8 w-8 text-blue-500" />;
  };

  // If invoice already uploaded, show success state
  if (currentInvoice) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <CheckCircle className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-green-900 mb-1">
                  Invoice Uploaded Successfully
                </h3>
                <div className="space-y-1">
                  <p className="text-sm text-green-700 truncate">
                    <span className="font-medium">File:</span> {currentInvoice.invoice_filename}
                  </p>
                  <p className="text-sm text-green-700">
                    <span className="font-medium">State:</span> {currentInvoice.invoice_state}
                  </p>
                  <p className="text-sm text-green-700">
                    <span className="font-medium">Uploaded:</span>{' '}
                    {currentInvoice.invoice_uploaded_at 
                      ? new Date(currentInvoice.invoice_uploaded_at).toLocaleString()
                      : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={isUploading}
              className="text-green-700 hover:text-green-900 hover:bg-green-100"
            >
              <X className="h-4 w-4 mr-1" />
              Remove
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          You can proceed to the next step or remove and upload a different invoice.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {/* File Upload Zone */}
        <div>
          <label htmlFor="checkout-invoice-file" className="block text-sm font-medium mb-2">
            Upload Farm Invoice <span className="text-red-500">*</span>
          </label>
          <div
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
            role="presentation"
          >
            <input
              id="checkout-invoice-file"
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileInputChange}
              className="hidden"
              disabled={isUploading}
            />

            {selectedFile ? (
              <div className="flex flex-col items-center gap-3">
                {getFileIcon(selectedFile.type)}
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
          <label htmlFor="checkout-invoice-state" className="block text-sm font-medium mb-2">
            State on Invoice <span className="text-red-500">*</span>
          </label>
          <StateSelect
            id="checkout-invoice-state"
            value={selectedState}
            onChange={setSelectedState}
            placeholder="Select the state shown on your invoice"
            disabled={isUploading}
          />
          <p className="text-xs text-muted-foreground mt-1">
            This must match your shipping address state
          </p>
        </div>

        {/* Error Message */}
        {uploadError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-600">{uploadError}</p>
          </div>
        )}

        {/* Upload Button */}
        <Button
          onClick={handleUpload}
          disabled={!selectedFile || !selectedState || isUploading}
          className="w-full"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading Invoice...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Upload Invoice
            </>
          )}
        </Button>
      </div>

      <div className="bg-primary/10 border border-primary rounded-lg p-4">
        <h4 className="text-sm font-medium text-primary/80 mb-2">Why do we need this?</h4>
        <p className="text-sm text-primary">
          We require a copy of your farm invoice to verify your location and ensure accurate
          tax calculation. The state shown on your invoice must match your shipping address.
        </p>
      </div>
    </div>
  );
}
