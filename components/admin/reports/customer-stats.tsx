'use client';

import { CustomerStats } from '@/types/reports';
import { StatCard } from '@/components/admin/stat-card';
import { Users, UserCheck, UserPlus, TrendingUp } from 'lucide-react';

interface CustomerStatsProps {
  stats: CustomerStats;
  loading?: boolean;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

export function CustomerStatsCards({ stats, loading }: CustomerStatsProps) {
  if (loading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-6 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-1/2 mb-4"></div>
            <div className="h-8 bg-slate-200 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Customers"
        value={stats.total_customers.toLocaleString()}
        icon={<Users className="h-6 w-6" />}
      />
      <StatCard
        title="Active Customers"
        value={stats.active_customers.toLocaleString()}
        icon={<UserCheck className="h-6 w-6" />}
      />
      <StatCard
        title="New Customers"
        value={stats.new_customers.toLocaleString()}
        icon={<UserPlus className="h-6 w-6" />}
        trend={
          stats.new_customers > 0
            ? {
                value: stats.new_customers,
                label: 'joined',
              }
            : undefined
        }
      />
      <StatCard
        title="Avg Lifetime Value"
        value={formatCurrency(stats.avg_lifetime_value)}
        icon={<TrendingUp className="h-6 w-6" />}
        trend={
          stats.retention_rate > 0
            ? {
                value: stats.retention_rate,
                label: 'retention rate',
              }
            : undefined
        }
      />
    </div>
  );
}
