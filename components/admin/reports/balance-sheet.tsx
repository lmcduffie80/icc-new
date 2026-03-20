'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, TrendingDown, PieChart } from 'lucide-react';

interface BalanceSheetData {
  assets: {
    inventory: number;
    accountsReceivable: number;
    total: number;
  };
  liabilities: {
    accountsPayable: number;
    total: number;
  };
  equity: {
    total: number;
  };
}

export function BalanceSheet() {
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const response = await fetch(`/api/admin/reports/balance-sheet?${params}`);
      if (response.ok) {
        const result = await response.json();
        setData(result.data);
      }
    } catch (error) {
      console.error('Error fetching balance sheet data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-500">Loading balance sheet...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-500">Failed to load balance sheet data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Balance Sheet</h2>
        <p className="text-slate-600 mt-1">Snapshot of financial position - Assets, Liabilities, and Equity</p>
      </div>

      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Date Range</CardTitle>
          <CardDescription>
            Filter Accounts Receivable and Payable by date (leave empty for all-time)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div>
              <label htmlFor="bs-start-date" className="text-sm font-medium block mb-1">
                Start Date
              </label>
              <input
                id="bs-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="block rounded-md border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="bs-end-date" className="text-sm font-medium block mb-1">
                End Date
              </label>
              <input
                id="bs-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="block rounded-md border border-slate-300 px-3 py-2"
              />
            </div>
            <button
              onClick={fetchData}
              className="rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
            >
              Apply Filters
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
            <Wallet className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(data.assets.total)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Current assets owned</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Liabilities</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(data.liabilities.total)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Current obligations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Equity</CardTitle>
            <PieChart className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${data.equity.total >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {formatCurrency(data.equity.total)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Assets - Liabilities</p>
          </CardContent>
        </Card>
      </div>

      {/* Balance Sheet Statement */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Assets */}
        <Card>
          <CardHeader>
            <CardTitle>Assets</CardTitle>
            <CardDescription>Resources owned by the business</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-3 border-b">
                <div>
                  <p className="font-medium">Inventory</p>
                  <p className="text-xs text-slate-500">Current stock at cost</p>
                </div>
                <p className="text-lg font-semibold text-emerald-600">
                  {formatCurrency(data.assets.inventory)}
                </p>
              </div>

              <div className="flex justify-between items-center pb-3 border-b">
                <div>
                  <p className="font-medium">Accounts Receivable</p>
                  <p className="text-xs text-slate-500">Delivered orders pending payment</p>
                </div>
                <p className="text-lg font-semibold text-emerald-600">
                  {formatCurrency(data.assets.accountsReceivable)}
                </p>
              </div>

              <div className="flex justify-between items-center pt-2 bg-emerald-50 p-3 rounded-lg">
                <p className="font-bold text-emerald-900">Total Assets</p>
                <p className="text-xl font-bold text-emerald-600">
                  {formatCurrency(data.assets.total)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Liabilities & Equity */}
        <Card>
          <CardHeader>
            <CardTitle>Liabilities & Equity</CardTitle>
            <CardDescription>Sources of funding for assets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-sm text-slate-700 mb-3">Liabilities</h4>
                <div className="flex justify-between items-center pb-3 border-b">
                  <div>
                    <p className="font-medium">Accounts Payable</p>
                    <p className="text-xs text-slate-500">POs approved/sent not received</p>
                  </div>
                  <p className="text-lg font-semibold text-red-600">
                    {formatCurrency(data.liabilities.accountsPayable)}
                  </p>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <p className="font-bold text-slate-700">Total Liabilities</p>
                  <p className="text-lg font-bold text-red-600">
                    {formatCurrency(data.liabilities.total)}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t">
                <h4 className="font-semibold text-sm text-slate-700 mb-3">Equity</h4>
                <div className="flex justify-between items-center pt-2 bg-blue-50 p-3 rounded-lg">
                  <p className="font-bold text-blue-900">Total Equity</p>
                  <p className={`text-xl font-bold ${data.equity.total >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {formatCurrency(data.equity.total)}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="flex justify-between items-center bg-slate-100 p-3 rounded-lg">
                  <p className="font-bold">Total Liabilities + Equity</p>
                  <p className="text-xl font-bold">
                    {formatCurrency(data.liabilities.total + data.equity.total)}
                  </p>
                </div>
                <p className="text-xs text-slate-500 mt-2 text-center">
                  {Math.abs(data.assets.total - (data.liabilities.total + data.equity.total)) < 0.01
                    ? '✓ Balanced'
                    : '⚠️ Not balanced - check calculations'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Statement</CardTitle>
          <CardDescription>Complete balance sheet breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2">
                  <th className="text-left p-3 font-bold">Account</th>
                  <th className="text-right p-3 font-bold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {/* Assets Section */}
                <tr className="bg-emerald-50">
                  <td colSpan={2} className="p-3 font-bold text-emerald-900">ASSETS</td>
                </tr>
                <tr className="border-b hover:bg-slate-50">
                  <td className="p-3 pl-6">Inventory</td>
                  <td className="text-right p-3 text-emerald-600">
                    {formatCurrency(data.assets.inventory)}
                  </td>
                </tr>
                <tr className="border-b hover:bg-slate-50">
                  <td className="p-3 pl-6">Accounts Receivable</td>
                  <td className="text-right p-3 text-emerald-600">
                    {formatCurrency(data.assets.accountsReceivable)}
                  </td>
                </tr>
                <tr className="font-bold bg-emerald-100">
                  <td className="p-3 pl-6">Total Assets</td>
                  <td className="text-right p-3 text-emerald-700">
                    {formatCurrency(data.assets.total)}
                  </td>
                </tr>

                {/* Liabilities Section */}
                <tr className="bg-red-50">
                  <td colSpan={2} className="p-3 font-bold text-red-900 pt-6">LIABILITIES</td>
                </tr>
                <tr className="border-b hover:bg-slate-50">
                  <td className="p-3 pl-6">Accounts Payable</td>
                  <td className="text-right p-3 text-red-600">
                    {formatCurrency(data.liabilities.accountsPayable)}
                  </td>
                </tr>
                <tr className="font-bold bg-red-100">
                  <td className="p-3 pl-6">Total Liabilities</td>
                  <td className="text-right p-3 text-red-700">
                    {formatCurrency(data.liabilities.total)}
                  </td>
                </tr>

                {/* Equity Section */}
                <tr className="bg-blue-50">
                  <td colSpan={2} className="p-3 font-bold text-blue-900 pt-6">EQUITY</td>
                </tr>
                <tr className="font-bold bg-blue-100">
                  <td className="p-3 pl-6">Total Equity</td>
                  <td className={`text-right p-3 ${data.equity.total >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                    {formatCurrency(data.equity.total)}
                  </td>
                </tr>

                {/* Total */}
                <tr className="font-bold bg-slate-200 border-t-2">
                  <td className="p-3">TOTAL LIABILITIES + EQUITY</td>
                  <td className="text-right p-3 text-lg">
                    {formatCurrency(data.liabilities.total + data.equity.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
