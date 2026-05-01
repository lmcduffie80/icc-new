'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import {
  Plus,
  Sprout,
  Clock,
  ChevronRight,
  Trash2,
  FileText,
  History,
  Sparkles,
  Sun,
  Wheat,
  Leaf,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommodityPriceBanner } from '@/components/commodity-price-banner';

interface CropPlan {
  id: number;
  plan_name: string;
  crop: string;
  plan_year: number;
  total_acres: string;
  target_weeds: string[];
  weed_pressure: string | null;
  total_cost: string | null;
  cost_per_acre: string | null;
  status: string;
  ai_generated: boolean;
  pass_count: number;
  created_at: string;
  updated_at: string;
}

const CROP_ICONS: Record<string, React.ReactNode> = {
  corn: <Sun className="h-5 w-5 text-yellow-500" />,
  soybeans: <Sprout className="h-5 w-5 text-green-600" />,
  wheat: <Wheat className="h-5 w-5 text-amber-600" />,
  cotton: <Leaf className="h-5 w-5 text-sky-600" />,
};

const CROP_COLORS: Record<string, string> = {
  corn: 'bg-yellow-50 border-yellow-200',
  soybeans: 'bg-green-50 border-green-200',
  wheat: 'bg-amber-50 border-amber-200',
  cotton: 'bg-sky-50 border-sky-200',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-600' },
  saved: { label: 'Saved', color: 'bg-emerald-100 text-emerald-700' },
  archived: { label: 'Archived', color: 'bg-gray-100 text-gray-500' },
};

export default function CropPlanningDashboard() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<CropPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const currentYear = new Date().getFullYear();

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crop?year=${currentYear}`);
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [currentYear]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handleDeleteClick = (planId: number) => {
    setConfirmDeleteId(planId);
  };

  const handleDeleteConfirm = async (planId: number) => {
    setConfirmDeleteId(null);
    setDeletingId(planId);
    try {
      await fetch(`/api/crop/${planId}`, { method: 'DELETE' });
      setPlans((prev) => prev.filter((p) => p.id !== planId));
    } finally {
      setDeletingId(null);
    }
  };

  const fmt = (n: string | null) =>
    n ? `$${parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-950 via-emerald-900 to-green-800 py-12 text-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-emerald-300 text-sm font-medium">
                <Sprout className="h-4 w-4" />
                Innovative Crop Planning
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                Welcome back, {user?.name?.split(' ')[0] ?? 'Farmer'}
              </h1>
              <p className="mt-2 text-emerald-100/80">
                Your {currentYear} crop plans — AI-powered weed management programs built around your operation.
              </p>
            </div>
            <Button
              asChild
              size="lg"
              className="bg-white text-emerald-900 hover:bg-emerald-50 font-bold shrink-0 hover:cursor-pointer"
            >
              <Link href="/crop/new">
                <Plus className="mr-2 h-5 w-5" />
                New Plan
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <CommodityPriceBanner />

        {/* Quick links */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            href="/crop/new"
            className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow hover:cursor-pointer"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
              <Sparkles className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm">AI Plan Builder</p>
              <p className="text-xs text-slate-500">Tell us your weeds, get a plan</p>
            </div>
            <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
          </Link>

          <Link
            href="/crop/history"
            className="flex items-center gap-3 rounded-xl border border-border bg-white p-4 shadow-sm hover:shadow-md transition-shadow hover:cursor-pointer"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
              <History className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm">Plan History</p>
              <p className="text-xs text-slate-500">View previous years</p>
            </div>
            <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
          </Link>

          <Link
            href="/account"
            className="flex items-center gap-3 rounded-xl border border-border bg-white p-4 shadow-sm hover:shadow-md transition-shadow hover:cursor-pointer"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
              <FileText className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm">My Account</p>
              <p className="text-xs text-slate-500">Orders, profile, settings</p>
            </div>
            <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
          </Link>
        </div>

        {/* Plans for current year */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">{currentYear} Plans</h2>
          <Link href="/crop/history" className="text-sm text-emerald-600 hover:underline">
            View all years →
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <svg className="animate-spin h-6 w-6 text-emerald-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : plans.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border bg-white py-16 text-center">
            <Sprout className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <h3 className="mb-1 font-semibold text-slate-700">No plans yet for {currentYear}</h3>
            <p className="mb-6 text-sm text-slate-500">
              Build your first AI-powered crop plan — tell us your weeds and we&apos;ll recommend the right products.
            </p>
            <Button asChild className="bg-emerald-600 hover:bg-emerald-700 hover:cursor-pointer">
              <Link href="/crop/new">
                <Plus className="mr-2 h-4 w-4" />
                Build First Plan
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {plans.map((plan) => {
              const status = STATUS_LABELS[plan.status] ?? STATUS_LABELS.draft;
              const cropColor = CROP_COLORS[plan.crop] ?? 'bg-slate-50 border-slate-200';
              return (
                <div
                  key={plan.id}
                  className={`group relative rounded-2xl border-2 bg-white p-5 shadow-sm hover:shadow-md transition-shadow ${cropColor}`}
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {CROP_ICONS[plan.crop] ?? <Sprout className="h-5 w-5 text-emerald-600" />}
                      <span className="font-bold text-slate-900 capitalize">{plan.crop}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {plan.ai_generated && (
                        <span className="flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                          <Sparkles className="h-3 w-3" />
                          AI
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                  </div>

                  <h3 className="mb-1 font-semibold text-slate-900 leading-tight">{plan.plan_name}</h3>

                  {plan.target_weeds && plan.target_weeds.length > 0 && (
                    <p className="mb-2 text-xs text-slate-500 line-clamp-1">
                      Targeting: {plan.target_weeds.join(', ')}
                    </p>
                  )}

                  <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-white/70 p-2">
                      <p className="text-xs text-slate-500">Acres</p>
                      <p className="font-bold text-slate-900 text-sm">
                        {parseFloat(plan.total_acres).toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/70 p-2">
                      <p className="text-xs text-slate-500">Passes</p>
                      <p className="font-bold text-slate-900 text-sm">{plan.pass_count}</p>
                    </div>
                    <div className="rounded-lg bg-white/70 p-2">
                      <p className="text-xs text-slate-500">Cost/Acre</p>
                      <p className="font-bold text-slate-900 text-sm">{fmt(plan.cost_per_acre)}</p>
                    </div>
                  </div>

                  {confirmDeleteId === plan.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-600 font-medium shrink-0">Delete?</span>
                      <button
                        onClick={() => handleDeleteConfirm(plan.id)}
                        className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors hover:cursor-pointer"
                      >
                        Yes, Delete
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="flex-1 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors hover:cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        asChild
                        size="sm"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 hover:cursor-pointer"
                      >
                        <Link href={`/crop/${plan.id}`}>
                          View Plan
                          <ChevronRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                      <button
                        onClick={() => handleDeleteClick(plan.id)}
                        disabled={deletingId === plan.id}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors hover:cursor-pointer disabled:opacity-50"
                        title="Delete plan"
                      >
                        {deletingId === plan.id ? (
                          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  )}

                  <p className="mt-2 text-xs text-slate-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Updated {new Date(plan.updated_at).toLocaleDateString()}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
