'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Sprout,
  Sun,
  Wheat,
  Leaf,
  Sparkles,
  Copy,
  Loader2,
  TrendingDown,
  TrendingUp,
  Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

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
}

const CROP_ICONS: Record<string, React.ReactNode> = {
  corn: <Sun className="h-4 w-4 text-yellow-500" />,
  soybeans: <Sprout className="h-4 w-4 text-green-600" />,
  wheat: <Wheat className="h-4 w-4 text-amber-600" />,
  cotton: <Leaf className="h-4 w-4 text-sky-600" />,
};

function fmt(n: string | null) {
  if (!n) return '—';
  return `$${parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CostTrend({ current, previous }: { current: string | null; previous: string | null }) {
  if (!current || !previous) return <Minus className="h-4 w-4 text-slate-400" />;
  const diff = parseFloat(current) - parseFloat(previous);
  const pct = Math.abs((diff / parseFloat(previous)) * 100).toFixed(1);
  if (Math.abs(diff) < 0.01) return <Minus className="h-4 w-4 text-slate-400" />;
  if (diff > 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-red-600">
        <TrendingUp className="h-3 w-3" />
        +{pct}%
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-emerald-600">
      <TrendingDown className="h-3 w-3" />
      -{pct}%
    </span>
  );
}

export default function PlanHistoryPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<CropPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloningId, setCloningId] = useState<number | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/crop');
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handleClone = async (plan: CropPlan) => {
    const currentYear = new Date().getFullYear();
    const year = prompt(`Clone "${plan.plan_name}" to which year?`, String(currentYear));
    if (!year) return;
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum) || yearNum < 2020 || yearNum > 2100) {
      alert('Invalid year.');
      return;
    }
    setCloningId(plan.id);
    try {
      const res = await fetch(`/api/crop/${plan.id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_year: yearNum }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/crop/${data.plan.id}`);
      } else {
        alert(data.error ?? 'Failed to clone plan.');
      }
    } finally {
      setCloningId(null);
    }
  };

  // Group plans by year
  const byYear = plans.reduce<Record<number, CropPlan[]>>((acc, plan) => {
    if (!acc[plan.plan_year]) acc[plan.plan_year] = [];
    acc[plan.plan_year].push(plan);
    return acc;
  }, {});

  const years = Object.keys(byYear)
    .map(Number)
    .sort((a, b) => b - a);

  // Build cost-per-acre history per crop for trend comparison
  const costHistory: Record<string, Record<number, string | null>> = {};
  for (const plan of plans) {
    if (!costHistory[plan.crop]) costHistory[plan.crop] = {};
    costHistory[plan.crop][plan.plan_year] = plan.cost_per_acre;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      {/* Header */}
      <div className="border-b border-border/40 bg-white py-4">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/crop/dashboard"
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 hover:cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
              My Plans
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-medium text-slate-700">Plan History</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Plan History</h1>
            <p className="mt-1 text-slate-500">All your crop plans across every year. Clone any plan to use as a starting point.</p>
          </div>
          <Button asChild className="bg-emerald-600 hover:bg-emerald-700 hover:cursor-pointer">
            <Link href="/crop/new">New Plan</Link>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          </div>
        ) : plans.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border bg-white py-16 text-center">
            <Sprout className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <h3 className="mb-1 font-semibold text-slate-700">No plans yet</h3>
            <p className="mb-6 text-sm text-slate-500">Build your first plan to start tracking your crop programs year over year.</p>
            <Button asChild className="bg-emerald-600 hover:bg-emerald-700 hover:cursor-pointer">
              <Link href="/crop/new">Build First Plan</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {years.map((year) => (
              <div key={year}>
                <h2 className="mb-3 text-lg font-bold text-slate-800 border-b border-border pb-2">{year}</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {byYear[year].map((plan) => {
                    const prevYearCost = costHistory[plan.crop]?.[year - 1] ?? null;
                    return (
                      <div
                        key={plan.id}
                        className="rounded-2xl border border-border bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {CROP_ICONS[plan.crop] ?? <Sprout className="h-4 w-4 text-emerald-600" />}
                            <span className="font-semibold text-slate-900 capitalize text-sm">{plan.crop}</span>
                            {plan.ai_generated && (
                              <span className="flex items-center gap-0.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                                <Sparkles className="h-2.5 w-2.5" />
                                AI
                              </span>
                            )}
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            plan.status === 'saved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {plan.status}
                          </span>
                        </div>

                        <h3 className="mb-1 font-semibold text-slate-900 leading-tight text-sm">{plan.plan_name}</h3>

                        {plan.target_weeds && plan.target_weeds.length > 0 && (
                          <p className="mb-2 text-xs text-slate-500 line-clamp-1">
                            Targeting: {plan.target_weeds.join(', ')}
                          </p>
                        )}

                        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-lg bg-slate-50 p-2">
                            <p className="text-xs text-slate-500">Acres</p>
                            <p className="font-bold text-slate-900 text-sm">
                              {parseFloat(plan.total_acres).toLocaleString()}
                            </p>
                          </div>
                          <div className="rounded-lg bg-slate-50 p-2">
                            <p className="text-xs text-slate-500">$/Acre</p>
                            <p className="font-bold text-slate-900 text-sm">{fmt(plan.cost_per_acre)}</p>
                          </div>
                          <div className="rounded-lg bg-slate-50 p-2">
                            <p className="text-xs text-slate-500">vs {year - 1}</p>
                            <CostTrend current={plan.cost_per_acre} previous={prevYearCost} />
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="flex-1 hover:cursor-pointer"
                          >
                            <Link href={`/crop/${plan.id}`}>
                              View
                              <ChevronRight className="ml-1 h-3 w-3" />
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleClone(plan)}
                            disabled={cloningId === plan.id}
                            className="hover:cursor-pointer"
                            title="Use as starting point for a new year"
                          >
                            {cloningId === plan.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
