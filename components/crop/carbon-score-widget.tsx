'use client';

import { useState } from 'react';
import { Leaf, ChevronDown, ChevronUp, Award, TrendingUp, Sprout, Wind, Droplets } from 'lucide-react';
import type { CarbonScore } from '@/lib/carbon-scoring';

interface CarbonScoreWidgetProps {
  carbonScore: CarbonScore | null;
  acres: number;
  /** When true, show all recommendations and breakdown bars expanded by default */
  defaultExpanded?: boolean;
}

const CERT_CONFIG = {
  premium:   { label: 'Premium',   bg: 'bg-emerald-600', text: 'text-white' },
  verified:  { label: 'Verified',  bg: 'bg-blue-600',    text: 'text-white' },
  voluntary: { label: 'Voluntary', bg: 'bg-amber-500',   text: 'text-white' },
  none:      { label: 'No Credits', bg: 'bg-slate-400',  text: 'text-white' },
} as const;

function scoreColor(score: number) {
  if (score >= 2) return { bg: 'bg-emerald-50 border-emerald-200', value: 'text-emerald-700', label: 'Excellent' };
  if (score >= 1) return { bg: 'bg-amber-50 border-amber-200',     value: 'text-amber-700',   label: 'Good' };
  if (score >= 0) return { bg: 'bg-orange-50 border-orange-200',   value: 'text-orange-700',  label: 'Fair' };
  return           { bg: 'bg-red-50 border-red-200',               value: 'text-red-700',     label: 'Poor' };
}

interface BreakdownBarProps {
  label: string;
  value: number;
  maxValue?: number;
  icon: React.ReactNode;
}

function BreakdownBar({ label, value, maxValue = 3, icon }: BreakdownBarProps) {
  const pct = Math.min(100, Math.max(0, (value / maxValue) * 100));
  const isPositive = value >= 0;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 w-36 shrink-0">
        <span className="text-slate-400">{icon}</span>
        <span className="text-xs text-slate-600">{label}</span>
      </div>
      <div className="flex-1 bg-slate-100 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${isPositive ? 'bg-emerald-400' : 'bg-red-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-slate-700 w-10 text-right">{value.toFixed(2)}</span>
    </div>
  );
}

export function CarbonScoreWidget({ carbonScore, acres, defaultExpanded = false }: CarbonScoreWidgetProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!carbonScore) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 flex items-center gap-2">
        <Leaf className="h-4 w-4 shrink-0" />
        <span>Carbon score not yet calculated for this plan.</span>
      </div>
    );
  }

  const colors = scoreColor(carbonScore.total_score);
  const cert = CERT_CONFIG[carbonScore.certification_level];

  return (
    <div className="space-y-3">
      {/* Header card */}
      <div className={`rounded-xl border p-4 ${colors.bg}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Leaf className="h-4 w-4 text-slate-500 shrink-0" />
            <span className="text-sm font-semibold text-slate-700">Carbon Impact Score</span>
          </div>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cert.bg} ${cert.text}`}>
            {cert.label}
          </span>
        </div>

        <div className="mt-2 flex items-end gap-3">
          <div className={`text-3xl font-extrabold ${colors.value}`}>
            {carbonScore.total_score.toFixed(2)}
          </div>
          <div className="text-sm text-slate-500 pb-0.5">metric tons CO₂e/acre/yr</div>
          <div className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-white/60 ${colors.value}`}>
            {colors.label}
          </div>
        </div>

        {/* Compliance badges */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${carbonScore.sustainable_ag ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400 line-through'}`}>
            Sustainable Ag
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${carbonScore.regen_ag ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400 line-through'}`}>
            Regenerative Ag
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${carbonScore.carbon_neutral ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400 line-through'}`}>
            Carbon Neutral
          </span>
        </div>
      </div>

      {/* Carbon credit potential */}
      {carbonScore.estimated_credits > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Award className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="text-sm font-semibold text-emerald-800">Carbon Credit Potential</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-white/70 px-3 py-2">
              <p className="text-xs text-emerald-600">Estimated Credits</p>
              <p className="text-sm font-bold text-emerald-800">{carbonScore.estimated_credits} t CO₂e</p>
            </div>
            <div className="rounded-lg bg-white/70 px-3 py-2">
              <p className="text-xs text-emerald-600">Potential Value</p>
              <p className="text-sm font-bold text-emerald-800">
                ${carbonScore.potential_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <p className="text-xs text-emerald-600 mt-2">
            Based on {acres.toLocaleString()} acres at current {carbonScore.certification_level} carbon credit prices
          </p>
        </div>
      )}

      {/* Expandable breakdown + recommendations */}
      <div className="rounded-xl border border-border bg-white">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors hover:cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-slate-400" />
            Impact Breakdown &amp; Recommendations
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {expanded && (
          <div className="px-4 pb-4 space-y-4 border-t border-border pt-3">
            {/* Breakdown bars */}
            <div className="space-y-2.5">
              <BreakdownBar
                label="Soil Health"
                value={carbonScore.soil_health}
                icon={<Sprout className="h-3.5 w-3.5" />}
              />
              <BreakdownBar
                label="Chemical Impact"
                value={carbonScore.chemical_impact}
                icon={<Droplets className="h-3.5 w-3.5" />}
              />
              <BreakdownBar
                label="Operational Eff."
                value={carbonScore.operational_efficiency}
                maxValue={2}
                icon={<Wind className="h-3.5 w-3.5" />}
              />
              <BreakdownBar
                label="Biodiversity"
                value={carbonScore.biodiversity}
                maxValue={1}
                icon={<Leaf className="h-3.5 w-3.5" />}
              />
            </div>

            {/* Recommendations */}
            {carbonScore.recommendations.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Recommendations</p>
                <ul className="space-y-1.5">
                  {carbonScore.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                      <span className="text-emerald-500 mt-0.5 shrink-0">→</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
