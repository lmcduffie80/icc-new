'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Package, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface MonthlyData {
  month: string;
  products_sold: string;
  revenue: string;
  icc_payout: string;
  supplier_payout: string;
}

interface ProductData {
  product_id: string;
  product_name: string;
  quantity_sold: string;
  total_revenue: string;
  icc_share: string;
  supplier_share: string;
  margin_split_percentage: string;
}

interface FinancialData {
  monthly: MonthlyData[];
  products: ProductData[];
  totals: {
    revenue: number;
    productsSold: number;
    iccPayout: number;
    supplierPayout: number;
  };
}

export function FinancialReportClient() {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const response = await fetch(`/api/supplier/reports/financials?${params}`);
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error('Error fetching financial data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !data) {
    return <div>Loading...</div>;
  }

  const chartData = data.monthly.map((item) => ({
    month: item.month,
    revenue: parseFloat(item.revenue),
    iccPayout: parseFloat(item.icc_payout),
    supplierPayout: parseFloat(item.supplier_payout),
  })).reverse();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Financial Reports</h1>
        <p className="text-slate-600 mt-1">
          Track your revenue, product sales, and ICC margin split
        </p>
      </div>

      {/* Date Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Date Range</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div>
              <label htmlFor="start-date" className="text-sm font-medium">Start Date</label>
              <input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 block rounded-md border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="end-date" className="text-sm font-medium">End Date</label>
              <input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 block rounded-md border border-slate-300 px-3 py-2"
              />
            </div>
            <button
              onClick={fetchData}
              className="mt-6 rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700"
            >
              Apply Filters
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${data.totals.revenue.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Products Sold</CardTitle>
            <Package className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totals.productsSold}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ICC Share</CardTitle>
            <TrendingUp className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              ${data.totals.iccPayout.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Your Payout</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${data.totals.supplierPayout.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue & Payouts Over Time</CardTitle>
          <CardDescription>Monthly breakdown of revenue and margin split</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#3b82f6" name="Revenue" />
              <Line type="monotone" dataKey="iccPayout" stroke="#ef4444" name="ICC Share" />
              <Line type="monotone" dataKey="supplierPayout" stroke="#10b981" name="Your Payout" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Product Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle>Product Breakdown</CardTitle>
          <CardDescription>Revenue and margin split by product</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Product</th>
                  <th className="text-right p-2">Qty Sold</th>
                  <th className="text-right p-2">Revenue</th>
                  <th className="text-right p-2">Margin Split</th>
                  <th className="text-right p-2">ICC Share</th>
                  <th className="text-right p-2">Your Share</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((product) => (
                  <tr key={product.product_id} className="border-b">
                    <td className="p-2">{product.product_name}</td>
                    <td className="text-right p-2">{product.quantity_sold}</td>
                    <td className="text-right p-2">${parseFloat(product.total_revenue).toFixed(2)}</td>
                    <td className="text-right p-2">{parseFloat(product.margin_split_percentage).toFixed(0)}%</td>
                    <td className="text-right p-2 text-red-600">${parseFloat(product.icc_share).toFixed(2)}</td>
                    <td className="text-right p-2 text-green-600">${parseFloat(product.supplier_share).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
