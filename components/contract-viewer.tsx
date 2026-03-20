'use client';

import { useState } from 'react';

interface ContractProduct {
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
}

interface ContractContent {
  template: string;
  effective_date: string;
  expiry_date?: string | null;
  supplier_name: string;
  supplier_company: string;
  supplier_address_street?: string | null;
  supplier_address_city?: string | null;
  supplier_address_state?: string | null;
  supplier_address_zip?: string | null;
  terms: string;
  custom_clauses?: string[];
  products: ContractProduct[];
  version_notes?: string | null;
}

interface VersionHistoryItem {
  id: string;
  version: number;
  status: string;
  created_at: string;
  contract_date: string;
}

interface ContractViewerProps {
  content: ContractContent;
  version: number;
  status: string;
  adminSignedAt?: string | null;
  adminSignedByName?: string | null;
  supplierSignedAt?: string | null;
  supplierSignedByName?: string | null;
  versionHistory?: VersionHistoryItem[];
  showVersionHistory?: boolean;
  onViewVersion?: (contractId: string) => void;
  onCreateNewVersion?: () => void;
}

export function ContractViewer({
  content,
  version,
  status,
  adminSignedAt,
  adminSignedByName,
  supplierSignedAt,
  supplierSignedByName,
  versionHistory,
  showVersionHistory = false,
  onViewVersion,
  onCreateNewVersion,
}: ContractViewerProps) {
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const isLatest = !versionHistory || versionHistory.length === 0 ||
    versionHistory[0]?.version === version;

  const getStatusBadge = (s: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-200 text-gray-800',
      pending_supplier_signature: 'bg-yellow-200 text-yellow-800',
      active: 'bg-green-200 text-green-800',
      expired: 'bg-red-200 text-red-800',
      superseded: 'bg-gray-300 text-gray-600',
    };
    return styles[s] || 'bg-gray-200 text-gray-800';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      {/* Contract Header */}
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Supply Agreement</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getStatusBadge(status)}`}>
                {status.replace(/_/g, ' ')}
              </span>
              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                Version {version}{isLatest ? ' (Latest)' : ''}
              </span>
            </div>
          </div>
          {showVersionHistory && status === 'active' && onCreateNewVersion && (
            <button
              onClick={onCreateNewVersion}
              className="px-3 py-1.5 text-sm bg-brand-primary text-white rounded hover:opacity-90 hover:cursor-pointer"
            >
              Create New Version
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Party A</p>
            <p className="text-lg font-semibold text-gray-900">Innovative CropCare, LLC</p>
            <p className="text-sm text-gray-600">3800 Camp Creek Pkwy, Building 1400</p>
            <p className="text-sm text-gray-600">Atlanta, GA 30331</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Party B</p>
            <p className="text-lg font-semibold text-gray-900">{content.supplier_company}</p>
            <p className="text-sm text-gray-600">{content.supplier_name}</p>
            {content.supplier_address_street && (
              <p className="text-sm text-gray-600">{content.supplier_address_street}</p>
            )}
            {(content.supplier_address_city || content.supplier_address_state || content.supplier_address_zip) && (
              <p className="text-sm text-gray-600">
                {[
                  content.supplier_address_city,
                  content.supplier_address_state,
                  content.supplier_address_zip,
                ].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className="border-b border-gray-200 p-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-medium text-gray-500">Effective Date</p>
            <p className="text-gray-900">{new Date(content.effective_date + 'T00:00:00').toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Expiry Date</p>
            <p className="text-gray-900">
              {content.expiry_date
                ? new Date(content.expiry_date + 'T00:00:00').toLocaleDateString()
                : 'No expiry'}
            </p>
          </div>
        </div>
      </div>

      {/* Version Notes */}
      {content.version_notes && (
        <div className="border-b border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Version Notes</h3>
          <p className="text-sm text-gray-700 bg-blue-50 border border-blue-100 rounded p-3">
            {content.version_notes}
          </p>
        </div>
      )}

      {/* Terms */}
      <div className="border-b border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Terms and Conditions</h3>
        <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {content.terms}
        </div>
      </div>

      {/* Custom Clauses */}
      {content.custom_clauses && content.custom_clauses.length > 0 && (
        <div className="border-b border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Additional Clauses</h3>
          <ol className="list-decimal list-inside space-y-2">
            {content.custom_clauses.map((clause, i) => (
              <li key={i} className="text-sm text-gray-700">{clause}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Products and Pricing Table */}
      <div className="border-b border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Products and Pricing Schedule
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left font-medium text-gray-600">Product</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">SKU</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Supplier Cost</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Store Price</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">ICC %</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Supplier %</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">ICC Gets</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Supplier Gets</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Unit</th>
              </tr>
            </thead>
            <tbody>
              {content.products.map((product, i) => (
                <tr key={product.product_id || i} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium text-gray-900">{product.name}</td>
                  <td className="px-3 py-2 text-gray-600">{product.sku || '-'}</td>
                  <td className="px-3 py-2 text-right text-gray-900">${product.supplier_price}</td>
                  <td className="px-3 py-2 text-right text-gray-900">${product.store_price}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{product.margin_split_icc_percent}%</td>
                  <td className="px-3 py-2 text-right text-gray-600">{product.margin_split_supplier_percent}%</td>
                  <td className="px-3 py-2 text-right text-green-700">${product.icc_margin_amount}</td>
                  <td className="px-3 py-2 text-right text-green-700">${product.supplier_margin_amount}</td>
                  <td className="px-3 py-2 text-gray-600">{product.unit_of_measure || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Signatures */}
      <div className="border-b border-gray-200 p-6">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap');`}</style>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Signatures</h3>
        <div className="grid grid-cols-2 gap-6">
          {/* Admin / ICC signature */}
          <div className="border rounded p-4">
            <p className="text-xs font-semibold text-gray-600 mb-3">Innovative CropCare, LLC</p>
            {adminSignedAt ? (
              <div>
                <p
                  className="text-green-800 mb-1"
                  style={{ fontFamily: "'Dancing Script', cursive", fontSize: '1.6rem', lineHeight: 1.2 }}
                >
                  {adminSignedByName || 'Admin'}
                </p>
                <div className="border-t border-gray-400 pt-1">
                  <p className="text-xs text-gray-500">Authorized Signature</p>
                  <p className="text-xs text-green-700 mt-0.5">
                    Signed by {adminSignedByName || 'Admin'} on {new Date(adminSignedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <div className="border-t border-dashed border-gray-300 mt-8 pt-1">
                  <p className="text-xs text-gray-500">Authorized Signature</p>
                  <p className="text-xs text-gray-400 italic mt-0.5">Signature pending</p>
                </div>
              </div>
            )}
          </div>
          {/* Supplier signature */}
          <div className="border rounded p-4">
            <p className="text-xs font-semibold text-gray-600 mb-3">{content.supplier_company}</p>
            {supplierSignedAt ? (
              <div>
                <p
                  className="text-green-800 mb-1"
                  style={{ fontFamily: "'Dancing Script', cursive", fontSize: '1.6rem', lineHeight: 1.2 }}
                >
                  {supplierSignedByName || content.supplier_name}
                </p>
                <div className="border-t border-gray-400 pt-1">
                  <p className="text-xs text-gray-500">Authorized Signature</p>
                  <p className="text-xs text-green-700 mt-0.5">
                    Signed by {supplierSignedByName || content.supplier_name} on {new Date(supplierSignedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <div className="border-t border-dashed border-gray-300 mt-8 pt-1">
                  <p className="text-xs text-gray-500">Authorized Signature</p>
                  <p className="text-xs text-gray-400 italic mt-0.5">Signature pending</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Version History (admin only) */}
      {showVersionHistory && versionHistory && versionHistory.length > 1 && (
        <div className="p-6">
          <button
            onClick={() => setHistoryExpanded(!historyExpanded)}
            className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2 hover:cursor-pointer"
          >
            Version History ({versionHistory.length} versions)
            <span className="text-xs">{historyExpanded ? '\u25B2' : '\u25BC'}</span>
          </button>
          {historyExpanded && (
            <div className="mt-3 space-y-2">
              {versionHistory.map((v) => (
                <div
                  key={v.id}
                  className={`flex items-center justify-between p-3 rounded border ${
                    v.version === version ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">v{v.version}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(v.status)}`}>
                      {v.status.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(v.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {v.version !== version && onViewVersion && (
                    <button
                      onClick={() => onViewVersion(v.id)}
                      className="text-xs text-blue-600 hover:underline hover:cursor-pointer"
                    >
                      View
                    </button>
                  )}
                  {v.version === version && (
                    <span className="text-xs text-blue-600 font-medium">Current</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
