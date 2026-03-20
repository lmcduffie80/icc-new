'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, DollarSign, Percent } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface PLData {
  period: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
}

interface PLTotals {
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
}

export function ProfitLossStatement() {
  const [data, setData] = useState<PLData[]>([]);
  const [totals, setTotals] = useState<PLTotals>({ revenue: 0, cogs: 0, grossProfit: 0, grossMargin: 0 });
  const [loading, setLoading] = useState(true);
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
        period: 'month',
        startDate: startDate,
        endDate: endDate,
      });
      const response = await fetch(`/api/admin/reports/profit-loss?${params}`);
      if (response.ok) {
        const result = await response.json();
        setData(result.data);
        setTotals(result.totals);
      }
    } catch (error) {
      console.error('Error fetching P&L data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Profit & Loss Statement</h2>
        <p className="text-slate-600 mt-1">Income statement showing revenue, costs, and profitability</p>
      </div>

      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Date Range</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div>
              <label htmlFor="pl-start-date" className="text-sm font-medium block mb-1">
                Start Date
              </label>
              <input
                id="pl-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="block rounded-md border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="pl-end-date" className="text-sm font-medium block mb-1">
                End Date
              </label>
              <input
                id="pl-end-date"
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
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(totals.revenue)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Total sales</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">COGS</CardTitle>
            <DollarSign className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totals.cogs)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Cost of goods sold</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(totals.grossProfit)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Revenue - COGS</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Margin</CardTitle>
            <Percent className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {formatPercent(totals.grossMargin)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Profitability ratio</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue & COGS Trend</CardTitle>
          <CardDescription>Monthly comparison of sales and costs</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-80 flex items-center justify-center">
              <p className="text-slate-500">Loading data...</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tickFormatter={formatDate} />
                <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} labelFormatter={formatDate} />
                <Legend />
                <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
                <Bar dataKey="cogs" fill="#ef4444" name="COGS" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gross Profit Trend</CardTitle>
          <CardDescription>Profitability over time</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-80 flex items-center justify-center">
              <p className="text-slate-500">Loading data...</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tickFormatter={formatDate} />
                <YAxis 
                  yAxisId="left"
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} 
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right"
                  tickFormatter={(value) => `${value.toFixed(0)}%`}
                />
                <Tooltip 
                  formatter={(value: number, name: string) => 
                    name === 'Gross Margin' ? formatPercent(value) : formatCurrency(value)
                  } 
                  labelFormatter={formatDate} 
                />
                <Legend />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="grossProfit" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  name="Gross Profit" 
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="grossMargin" 
                  stroke="#a855f7" 
                  strokeWidth={2}
                  name="Gross Margin" 
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Statement Table */}
      <Card>
        <CardHeader>
          <CardTitle>Period-by-Period Statement</CardTitle>
          <CardDescription>Detailed breakdown by month</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Period</th>
                  <th className="text-right p-2">Revenue</th>
                  <th className="text-right p-2">COGS</th>
                  <th className="text-right p-2">Gross Profit</th>
                  <th className="text-right p-2">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.period} className="border-b hover:bg-slate-50">
                    <td className="p-2">{formatDate(row.period)}</td>
                    <td className="text-right p-2 text-emerald-600 font-medium">
                      {formatCurrency(row.revenue)}
                    </td>
                    <td className="text-right p-2 text-red-600">
                      {formatCurrency(row.cogs)}
                    </td>
                    <td className="text-right p-2 text-blue-600 font-medium">
                      {formatCurrency(row.grossProfit)}
                    </td>
                    <td className="text-right p-2 text-purple-600 font-medium">
                      {formatPercent(row.grossMargin)}
                    </td>
                  </tr>
                ))}
                {data.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="text-center p-8 text-slate-500">
                      No data available for the selected period
                    </td>
                  </tr>
                )}
                {data.length > 0 && (
                  <tr className="font-bold bg-slate-100">
                    <td className="p-2">Total</td>
                    <td className="text-right p-2 text-emerald-600">
                      {formatCurrency(totals.revenue)}
                    </td>
                    <td className="text-right p-2 text-red-600">
                      {formatCurrency(totals.cogs)}
                    </td>
                    <td className="text-right p-2 text-blue-600">
                      {formatCurrency(totals.grossProfit)}
                    </td>
                    <td className="text-right p-2 text-purple-600">
                      {formatPercent(totals.grossMargin)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
