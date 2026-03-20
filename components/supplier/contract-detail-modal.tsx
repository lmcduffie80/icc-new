'use client';

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
  contract_type: string;
  contract_date: string;
  expiry_date?: string | null;
  notes?: string | null;
  version: number;
  status: string;
  file_url?: string | null;
  filename?: string | null;
  content?: ContractContent | null;
  admin_signed_at?: string | null;
  admin_signed_by_name?: string | null;
  supplier_signed_at?: string | null;
  supplier_signed_by_name?: string | null;
}

interface ContractDetailModalProps {
  contract: Contract;
  onClose: () => void;
  onSign?: () => void;
}

export function ContractDetailModal({ contract, onClose, onSign }: ContractDetailModalProps) {
  const isInAppContract = !!contract.content;
  const canSign = !contract.supplier_signed_at && contract.status === 'pending_supplier_signature' && (contract.admin_signed_at || isInAppContract);

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-gray-200 text-gray-800',
      pending_supplier_signature: 'bg-yellow-200 text-yellow-800',
      active: 'bg-green-200 text-green-800',
      expired: 'bg-red-200 text-red-800',
      superseded: 'bg-gray-300 text-gray-600',
    };
    return styles[status as keyof typeof styles] || 'bg-gray-200 text-gray-800';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <div className="flex justify-between items-start">
            <h2 className="text-2xl font-bold">Contract Details</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 hover:cursor-pointer">
              ✕
            </button>
          </div>

          {isInAppContract && contract.content ? (
            /* In-app structured contract -- use ContractViewer */
            <>
              <ContractViewer
                content={contract.content}
                version={contract.version}
                status={contract.status}
                adminSignedAt={contract.admin_signed_at}
                adminSignedByName={contract.admin_signed_by_name}
                supplierSignedAt={contract.supplier_signed_at}
                supplierSignedByName={contract.supplier_signed_by_name}
                showVersionHistory={false}
              />

              <div className="flex gap-2 pt-4 border-t">
                {canSign && onSign && (
                  <Button onClick={onSign} className="bg-green-600 hover:bg-green-700 hover:cursor-pointer">
                    Sign Contract
                  </Button>
                )}

                <Button
                  onClick={() => window.open(`/api/supplier/contracts/${contract.id}/pdf`, '_blank')}
                  className="bg-blue-600 hover:bg-blue-700 text-white hover:cursor-pointer"
                >
                  Download PDF
                </Button>

                <Button onClick={onClose} className="hover:cursor-pointer">Close</Button>
              </div>
            </>
          ) : (
            /* PDF-based contract -- original display */
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-gray-500">Status</div>
                  <p>
                    <span className={`inline-block px-2 py-1 rounded text-sm ${getStatusBadge(contract.status)}`}>
                      {contract.status.replace(/_/g, ' ')}
                    </span>
                  </p>
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-500">Contract Type</div>
                  <p>{contract.contract_type}</p>
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-500">Version</div>
                  <p>{contract.version}</p>
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-500">Contract Date</div>
                  <p>{new Date(contract.contract_date).toLocaleDateString()}</p>
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-500">Expiry Date</div>
                  <p>{contract.expiry_date ? new Date(contract.expiry_date).toLocaleDateString() : 'No expiry'}</p>
                </div>
              </div>

              {contract.notes && (
                <div>
                  <div className="text-sm font-medium text-gray-500">Notes</div>
                  <p className="text-sm">{contract.notes}</p>
                </div>
              )}

              <div className="border-t pt-4 space-y-2">
                <h3 className="font-semibold">Signatures</h3>
                
                <div>
                  <div className="text-sm font-medium text-gray-500">Admin</div>
                  {contract.admin_signed_at ? (
                    <p className="text-sm">
                      Signed by {contract.admin_signed_by_name || 'Admin'} on{' '}
                      {new Date(contract.admin_signed_at).toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500">Not signed yet</p>
                  )}
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-500">Your Signature</div>
                  {contract.supplier_signed_at ? (
                    <p className="text-sm">
                      Signed by {contract.supplier_signed_by_name || 'Supplier'} on {new Date(contract.supplier_signed_at).toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500">Pending your signature</p>
                  )}
                </div>
              </div>

              {contract.file_url && contract.filename && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-2">Document</h3>
                  <p className="text-sm text-gray-600 mb-2">{contract.filename}</p>
                  <iframe
                    src={`/api/images/proxy?url=${encodeURIComponent(contract.file_url)}`}
                    className="w-full h-96 border rounded"
                    title="Contract PDF"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t">
                {contract.file_url && contract.filename && (
                  <a
                    href={`/api/images/proxy?url=${encodeURIComponent(contract.file_url)}`}
                    download={contract.filename}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Download
                  </a>
                )}
                
                {canSign && onSign && (
                  <Button onClick={onSign} className="bg-green-600 hover:bg-green-700">
                    Sign Contract
                  </Button>
                )}

                <Button onClick={onClose}>Close</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
