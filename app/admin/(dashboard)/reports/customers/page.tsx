'use client';

import { useState, useEffect } from 'react';
import { TimePeriodSelector } from '@/components/admin/reports/time-period-selector';
import { CustomerStatsCards } from '@/components/admin/reports/customer-stats';
import { TopProductsTable } from '@/components/admin/reports/top-products-table';
import type { TimePeriod, TopProduct, CustomerStats } from '@/types/reports';

interface ReportsData {
  topProducts: TopProduct[];
  customerStats: CustomerStats;
  period: TimePeriod;
}

export default function CustomersReportPage() {
  const [period, setPeriod] = useState<TimePeriod>('30_days');
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReportsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const fetchReportsData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/reports/customers?period=${period}`);
      
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("You don't have permission to view customer reports");
        }
        throw new Error('Failed to fetch reports data');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Error fetching reports:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodChange = (newPeriod: TimePeriod) => {
    setPeriod(newPeriod);
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Customer Reports</h1>
          <p className="text-slate-600 mt-1">
            Analyze customer behavior, lifetime value, and purchase patterns
          </p>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Customer Reports</h1>
          <p className="text-slate-600 mt-1">
            Analyze customer behavior, lifetime value, and purchase patterns
          </p>
        </div>
        <TimePeriodSelector value={period} onChange={handlePeriodChange} />
      </div>

      {/* Customer Statistics Cards */}
      <CustomerStatsCards
        stats={
          data?.customerStats || {
            total_customers: 0,
            active_customers: 0,
            new_customers: 0,
            retention_rate: 0,
            avg_lifetime_value: 0,
          }
        }
        loading={loading}
      />

      {/* Top Products Table */}
      <TopProductsTable products={data?.topProducts || []} loading={loading} />
    </div>
  );
}
