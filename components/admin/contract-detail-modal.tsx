'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ContractViewer } from '@/components/contract-viewer';

interface ContractContent {
  template: string;
  effective_date: string;
  expiry_date?: string | null;
  supplier_name: string;
  supplier_company: string;
  terms: string;
  custom_clauses?: string[];
  products: Array<{
    product_id: string;
    name: string;
    sku?: string | null;
    supplier_price: string;
    store_price: string;
    margin_split_icc_percent: string;
    margin_split_supplier_percent: string;
    icc_margin_amount: string;
    supplier_margin_amount: string;
    unit_of_measure?: string | null;
  }>;
  version_notes?: string | null;
}

interface Contract {
  id: string;
  supplier_name?: string;
  supplier_company_name?: string;
  contract_type: string;
  contract_date: string;
  expiry_date?: string | null;
  notes?: string | null;
  version: number;
  status: string;
  file_url?: string | null;
  filename?: string | null;
  content?: ContractContent | null;
  parent_contract_id?: string | null;
  admin_signed_at?: string | null;
  admin_signed_by_name?: string | null;
  supplier_signed_at?: string | null;
  supplier_signed_by_name?: string | null;
  created_at: string;
}

interface VersionHistoryItem {
  id: string;
  version: number;
  status: string;
  created_at: string;
  contract_date: string;
}

interface ContractDetailModalProps {
  contract: Contract;
  onClose: () => void;
  onSign?: () => void;
  onDelete?: () => void;
  onRefresh?: () => void;
  onCreateNewVersion?: () => void;
}

