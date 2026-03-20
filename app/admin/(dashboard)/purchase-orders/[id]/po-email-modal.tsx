'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Loader2, Mail } from 'lucide-react';

interface POEmailModalProps {
  poId: string;
  poNumber: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ContactInfo {
  type: 'vendor' | 'supplier';
  name: string;
  email: string | null;
}

export function POEmailModal({ poId, poNumber, isOpen, onClose, onSuccess }: POEmailModalProps) {
  const [contactInfo, setContactInfo] = useState<ContactInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState(`Purchase Order ${poNumber}`);
  const [message, setMessage] = useState('');

  // Fetch contact info when modal opens
  useEffect(() => {
    if (isOpen && !contactInfo) {
      fetchContactInfo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, poId]);

  const fetchContactInfo = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/purchase-orders/${poId}/contact`);
      if (!response.ok) {
        throw new Error('Failed to fetch contact information');
      }
      const data: ContactInfo = await response.json();
      setContactInfo(data);
      setEmail(data.email || '');
      
      // Set default message
      setMessage(
        `Dear ${data.name},\n\n` +
        `Please find attached Purchase Order ${poNumber}.\n\n` +
        `Please acknowledge receipt at your earliest convenience.\n\n` +
        `Thank you`
      );
    } catch (err) {
      console.error('Error fetching contact info:', err);
      setError('Failed to load contact information');
    } finally {
      setLoading(false);
    }
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSend = async () => {
    // Validate inputs
    if (!email.trim()) {
      setError('Email address is required');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (!subject.trim()) {
      setError('Subject is required');
      return;
    }

    setSending(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/purchase-orders/${poId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email.trim(),
          subject: subject.trim(),
          message: message.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send email');
      }

      onSuccess();
    } catch (err) {
      console.error('Error sending email:', err);
      setError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    if (!sending) {
      onClose();
      // Reset state after close animation
      setTimeout(() => {
        setContactInfo(null);
        setEmail('');
        setSubject(`Purchase Order ${poNumber}`);
        setMessage('');
        setError('');
      }, 300);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
        onClick={handleClose}
        aria-label="Close modal"
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-lg shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
              <Mail className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Email Purchase Order
              </h2>
              <p className="text-sm text-slate-500">PO {poNumber}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={sending}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            </div>
          ) : (
            <>
              {/* Recipient Info */}
              {contactInfo && (
                <div className="rounded-lg bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {contactInfo.type === 'supplier' ? 'Supplier' : 'Vendor'}
                      </p>
                      <p className="text-lg font-semibold text-slate-900">
                        {contactInfo.name}
                      </p>
                    </div>
                    {contactInfo.type === 'vendor' && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                        No email on file
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Email Input */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                  Recipient Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={sending}
                  placeholder="vendor@example.com"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 disabled:opacity-50"
                />
              </div>

              {/* Subject Input */}
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-slate-700 mb-1">
                  Subject <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={sending}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 disabled:opacity-50"
                />
              </div>

              {/* Message Textarea */}
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-slate-700 mb-1">
                  Message <span className="text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={sending}
                  rows={6}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 disabled:opacity-50"
                  placeholder="Add a custom message (optional)"
                />
              </div>

              {/* Attachment Notice */}
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm text-blue-800">
                  <strong>Attachments:</strong> Purchase Order PDF and Terms & Conditions will be automatically attached.
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 bg-slate-50">
          <Button
            onClick={handleClose}
            disabled={sending}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={loading || sending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Send Email
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
