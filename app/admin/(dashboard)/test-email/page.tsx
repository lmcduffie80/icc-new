'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, Mail, FileText } from 'lucide-react';

export default function TestEmailPage() {
  const [testing, setTesting] = useState(false);
  const [testType, setTestType] = useState<'pdfshift' | 'sds' | null>(null);
  const [result, setResult] = useState<{ success?: boolean; messageId?: string; error?: string; details?: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [sdsUrl, setSdsUrl] = useState('');

  const testPDFShift = async () => {
    setTesting(true);
    setTestType('pdfshift');
    setResult(null);
    setError(null);

    try {
      const response = await fetch('/api/test-pdfshift-resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Test failed');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const testSDS = async () => {
    if (!sdsUrl.trim()) {
      setError('Please enter an SDS URL');
      return;
    }

    setTesting(true);
    setTestType('sds');
    setResult(null);
    setError(null);

    try {
      const response = await fetch('/api/test-sds-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdsUrl, email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Test failed');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const testPDFShiftAPI = async () => {
    setTesting(true);
    setTestType('pdfshift');
    setResult(null);
    setError(null);

    try {
      const response = await fetch('/api/test-pdfshift');
      const data = await response.json();

      if (!response.ok) {
        throw new Error('Test failed');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Email & PDF Testing</h1>

      <div className="space-y-8">
        {/* PDFShift API Test */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Test 1: PDFShift API
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Test if PDFShift API is working and can generate PDFs.
          </p>
          <Button
            onClick={testPDFShiftAPI}
            disabled={testing}
            className="w-full sm:w-auto"
          >
            {testing && testType === 'pdfshift' ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              'Test PDFShift API'
            )}
          </Button>
        </div>

        {/* PDFShift + Resend Test */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Test 2: PDFShift + Resend Email
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Test if PDFShift can generate a PDF and Resend can send it as an email attachment.
          </p>
          <div className="space-y-4">
            <div>
              <label htmlFor="email-address" className="block text-sm font-medium mb-1">
                Email Address
              </label>
              <input
                id="email-address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
                disabled={testing}
              />
            </div>
            <Button
              onClick={testPDFShift}
              disabled={testing || !email.trim()}
              className="w-full sm:w-auto"
            >
              {testing && testType === 'pdfshift' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Test PDFShift + Resend
                </>
              )}
            </Button>
          </div>
        </div>

        {/* SDS Document Test */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Test 3: SDS Document Email
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Test if SDS documents can be fetched (from S3 or external URL) and sent via Resend.
          </p>
          <div className="space-y-4">
            <div>
              <label htmlFor="sds-email-address" className="block text-sm font-medium mb-1">
                Email Address
              </label>
              <input
                id="sds-email-address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
                disabled={testing}
              />
            </div>
            <div>
              <label htmlFor="sds-url" className="block text-sm font-medium mb-1">
                SDS Document URL
              </label>
              <input
                id="sds-url"
                type="url"
                value={sdsUrl}
                onChange={(e) => setSdsUrl(e.target.value)}
                placeholder="https://example.com/sds.pdf or s3://bucket/key"
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
                disabled={testing}
              />
            </div>
            <Button
              onClick={testSDS}
              disabled={testing || !email.trim() || !sdsUrl.trim()}
              className="w-full sm:w-auto"
            >
              {testing && testType === 'sds' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Test SDS Email
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Results */}
        {(result || error) && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Test Results</h2>
            {error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-600">
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">Error</span>
                </div>
                <p className="mt-2 text-sm text-red-700">{error}</p>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-600 mb-2">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Success</span>
                </div>
                <pre className="text-xs bg-white p-3 rounded overflow-auto max-h-96">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