export function ContractDetailModal({ contract, onClose, onSign: _onSign, onDelete, onRefresh, onCreateNewVersion }: ContractDetailModalProps) {
  void _onSign;
  const [showEmbeddedSigning, setShowEmbeddedSigning] = useState(false);
  const [signingUrl, setSigningUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [versionHistory, setVersionHistory] = useState<VersionHistoryItem[]>([]);
  const [viewingContract, setViewingContract] = useState<Contract>(contract);

  // Email form state
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailName, setEmailName] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailCcAdmin, setEmailCcAdmin] = useState(true);
  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isInAppContract = !!viewingContract.content;

  // Fetch version history for in-app contracts
  useEffect(() => {
    if (!isInAppContract) return;

    async function fetchVersionHistory() {
      try {
        const res = await fetch(`/api/admin/contracts/${contract.id}/versions`);
        if (res.ok) {
          const data = await res.json();
          setVersionHistory(data.versions || []);
        }
      } catch (error) {
        console.error('Failed to fetch version history:', error);
      }
    }
    fetchVersionHistory();
  }, [contract.id, isInAppContract]);

  const handleViewVersion = async (contractId: string) => {
    try {
      const res = await fetch(`/api/admin/contracts/${contractId}`);
      if (res.ok) {
        const data = await res.json();
        setViewingContract(data.contract);
      }
    } catch (error) {
      console.error('Failed to fetch contract version:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-gray-200 text-gray-800',
      pending_signatures: 'bg-blue-200 text-blue-800',
      pending_supplier_signature: 'bg-yellow-200 text-yellow-800',
      active: 'bg-green-200 text-green-800',
      expired: 'bg-red-200 text-red-800',
      superseded: 'bg-gray-300 text-gray-600 line-through',
      signing_failed: 'bg-red-300 text-red-900',
    };
    return styles[status as keyof typeof styles] || 'bg-gray-200 text-gray-800';
  };

  const canSign = !viewingContract.admin_signed_at &&
    (viewingContract.status === 'draft' || viewingContract.status === 'pending_supplier_signature');
  const canDelete = true;

  const handleDownloadPDF = () => {
    window.open(`/api/admin/contracts/${viewingContract.id}/pdf`, '_blank');
  };

  const handleSendEmail = async () => {
    if (!emailTo || !emailName) {
      setEmailStatus({ type: 'error', message: 'Recipient email and name are required.' });
      return;
    }
    setEmailSending(true);
    setEmailStatus(null);
    try {
      const res = await fetch(`/api/admin/contracts/${viewingContract.id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: emailTo,
          recipientName: emailName,
          message: emailMessage || null,
          ccAdmin: emailCcAdmin,
        }),
      });
      if (res.ok) {
        setEmailStatus({ type: 'success', message: 'Contract email sent successfully!' });
        setTimeout(() => {
          setShowEmailForm(false);
          setEmailStatus(null);
        }, 2000);
      } else {
        const data = await res.json();
        setEmailStatus({ type: 'error', message: data.error || 'Failed to send email' });
      }
    } catch (error) {
      console.error('Error sending email:', error);
      setEmailStatus({ type: 'error', message: 'Failed to send email' });
    } finally {
      setEmailSending(false);
    }
  };

  const handleSign = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/contracts/${viewingContract.id}/sign`, {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.signingUrl) {
          setSigningUrl(data.signingUrl);
          setShowEmbeddedSigning(true);
        } else {
          // For in-app contracts, signing may not use DocuSign
          alert('Contract signed successfully');
          if (onRefresh) onRefresh();
          onClose();
        }
      } else {
        const error = await response.json();
        alert(`Failed to initiate signing: ${error.error}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to initiate signing');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {showEmbeddedSigning && signingUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full h-full max-w-6xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">Sign Contract with DocuSign</h3>
              <button
                onClick={() => {
                  setShowEmbeddedSigning(false);
                  if (onRefresh) {
                    onRefresh();
                  }
                }}
                className="text-gray-500 hover:text-gray-700 text-xl font-bold"
              >
                ✕
              </button>
            </div>
            <iframe
              src={signingUrl}
              className="flex-1 w-full border-0"
              title="DocuSign Signing"
            />
          </div>
        </div>
      )}
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <div className="flex justify-between items-start">
            <h2 className="text-2xl font-bold">Contract Details</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 hover:cursor-pointer">
              ✕
            </button>
          </div>

          {isInAppContract && viewingContract.content ? (
            /* In-app structured contract -- use ContractViewer */
            <>
              <ContractViewer
                content={viewingContract.content}
                version={viewingContract.version}
                status={viewingContract.status}
                adminSignedAt={viewingContract.admin_signed_at}
                adminSignedByName={viewingContract.admin_signed_by_name}
                supplierSignedAt={viewingContract.supplier_signed_at}
                supplierSignedByName={viewingContract.supplier_signed_by_name}
                versionHistory={versionHistory}
                showVersionHistory={true}
                onViewVersion={handleViewVersion}
                onCreateNewVersion={onCreateNewVersion}
              />

              {/* Email Form */}
              {showEmailForm && (
                <div className="bg-gray-50 border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-sm">Email Contract</h3>
                    <button
                      onClick={() => { setShowEmailForm(false); setEmailStatus(null); }}
                      className="text-gray-400 hover:text-gray-600 hover:cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {emailStatus && (
                    <div className={`text-sm px-3 py-2 rounded ${emailStatus.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {emailStatus.message}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="email-to" className="block text-xs font-medium text-gray-600 mb-1">Recipient Email *</label>
                      <input
                        id="email-to"
                        type="email"
                        className="w-full border rounded px-3 py-1.5 text-sm"
                        placeholder="supplier@example.com or attorney@lawfirm.com"
                        value={emailTo}
                        onChange={(e) => setEmailTo(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="email-name" className="block text-xs font-medium text-gray-600 mb-1">Recipient Name *</label>
                      <input
                        id="email-name"
                        type="text"
                        className="w-full border rounded px-3 py-1.5 text-sm"
                        placeholder="John Doe"
                        value={emailName}
                        onChange={(e) => setEmailName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="email-message" className="block text-xs font-medium text-gray-600 mb-1">Message (optional)</label>
                    <textarea
                      id="email-message"
                      className="w-full border rounded px-3 py-1.5 text-sm"
                      rows={2}
                      placeholder="Please review the attached contract..."
                      value={emailMessage}
                      onChange={(e) => setEmailMessage(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id="cc-admin"
                      type="checkbox"
                      checked={emailCcAdmin}
                      onChange={(e) => setEmailCcAdmin(e.target.checked)}
                      className="rounded hover:cursor-pointer"
                    />
                    <label htmlFor="cc-admin" className="text-xs text-gray-600 hover:cursor-pointer">CC me (send a copy to admin)</label>
                  </div>

                  <Button
                    onClick={handleSendEmail}
                    disabled={emailSending || !emailTo || !emailName}
                    className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 text-sm hover:cursor-pointer"
                  >
                    {emailSending ? 'Sending...' : 'Send Email with PDF'}
                  </Button>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t flex-wrap">
                {canSign && (
                  <Button
                    onClick={handleSign}
                    disabled={loading}
                    className="bg-green-600 hover:bg-green-700 disabled:opacity-50 hover:cursor-pointer"
                  >
                    {loading ? 'Signing...' : 'Admin Sign'}
                  </Button>
                )}

                <Button
                  onClick={handleDownloadPDF}
                  className="bg-blue-600 hover:bg-blue-700 text-white hover:cursor-pointer"
                >
                  Download PDF
                </Button>

                <Button
                  onClick={() => setShowEmailForm(!showEmailForm)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white hover:cursor-pointer"
                >
                  Email Contract
                </Button>

                {canDelete && onDelete && (
                  <Button onClick={onDelete} className="bg-red-600 hover:bg-red-700 hover:cursor-pointer">
                    Delete
                  </Button>
                )}

                <Button onClick={onClose} className="hover:cursor-pointer">Close</Button>
              </div>
            </>
          ) : (
            /* PDF-based contract -- original display */
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-gray-500">Supplier</div>
                  <p className="font-medium">{viewingContract.supplier_company_name || 'N/A'}</p>
                  <p className="text-sm text-gray-600">{viewingContract.supplier_name}</p>
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-500">Status</div>
                  <p>
                    <span className={`inline-block px-2 py-1 rounded text-sm ${getStatusBadge(viewingContract.status)}`}>
                      {viewingContract.status.replace(/_/g, ' ')}
                    </span>
                  </p>
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-500">Contract Type</div>
                  <p>{viewingContract.contract_type}</p>
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-500">Version</div>
                  <p>{viewingContract.version}</p>
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-500">Contract Date</div>
                  <p>{new Date(viewingContract.contract_date).toLocaleDateString()}</p>
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-500">Expiry Date</div>
                  <p>{viewingContract.expiry_date ? new Date(viewingContract.expiry_date).toLocaleDateString() : 'No expiry'}</p>
                </div>
              </div>

              {viewingContract.notes && (
                <div>
                  <div className="text-sm font-medium text-gray-500">Notes</div>
                  <p className="text-sm">{viewingContract.notes}</p>
                </div>
              )}

              <div className="border-t pt-4 space-y-2">
                <h3 className="font-semibold">Signatures</h3>
                
                <div>
                  <div className="text-sm font-medium text-gray-500">Admin</div>
                  {viewingContract.admin_signed_at ? (
                    <p className="text-sm">
                      Signed by {viewingContract.admin_signed_by_name || 'Admin'} on{' '}
                      {new Date(viewingContract.admin_signed_at).toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500">Not signed</p>
                  )}
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-500">Supplier</div>
                  {viewingContract.supplier_signed_at ? (
                    <p className="text-sm">
                      Signed by {viewingContract.supplier_signed_by_name || viewingContract.supplier_name || 'Supplier'} on {new Date(viewingContract.supplier_signed_at).toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500">Pending signature</p>
                  )}
                </div>
              </div>

              {viewingContract.file_url && viewingContract.filename && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-2">Document</h3>
                  <p className="text-sm text-gray-600 mb-2">{viewingContract.filename}</p>
                  <iframe
                    src={`/api/images/proxy?url=${encodeURIComponent(viewingContract.file_url)}`}
                    className="w-full h-96 border rounded"
                    title="Contract PDF"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t">
                {viewingContract.file_url && viewingContract.filename && (
                  <a
                    href={`/api/images/proxy?url=${encodeURIComponent(viewingContract.file_url)}`}
                    download={viewingContract.filename}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Download
                  </a>
                )}
                
                {canSign && (
                  <Button 
                    onClick={handleSign} 
                    disabled={loading}
                    className="bg-green-600 hover:bg-green-700 disabled:opacity-50"
                  >
                    {loading ? 'Initiating...' : 'Sign with DocuSign'}
                  </Button>
                )}

                {canDelete && onDelete && (
                  <Button onClick={onDelete} className="bg-red-600 hover:bg-red-700">
                    Delete
                  </Button>
                )}

                <Button onClick={onClose}>Close</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
