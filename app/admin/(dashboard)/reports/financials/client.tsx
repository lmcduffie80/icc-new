'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { FinancialOverview } from '@/components/admin/reports/financial-overview';
import { ProfitLossStatement } from '@/components/admin/reports/profit-loss-statement';
import { BalanceSheet } from '@/components/admin/reports/balance-sheet';

interface FinancialReportsClientProps {
  hasOverview: boolean;
  hasPL: boolean;
  hasBS: boolean;
}

export function FinancialReportsClient({ hasOverview, hasPL, hasBS }: FinancialReportsClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Get tab from URL or determine default based on permissions
  const urlTab = searchParams.get('tab');
  const defaultTab = hasOverview ? 'overview' : hasPL ? 'pl' : 'balance-sheet';
  
  // Initialize with URL tab if valid, otherwise use default
  const getInitialTab = () => {
    if (urlTab === 'pl' && hasPL) return 'pl';
    if (urlTab === 'balance-sheet' && hasBS) return 'balance-sheet';
    if (urlTab === 'overview' && hasOverview) return 'overview';
    return defaultTab;
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab());
  
  // Update activeTab when URL changes (e.g., browser back/forward)
  useEffect(() => {
    const newTab = getInitialTab();
    if (newTab !== activeTab) {
      setActiveTab(newTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab]);
  
  // Update URL when tab changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    router.push(`/admin/reports/financials?tab=${tab}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Financial Reports</h1>
        <p className="text-slate-600 mt-1">
          Comprehensive financial statements and analysis
        </p>
      </div>

      <div className="space-y-6">
        <div className="border-b border-slate-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            {hasOverview && (
              <button
                onClick={() => handleTabChange('overview')}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'overview'
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                Overview
              </button>
            )}
            {hasPL && (
              <button
                onClick={() => handleTabChange('pl')}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'pl'
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                P&L Statement
              </button>
            )}
            {hasBS && (
              <button
                onClick={() => handleTabChange('balance-sheet')}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'balance-sheet'
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                Balance Sheet
              </button>
            )}
          </nav>
        </div>

        {hasOverview && activeTab === 'overview' && (
          <div>
            <FinancialOverview />
          </div>
        )}

        {hasPL && activeTab === 'pl' && (
          <div>
            <ProfitLossStatement />
          </div>
        )}

        {hasBS && activeTab === 'balance-sheet' && (
          <div>
            <BalanceSheet />
          </div>
        )}
      </div>
    </div>
  );
}
