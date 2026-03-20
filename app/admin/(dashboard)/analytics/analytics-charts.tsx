'use client';

interface SalesData {
  date: string;
  revenue: string;
  orders: string;
}

interface OrdersByStatus {
  status: string;
  count: string;
}

interface AnalyticsChartsProps {
  salesData: SalesData[];
  ordersByStatus: OrdersByStatus[];
}

export function AnalyticsCharts({ salesData, ordersByStatus }: AnalyticsChartsProps) {
  const formatCurrency = (amount: string | number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      typeof amount === 'string' ? parseFloat(amount) : amount
    );

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Calculate max revenue for scaling
  const maxRevenue = Math.max(...salesData.map((d) => parseFloat(d.revenue)), 1);

  // Calculate total orders for percentage
  const totalOrders = ordersByStatus.reduce((sum, item) => sum + parseInt(item.count, 10), 0);

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500',
    processing: 'bg-blue-500',
    shipped: 'bg-purple-500',
    delivered: 'bg-primary',
    cancelled: 'bg-red-500',
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Revenue Chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg mb-4 font-semibold text-slate-900">Revenue Over Time</h2>
        {salesData.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-slate-500">
            No sales data for this period
          </div>
        ) : (
          <div className="h-64">
            <div className="flex h-full items-end gap-1">
              {salesData.map((day) => {
                const height = (parseFloat(day.revenue) / maxRevenue) * 100;
                return (
                  <div
                    key={day.date}
                    className="group relative flex-1"
                    style={{ minWidth: '20px' }}
                  >
                    <div
                      className="w-full rounded-t bg-emerald-500 transition-all hover:bg-emerald-600"
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white group-hover:block">
                      <p className="font-medium">{formatDate(day.date)}</p>
                      <p>{formatCurrency(day.revenue)}</p>
                      <p>{day.orders} orders</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-500">
              <span>{salesData[0] && formatDate(salesData[0].date)}</span>
              <span>{salesData[salesData.length - 1] && formatDate(salesData[salesData.length - 1].date)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Orders by Status */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg mb-4 font-semibold text-slate-900">Orders by Status</h2>
        {ordersByStatus.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-slate-500">
            No orders for this period
          </div>
        ) : (
          <div className="space-y-4">
            {ordersByStatus.map((item) => {
              const percentage = totalOrders > 0 
                ? (parseInt(item.count, 10) / totalOrders) * 100 
                : 0;
              return (
                <div key={item.status}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium capitalize text-slate-700">{item.status}</span>
                    <span className="text-slate-500">
                      {item.count} ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        statusColors[item.status] || 'bg-slate-500'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="mt-6 border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900">Total Orders</span>
                <span className="text-lg font-bold text-slate-900">{totalOrders}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

