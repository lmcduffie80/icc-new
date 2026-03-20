'use client';

import { useState } from 'react';
import { FileText, Receipt, Mail, Download, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InvoiceActionsProps {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
}

export function InvoiceActions({ orderId, orderNumber, customerEmail }: InvoiceActionsProps) {
  const [sendingEmail, setSendingEmail] = useState<'invoice' | 'quote' | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailType, setEmailType] = useState<'invoice' | 'quote'>('invoice');
  const [emailAddress, setEmailAddress] = useState(customerEmail);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState(false);

  const handleEmail = async (type: 'invoice' | 'quote') => {
    setEmailType(type);
    setEmailAddress(customerEmail);
    setEmailError('');
    setEmailSuccess(false);
    setEmailModalOpen(true);
  };

  const sendEmail = async () => {
    if (!emailAddress.trim()) {
      setEmailError('Please enter an email address');
      return;
    }

    setSendingEmail(emailType);
    setEmailError('');
    setEmailSuccess(false);

    try {
      const response = await fetch('/api/admin/invoices/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          type: emailType,
          email: emailAddress.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send email');
      }

      setEmailSuccess(true);
      setTimeout(() => {
        setEmailModalOpen(false);
        setEmailSuccess(false);
      }, 2000);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setSendingEmail(null);
    }
  };

  return (
    <>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => handleEmail('invoice')}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <Mail className="h-4 w-4 mr-2" />
            Email Invoice
          </Button>
          <Button
            onClick={() => handleEmail('quote')}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <Mail className="h-4 w-4 mr-2" />
            Email Quote
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full"
          >
            <a
              href={`/api/admin/invoices/generate?orderId=${orderId}&type=invoice&download=true`}
              download={`invoice-${orderNumber}.pdf`}
            >
              <Download className="h-4 w-4 mr-2" />
              Download Invoice
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full"
          >
            <a
              href={`/api/admin/invoices/generate?orderId=${orderId}&type=quote&download=true`}
              download={`quote-${orderNumber}.pdf`}
            >
              <Download className="h-4 w-4 mr-2" />
              Download Quote
            </a>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full"
          >
            <a
              href={`/api/admin/invoices/generate?orderId=${orderId}&type=invoice&download=true`}
              download={`invoice-${orderNumber}.pdf`}
            >
              <FileText className="h-4 w-4 mr-2" />
              View Invoice
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full"
          >
            <a
              href={`/api/admin/invoices/generate?orderId=${orderId}&type=quote&download=true`}
              download={`quote-${orderNumber}.pdf`}
            >
              <Receipt className="h-4 w-4 mr-2" />
              View Quote
            </a>
          </Button>
        </div>
      </div>

      {/* Email Modal */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <button
              onClick={() => setEmailModalOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mb-6">
              <h2 className="text-xl font-semibold text-slate-900">
                Email {emailType === 'invoice' ? 'Invoice' : 'Quote'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Send the {emailType} to the customer
              </p>
            </div>

            {emailError && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {emailError}
              </div>
            )}

            {emailSuccess && (
              <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-600">
                {emailType === 'invoice' ? 'Invoice' : 'Quote'} sent successfully!
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  disabled={sendingEmail !== null}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => setEmailModalOpen(false)}
                  variant="outline"
                  className="flex-1"
                  disabled={sendingEmail !== null}
                >
                  Cancel
                </Button>
                <Button
                  onClick={sendEmail}
                  disabled={sendingEmail !== null || !emailAddress.trim()}
                  className="flex-1"
                >
                  {sendingEmail === emailType ? (
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}

