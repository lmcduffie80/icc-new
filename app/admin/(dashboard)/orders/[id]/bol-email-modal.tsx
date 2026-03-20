'use client';

import { useState, useEffect } from 'react';
import { Mail, Loader2, X, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BOLEmailModalProps {
  orderId: string;
  orderNumber: string;
  isOpen: boolean;
  onClose: () => void;
}

interface SDSDocument {
  name: string;
  url: string;
  productName: string;
  productId: string;
}

export function BOLEmailModal({ orderId, isOpen, onClose }: BOLEmailModalProps) {
  const [emails, setEmails] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sdsDocuments, setSdsDocuments] = useState<SDSDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState<{
    bol: boolean;
    sds: string[]; // Array of SDS document URLs
  }>({
    bol: true, // BOL is selected by default
    sds: [],
  });

  // Fetch SDS documents when modal opens
  useEffect(() => {
    if (isOpen && orderId) {
      setLoadingDocuments(true);
      fetch(`/api/admin/orders/${orderId}/bill-of-lading/documents`)
        .then((res) => res.json())
        .then((data) => {
          if (data.sdsDocuments) {
            setSdsDocuments(data.sdsDocuments);
            // Pre-select all SDS documents by default
            setSelectedDocuments((prev) => ({
              ...prev,
              sds: data.sdsDocuments.map((doc: SDSDocument) => doc.url),
            }));
          }
        })
        .catch((err) => {
          console.error('Error fetching SDS documents:', err);
        })
        .finally(() => {
          setLoadingDocuments(false);
        });
    }
  }, [isOpen, orderId]);

  const handleToggleBOL = () => {
    setSelectedDocuments((prev) => ({
      ...prev,
      bol: !prev.bol,
    }));
  };

  const handleToggleSDS = (url: string) => {
    setSelectedDocuments((prev) => ({
      ...prev,
      sds: prev.sds.includes(url)
        ? prev.sds.filter((u) => u !== url)
        : [...prev.sds, url],
    }));
  };

  const handleSelectAllSDS = () => {
    setSelectedDocuments((prev) => ({
      ...prev,
      sds: sdsDocuments.map((doc) => doc.url),
    }));
  };

  const handleDeselectAllSDS = () => {
    setSelectedDocuments((prev) => ({
      ...prev,
      sds: [],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!emails.trim()) {
      setError('Please enter at least one email address');
      return;
    }

    // Parse and validate email addresses
    const emailList = emails
      .split(/[,\n]/)
      .map(email => email.trim())
      .filter(email => email.length > 0);
    
    if (emailList.length === 0) {
      setError('Please enter at least one valid email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emailList.filter(email => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      setError(`Invalid email address(es): ${invalidEmails.join(', ')}`);
      return;
    }

    if (!selectedDocuments.bol && selectedDocuments.sds.length === 0) {
      setError('Please select at least one document to send');
      return;
    }

    setSending(true);
    setError('');
    setSuccess(false);

    try {
      let response: Response;
      try {
        response = await fetch(`/api/admin/orders/${orderId}/bill-of-lading/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: emailList, // Send as array
            carrierName: carrierName.trim() || 'Carrier',
            includeBOL: selectedDocuments.bol,
            includeSDS: selectedDocuments.sds, // Array of SDS URLs to include
          }),
        });
      } catch (fetchError) {
        // Handle network errors (fetch fails completely)
        const networkError = fetchError instanceof Error 
          ? fetchError.message 
          : 'Network error: Unable to connect to server';
        console.error('BOL Email Network Error:', fetchError);
        throw new Error(`Unable to fetch data. ${networkError}`);
      }

      let data: { successCount?: number; failedCount?: number; failedEmails?: Array<{email: string; error?: string}>; message?: string; debug?: {wasPDF: boolean; filename: string; bufferSize: number; pdfHeader: string}; success?: boolean; messageId?: string; recipients?: string[]; results?: unknown[]; error?: string; details?: unknown } | null;
      try {
        const responseText = await response.text();
        if (!responseText.trim()) {
          // Empty response body
          data = null;
        } else {
          try {
            data = JSON.parse(responseText);
          } catch {
            // Not valid JSON, use the text as error message
            throw new Error(responseText || `Server error: ${response.status} ${response.statusText}`);
          }
        }
      } catch (textError) {
        // If we can't even get the text, throw immediately
        if (textError instanceof Error) {
          throw textError;
        }
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      // Check for partial success (some emails sent, some failed) - check this BEFORE checking response.ok
      if (response.ok && typeof data === 'object' && data !== null) {
        if (data.successCount !== undefined && data.failedCount !== undefined && data.failedCount > 0) {
          // Partial success - some emails sent, some failed
          const failedEmails = data.failedEmails || [];
          const failedList = failedEmails.map((fe) => `${fe.email}${fe.error ? ` (${fe.error})` : ''}`).join(', ');
          const partialMsg = data.message || `Email sent to ${data.successCount} of ${(data.successCount || 0) + (data.failedCount || 0)} recipients.`;
          
          // Show both success and error messages
          if (data.successCount > 0) {
            setSuccess(true);
            setError(`Partial success: ${partialMsg} Failed: ${failedList}`);
            setTimeout(() => {
              onClose();
              setEmails('');
              setCarrierName('');
              setSuccess(false);
              setError('');
              setSelectedDocuments({ bol: true, sds: [] });
            }, 5000);
          } else {
            // All failed (shouldn't happen if response.ok, but handle it)
            setError(`All emails failed to send. ${failedList}`);
          }
          return;
        }
      }

      if (!response.ok) {
        // Show detailed error message if available
        let errorMsg = 'Failed to send email';
        if (data && typeof data === 'object' && data !== null) {
          // Try to get the most specific error message
          const details = data.details as Record<string, unknown> | string | undefined;
          errorMsg =
            data.message ||
            data.error ||
            (typeof details === 'object' && details !== null && typeof details.error === 'string' ? details.error : null) ||
            (typeof details === 'object' && details !== null && typeof details.message === 'string' ? details.message : null) ||
            (typeof details === 'string' ? details : null) ||
            `Server error: ${response.status} ${response.statusText}`;
          
          // If we still have a generic message, try to stringify the whole response for debugging
          if (errorMsg === 'Failed to send email' && process.env.NODE_ENV === 'development') {
            console.error('Full error response:', data);
            errorMsg = `Server error: ${JSON.stringify(data).substring(0, 200)}`;
          }
        } else if (data && typeof data === 'string') {
          errorMsg = data;
        } else {
          errorMsg = `Server error: ${response.status} ${response.statusText}`;
        }
        
        // Log error details for debugging
        console.error('BOL Email API Error:', 
          `Status: ${response?.status ?? 'unknown'}`,
          `StatusText: ${response?.statusText ?? 'unknown'}`,
          `ErrorMsg: ${errorMsg || 'Unknown error'}`,
          data !== undefined && data !== null ? `Data: ${JSON.stringify(data)}` : 'No data'
        );
        
        throw new Error(errorMsg);
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
        setEmails('');
        setCarrierName('');
        setSuccess(false);
        setSelectedDocuments({ bol: true, sds: [] });
      }, 2000);
    } catch (err) {
      let errorMessage = 'Failed to send email';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else if (err && typeof err === 'object') {
        // Handle error objects
        errorMessage = (err as Record<string, unknown>).message as string || (err as Record<string, unknown>).error as string || JSON.stringify(err);
      }
      setError(errorMessage);
      console.error('BOL Email Error:', err);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6">
          <h2 className="text-xl font-semibold text-slate-900">
            Email Bill of Lading
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Send the Bill of Lading to the carrier
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

      {success && (
        <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-600">
          Bill of Lading sent successfully to all recipients!
        </div>
      )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="carrier-name"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Carrier Name (Optional)
            </label>
            <input
              id="carrier-name"
              type="text"
              value={carrierName}
              onChange={(e) => setCarrierName(e.target.value)}
              placeholder="e.g., FedEx, UPS, etc."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              disabled={sending}
            />
          </div>

          <div>
            <label
              htmlFor="emails"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Email Address(es) <span className="text-red-500">*</span>
            </label>
            <textarea
              id="emails"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="carrier@example.com&#10;carrier2@example.com&#10;carrier3@example.com"
              rows={3}
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
              disabled={sending}
            />
            <p className="mt-1 text-xs text-slate-500">
              Enter one or more email addresses, separated by commas or on separate lines
            </p>
          </div>

          {/* Documents Selection */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documents to Send
            </h3>
            
            <div className="space-y-3">
              {/* BOL Checkbox */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedDocuments.bol}
                  onChange={handleToggleBOL}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  disabled={sending}
                />
                <span className="text-sm text-slate-700 font-medium">
                  Bill of Lading (PDF)
                </span>
              </label>

              {/* SDS Documents */}
              {loadingDocuments ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading SDS documents...
                </div>
              ) : sdsDocuments.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                      Safety Data Sheets ({sdsDocuments.length})
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllSDS}
                        className="text-xs text-emerald-600 hover:text-emerald-700"
                        disabled={sending}
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={handleDeselectAllSDS}
                        className="text-xs text-slate-600 hover:text-slate-700"
                        disabled={sending}
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-2 pl-6">
                    {sdsDocuments.map((doc) => (
                      <label
                        key={doc.url}
                        className="flex items-start gap-2 cursor-pointer group"
                      >
                        <input
                          type="checkbox"
                          checked={selectedDocuments.sds.includes(doc.url)}
                          onChange={() => handleToggleSDS(doc.url)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          disabled={sending}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-slate-700 group-hover:text-slate-900">
                            {doc.name}
                          </span>
                          <p className="text-xs text-slate-500 mt-0.5">
                            From: {doc.productName}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500 pl-6">
                  No SDS documents found for this order
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="flex-1"
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={sending || !emails.trim()}
              className="flex-1"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

