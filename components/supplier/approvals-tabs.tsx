'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, CheckCircle2 } from 'lucide-react';
import { ApprovalsList } from './approvals-list';
import { RejectedProductsList } from './rejected-products-list';
import { ApprovedLabelsList } from './approved-labels-list';

type TabType = 'label-approvals' | 'approved' | 'rejected';

interface TabCounts {
  labelApprovals: number;
  approved: number;
  rejected: number;
}

export function ApprovalsTabs() {
  const [activeTab, setActiveTab] = useState<TabType>('label-approvals');
  const [counts, setCounts] = useState<TabCounts>({ labelApprovals: 0, approved: 0, rejected: 0 });
  const [countsLoading, setCountsLoading] = useState(true);

  useEffect(() => {
    async function fetchCounts() {
      try {
        const [approvalsRes, approvedRes, rejectedRes] = await Promise.all([
          fetch('/api/supplier/approvals'),
          fetch('/api/supplier/approvals/approved'),
          fetch('/api/supplier/products/rejected'),
        ]);

        if (approvalsRes.ok && approvedRes.ok && rejectedRes.ok) {
          const approvalsData = await approvalsRes.json();
          const approvedData = await approvedRes.json();
          const rejectedData = await rejectedRes.json();
          setCounts({
            labelApprovals: approvalsData.approvals?.length || 0,
            approved: approvedData.approvedLabels?.length || 0,
            rejected: rejectedData.products?.length || 0,
          });
        }
      } catch (error) {
        console.error('Error fetching counts:', error);
      } finally {
        setCountsLoading(false);
      }
    }

    fetchCounts();
  }, []);

  const tabs = [
    {
      id: 'label-approvals' as TabType,
      label: 'Label Approvals',
      icon: CheckCircle,
      count: counts.labelApprovals,
      description: 'Review admin-modified labels',
    },
    {
      id: 'approved' as TabType,
      label: 'Approved Labels',
      icon: CheckCircle2,
      count: counts.approved,
      description: 'History of approved labels',
    },
    {
      id: 'rejected' as TabType,
      label: 'Rejected',
      icon: XCircle,
      count: counts.rejected,
      description: 'Products needing updates',
    },
  ];

  return (
    <div>
      {/* Tab Navigation */}
      <div className="border-b border-slate-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group inline-flex items-center gap-2 border-b-2 py-4 px-1 text-sm font-medium transition-colors hover:cursor-pointer ${
                  isActive
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-green-600' : 'text-slate-400 group-hover:text-slate-500'}`} />
                <span>{tab.label}</span>
                {!countsLoading && tab.count > 0 && (
                  <span
                    className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'label-approvals' && <ApprovalsList />}
        {activeTab === 'approved' && <ApprovedLabelsList />}
        {activeTab === 'rejected' && <RejectedProductsList />}
      </div>
    </div>
  );
}
