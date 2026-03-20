'use client';

import { useState, useEffect } from 'react';
import type { InventoryTransaction, TransactionType } from '@/lib/inventory-transactions';

interface TransactionFilters {
  startDate: string;
  endDate: string;
  transaction_type: string;
  search: string;
  warehouse_id: string;
  product_id: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface TransactionResponse {
  transactions: InventoryTransaction[];
  pagination: PaginationInfo;
  filters: TransactionFilters;
}

const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  goods_receipt: 'Goods Receipt',
  goods_issue: 'Goods Issue',
  transfer: 'Transfer',
  adjustment_positive: 'Adjustment (+)',
  adjustment_negative: 'Adjustment (-)',
  return_from_customer: 'Customer Return',
  return_to_supplier: 'Supplier Return',
};

const TRANSACTION_TYPE_COLORS: Record<TransactionType, string> = {
  goods_receipt: 'bg-emerald-100 text-emerald-700',
  goods_issue: 'bg-red-100 text-red-700',
  transfer: 'bg-blue-100 text-blue-700',
  adjustment_positive: 'bg-green-100 text-green-700',
  adjustment_negative: 'bg-orange-100 text-orange-700',
  return_from_customer: 'bg-purple-100 text-purple-700',
  return_to_supplier: 'bg-yellow-100 text-yellow-700',
};

export function TransactionReportClient() {
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 50,
    totalCount: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // Filter states
  const [filters, setFilters] = useState<TransactionFilters>({
    startDate: '',
    endDate: '',
    transaction_type: '',
    search: '',
    warehouse_id: '',
    product_id: '',
  });

  // Fetch transactions
  const fetchTransactions = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.append('page', pagination.page.toString());
      params.append('limit', pagination.limit.toString());

      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.transaction_type) params.append('transaction_type', filters.transaction_type);
      if (filters.search) params.append('search', filters.search);
      if (filters.warehouse_id) params.append('warehouse_id', filters.warehouse_id);
      if (filters.product_id) params.append('product_id', filters.product_id);

      const response = await fetch(`/api/admin/reports/transactions?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }

      const data: TransactionResponse = await response.json();
      setTransactions(data.transactions);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch transactions on mount and when filters/pagination change
  useEffect(() => {
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, filters]);

  const handleFilterChange = (key: keyof TransactionFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page on filter change
  };

  const handleClearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      transaction_type: '',
      search: '',
      warehouse_id: '',
      product_id: '',
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const formatDate = (dateString: string | Date) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatQuantity = (quantity: number) => {
    const absQty = Math.abs(quantity);
    if (quantity >= 0) {
      return `+${absQty}`;
    }
    return `-${absQty}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Material Transactions</h1>
        <p className="text-slate-600 mt-1">
          Complete inventory movement history (MB51)
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Filters</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Date Range */}
          <div>
            <label htmlFor="filter-start-date" className="block text-sm font-medium text-slate-700 mb-1">
              Start Date
            </label>
            <input
              id="filter-start-date"
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label htmlFor="filter-end-date" className="block text-sm font-medium text-slate-700 mb-1">
              End Date
            </label>
            <input
              id="filter-end-date"
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Transaction Type */}
          <div>
            <label htmlFor="filter-transaction-type" className="block text-sm font-medium text-slate-700 mb-1">
              Transaction Type
            </label>
            <select
              id="filter-transaction-type"
              value={filters.transaction_type}
              onChange={(e) => handleFilterChange('transaction_type', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">All Types</option>
              {Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="md:col-span-2 lg:col-span-3">
            <label htmlFor="filter-search" className="block text-sm font-medium text-slate-700 mb-1">
              Search
            </label>
            <input
              id="filter-search"
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="Search by product name, SKU, transaction number, or reference..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleClearFilters}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white rounded-lg border border-slate-200">
        {/* Pagination Info */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <p className="text-sm text-slate-600">
            Showing {transactions.length > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.totalCount)} of{' '}
            {pagination.totalCount} transactions
          </p>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={!pagination.hasPrevPage || loading}
              className="px-3 py-1 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={!pagination.hasNextPage || loading}
              className="px-3 py-1 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-red-600">{error}</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-slate-500">No transactions found</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Transaction #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    SKU
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Warehouse
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Reference
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    User
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {transactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {formatDate(transaction.posting_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                      {transaction.transaction_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          TRANSACTION_TYPE_COLORS[transaction.transaction_type]
                        }`}
                      >
                        {TRANSACTION_TYPE_LABELS[transaction.transaction_type]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900">
                      {transaction.product_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {transaction.product_sku}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                      <span
                        className={`font-medium ${
                          transaction.quantity >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {formatQuantity(transaction.quantity)}{' '}
                        {transaction.unit_of_measure}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900">
                      {transaction.warehouse_name || '-'}
                      {transaction.from_warehouse_name && transaction.to_warehouse_name && (
                        <span className="text-slate-500">
                          <br />
                          {transaction.from_warehouse_name} → {transaction.to_warehouse_name}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {transaction.reference_doc_number || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {transaction.created_by_username || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Bottom Pagination */}
        {!loading && !error && transactions.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
            <p className="text-sm text-slate-600">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.totalCount)} of{' '}
              {pagination.totalCount} transactions
            </p>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={!pagination.hasPrevPage}
                className="px-3 py-1 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-slate-600">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={!pagination.hasNextPage}
                className="px-3 py-1 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
