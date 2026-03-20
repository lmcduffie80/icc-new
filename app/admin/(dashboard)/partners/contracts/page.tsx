'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ContractUploadForm } from '@/components/admin/contract-upload-form';
import { ContractDetailModal } from '@/components/admin/contract-detail-modal';

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
  supplier_name: string;
  supplier_company_name: string;
  contract_type: string;
  contract_date: string;
  expiry_date?: string | null;
  version: number;
  status: string;
  file_url: string;
  filename: string;
  content?: ContractContent | null;
  parent_contract_id?: string | null;
  admin_signed_at?: string | null;
  admin_signed_by_name?: string | null;
  supplier_signed_at?: string | null;
  created_at: string;
}

export default function ContractsPage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [filters, setFilters] = useState({ status: '', contractType: '', search: '' });

  const fetchContracts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.contractType) params.set('contractType', filters.contractType);
      if (filters.search) params.set('search', filters.search);

      const response = await fetch(`/api/admin/contracts?${params}`);
      const data = await response.json();
      setContracts(data.contracts || []);
    } catch (error) {
      console.error('Failed to fetch contracts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const handleSign = async (contractId: string) => {
    if (!confirm('Are you sure you want to sign this contract?')) return;

    try {
      const response = await fetch(`/api/admin/contracts/${contractId}/sign`, {
        method: 'POST',
      });

      if (response.ok) {
        alert('Contract signed successfully');
        fetchContracts();
        setSelectedContract(null);
      } else {
        alert('Failed to sign contract');
      }
    } catch (error) {
      console.error('Failed to sign contract:', error);
      alert('Failed to sign contract');
    }
  };

  const handleDelete = async (contractId: string) => {
    if (!confirm('Are you sure you want to delete this contract?')) return;

    try {
      const response = await fetch(`/api/admin/contracts/${contractId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('Contract deleted successfully');
        fetchContracts();
        setSelectedContract(null);
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete contract');
      }
    } catch (error) {
      console.error('Failed to delete contract:', error);
      alert('Failed to delete contract');
    }
  };

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
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Supplier Contracts</h1>
          <p className="text-sm text-gray-500 mt-1">Create, manage, and send contracts to suppliers</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => router.push('/admin/partners/contracts/new')}
            className="bg-green-700 hover:bg-green-800 text-white px-6 py-2 font-semibold hover:cursor-pointer"
          >
            + Create Contract
          </Button>
          <Button
            onClick={() => setShowUploadForm(true)}
            className="bg-white text-gray-600 border border-gray-300 hover:bg-gray-50 hover:cursor-pointer"
          >
            Upload PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-end">
        <div className="flex-1">
          <label htmlFor="search-filter" className="block text-sm font-medium mb-1">Search</label>
          <input
            id="search-filter"
            type="text"
            placeholder="Search by supplier name or filename..."
            className="w-full border rounded px-3 py-2"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="status-filter" className="block text-sm font-medium mb-1">Status</label>
          <select
            id="status-filter"
            className="border rounded px-3 py-2"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="pending_supplier_signature">Pending Signature</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="superseded">Superseded</option>
          </select>
        </div>

        <div>
          <label htmlFor="type-filter" className="block text-sm font-medium mb-1">Contract Type</label>
          <select
            id="type-filter"
            className="border rounded px-3 py-2"
            value={filters.contractType}
            onChange={(e) => setFilters({ ...filters, contractType: e.target.value })}
          >
            <option value="">All Types</option>
            <option value="Supply Agreement">Supply Agreement</option>
            <option value="Service Agreement">Service Agreement</option>
            <option value="NDA">NDA</option>
            <option value="Pricing Agreement">Pricing Agreement</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      {/* Contracts Table */}
      {loading ? (
        <p>Loading contracts...</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left">Supplier</th>
                <th className="px-4 py-3 text-left">Contract Type</th>
                <th className="px-4 py-3 text-left">Contract Date</th>
                <th className="px-4 py-3 text-left">Expiry Date</th>
                <th className="px-4 py-3 text-left">Version</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contracts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No contracts found
                  </td>
                </tr>
              ) : (
                contracts.map((contract) => (
                  <tr key={contract.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>{contract.supplier_company_name}</div>
                      <div className="text-sm text-gray-500">{contract.supplier_name}</div>
                    </td>
                    <td className="px-4 py-3">{contract.contract_type}</td>
                    <td className="px-4 py-3">{new Date(contract.contract_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {contract.expiry_date ? new Date(contract.expiry_date).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-3">{contract.version}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs ${getStatusBadge(contract.status)}`}>
                        {contract.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button
                          onClick={() => setSelectedContract(contract)}
                          className="text-sm"
                        >
                          View
                        </Button>
                        {contract.status === 'active' && contract.content && (
                          <Button
                            onClick={() => router.push(`/admin/partners/contracts/new?from=${contract.id}`)}
                            className="text-sm bg-blue-600 hover:bg-blue-700"
                          >
                            New Version
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Form Modal */}
      {showUploadForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <ContractUploadForm
              onSuccess={() => {
                setShowUploadForm(false);
                fetchContracts();
              }}
              onCancel={() => setShowUploadForm(false)}
            />
          </div>
        </div>
      )}

      {/* Contract Detail Modal */}
      {selectedContract && (
        <ContractDetailModal
          contract={selectedContract}
          onClose={() => setSelectedContract(null)}
          onSign={() => handleSign(selectedContract.id)}
          onDelete={() => handleDelete(selectedContract.id)}
          onRefresh={fetchContracts}
          onCreateNewVersion={
            selectedContract.status === 'active' && selectedContract.content
              ? () => router.push(`/admin/partners/contracts/new?from=${selectedContract.id}`)
              : undefined
          }
        />
      )}
    </div>
  );
}
