'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ContractDetailModal } from '@/components/supplier/contract-detail-modal';
import { SignContractModal } from '@/components/supplier/sign-contract-modal';

interface Contract {
  id: string;
  contract_type: string;
  contract_date: string;
  expiry_date?: string | null;
  version: number;
  status: string;
  file_url: string;
  filename: string;
  admin_signed_at?: string | null;
  supplier_signed_at?: string | null;
  created_at: string;
}

export default function SupplierContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [signingContract, setSigningContract] = useState<Contract | null>(null);
  const [filters, setFilters] = useState({ status: '', contractType: '' });

  const fetchContracts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.contractType) params.set('contractType', filters.contractType);

      const response = await fetch(`/api/supplier/contracts?${params}`);
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

  const handleSign = async () => {
    if (!signingContract) return;

    try {
      const response = await fetch(`/api/supplier/contracts/${signingContract.id}/sign`, {
        method: 'POST',
      });

      if (response.ok) {
        alert('Contract signed successfully');
        fetchContracts();
        setSigningContract(null);
        setSelectedContract(null);
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to sign contract');
      }
    } catch (error) {
      console.error('Failed to sign contract:', error);
      alert('Failed to sign contract');
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

  const needsSignature = (contract: Contract) => {
    return !contract.supplier_signed_at && 
           contract.status === 'pending_supplier_signature' && 
           contract.admin_signed_at;
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Contracts</h1>

      {/* Pending Signatures Alert */}
      {contracts.some(needsSignature) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
          <p className="font-medium text-yellow-800">
            You have {contracts.filter(needsSignature).length} contract(s) pending your signature
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4">
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

      {/* Contracts List */}
      {loading ? (
        <p>Loading contracts...</p>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {contracts.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No contracts found</p>
            ) : (
              contracts.map((contract) => (
                <div
                  key={contract.id}
                  className={`border rounded-lg p-4 space-y-3 ${needsSignature(contract) ? 'bg-yellow-50 border-yellow-200' : 'bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{contract.contract_type}</span>
                    <span className={`inline-block px-2 py-1 rounded text-xs shrink-0 ${getStatusBadge(contract.status)}`}>
                      {contract.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>Contract Date: {new Date(contract.contract_date).toLocaleDateString()}</p>
                    <p>Expiry: {contract.expiry_date ? new Date(contract.expiry_date).toLocaleDateString() : '-'}</p>
                    <p>Version: {contract.version}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => setSelectedContract(contract)} className="flex-1 text-sm">
                      View
                    </Button>
                    {needsSignature(contract) && (
                      <Button
                        onClick={() => setSigningContract(contract)}
                        className="flex-1 text-sm bg-green-600 hover:bg-green-700"
                      >
                        Sign
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
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
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No contracts found
                    </td>
                  </tr>
                ) : (
                  contracts.map((contract) => (
                    <tr
                      key={contract.id}
                      className={`border-t hover:bg-gray-50 ${needsSignature(contract) ? 'bg-yellow-50' : ''}`}
                    >
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
                      <td className="px-4 py-3 space-x-2">
                        <Button
                          onClick={() => setSelectedContract(contract)}
                          className="text-sm"
                        >
                          View
                        </Button>
                        {needsSignature(contract) && (
                          <Button
                            onClick={() => setSigningContract(contract)}
                            className="text-sm bg-green-600 hover:bg-green-700"
                          >
                            Sign
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Contract Detail Modal */}
      {selectedContract && (
        <ContractDetailModal
          contract={selectedContract}
          onClose={() => setSelectedContract(null)}
          onSign={() => setSigningContract(selectedContract)}
        />
      )}

      {/* Sign Contract Modal */}
      {signingContract && (
        <SignContractModal
          contract={signingContract}
          onConfirm={handleSign}
          onCancel={() => setSigningContract(null)}
        />
      )}
    </div>
  );
}
