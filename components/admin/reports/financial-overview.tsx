'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface FinancialData {
  date: string;
  revenue: number;
  spending: number;
  net: number;
}

interface Totals {
  revenue: number;
  spending: number;
  net: number;
}

export function FinancialOverview() {
  const [data, setData] = useState<FinancialData[]>([]);
  const [totals, setTotals] = useState<Totals>({ revenue: 0, spending: 0, net: 0 });
  const [loading, setLoading] = useState(true);
  const [period] = useState('month');
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        period,
        startDate: startDate,
        endDate: endDate,
      });
      const response = await fetch(`/api/admin/reports/financials?${params}`);
      if (response.ok) {
        const result = await response.json();
        setData(result.data);
        setTotals(result.totals);
      }
    } catch (error) {
      console.error('Error fetching financial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Financial Balance Sheet</h1>
          <p className="text-slate-600 mt-1">
            Track revenue from completed orders vs spending from purchase orders
          </p>
        </div>
      </div>

      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Date Range</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div>
              <label htmlFor="overview-start-date" className="text-sm font-medium block mb-1">
                Start Date
              </label>
              <input
                id="overview-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="block rounded-md border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="overview-end-date" className="text-sm font-medium block mb-1">
                End Date
              </label>
              <input
                id="overview-end-date"
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
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(totals.revenue)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              From completed orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">PO Spending</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totals.spending)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              From approved/sent POs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Position</CardTitle>
            <DollarSign className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(totals.net)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Revenue - Spending
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue vs Spending Over Time</CardTitle>
          <CardDescription>Compare income and expenses by period</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-80 flex items-center justify-center">
              <p className="text-slate-500">Loading chart data...</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                />
                <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelFormatter={formatDate}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Revenue"
                />
                <Line
                  type="monotone"
                  dataKey="spending"
                  stroke="#ef4444"
                  strokeWidth={2}
                  name="PO Spending"
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="Net Position"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Net Position by Period</CardTitle>
          <CardDescription>Profit/loss breakdown over time</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-80 flex items-center justify-center">
              <p className="text-slate-500">Loading chart data...</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                />
                <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelFormatter={formatDate}
                />
                <Legend />
                <Bar
                  dataKey="net"
                  fill="#3b82f6"
                  name="Net Position"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
