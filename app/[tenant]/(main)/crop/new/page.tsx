'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Plus,
  X,
  Sun,
  Sprout,
  Wheat,
  Leaf,
  AlertCircle,
  Loader2,
  Check,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/components/tenant-provider';
import { calcUnitsNeeded, calcCostPerAcre } from '@/lib/acre-pack-calc';
import { SoilTemperatureWidget } from '@/components/crop/soil-temperature-widget';
import { CarbonScoreWidget } from '@/components/crop/carbon-score-widget';
import { calculateCarbonScore } from '@/lib/carbon-scoring';

// --- Types ---
interface FarmerDraftProduct {
  product_id: string;
  product_name: string;
  is_recommended: boolean;
  rate_per_acre: number;
  rate_unit: string;
  unit_size: number;
  unit_size_unit: string;
  lbs_per_gallon: number | null;
  reasoning: string;
  price: string;
  unit_of_measure: string | null;
}

interface FarmerDraftPass {
  name: string;
  category: string;
  timing_label: string;
  sort_order: number;
  products: FarmerDraftProduct[];
}

interface FarmerDraftPlan {
  passes: FarmerDraftPass[];
  summary: string;
  weed_management_notes: string;
}

// --- Constants ---
const CROPS = [
  {
    slug: 'corn',
    label: 'Corn',
    icon: <Sun className="h-8 w-8 text-yellow-500" />,
    cardBg: 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-300',
    selectedBg: 'bg-gradient-to-br from-yellow-100 to-amber-100 border-yellow-500 ring-2 ring-yellow-400',
  },
  {
    slug: 'soybeans',
    label: 'Soybeans',
    icon: <Sprout className="h-8 w-8 text-green-600" />,
    cardBg: 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-300',
    selectedBg: 'bg-gradient-to-br from-green-100 to-emerald-100 border-green-500 ring-2 ring-green-400',
  },
  {
    slug: 'wheat',
    label: 'Wheat',
    icon: <Wheat className="h-8 w-8 text-amber-600" />,
    cardBg: 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-300',
    selectedBg: 'bg-gradient-to-br from-amber-100 to-orange-100 border-amber-500 ring-2 ring-amber-400',
  },
  {
    slug: 'cotton',
    label: 'Cotton',
    icon: <Leaf className="h-8 w-8 text-sky-600" />,
    cardBg: 'bg-gradient-to-br from-sky-50 to-blue-50 border-sky-300',
    selectedBg: 'bg-gradient-to-br from-sky-100 to-blue-100 border-sky-500 ring-2 ring-sky-400',
  },
];

const COMMON_WEEDS = [
  'Waterhemp', 'Palmer amaranth', 'Marestail / Horseweed', 'Giant ragweed',
  'Common ragweed', 'Velvetleaf', 'Foxtail', 'Johnsongrass', 'Lambsquarters',
  'Nutsedge', 'Pigweed', 'Morning glory', 'Cocklebur',
];

const CATEGORY_COLORS: Record<string, string> = {
  'Pre-Emergent': 'bg-blue-50 border-blue-200',
  'Post-Emerge': 'bg-green-50 border-green-200',
  'In-Season': 'bg-amber-50 border-amber-200',
  'Adjuvants': 'bg-purple-50 border-purple-200',
};

const CATEGORY_BADGE: Record<string, string> = {
  'Pre-Emergent': 'bg-blue-100 text-blue-700',
  'Post-Emerge': 'bg-green-100 text-green-700',
  'In-Season': 'bg-amber-100 text-amber-700',
  'Adjuvants': 'bg-purple-100 text-purple-700',
};

// --- Component ---
export default function NewPlanPage() {
  const router = useRouter();
  const tenant = useTenant();

  // Step 1: Crop & Acres
  const [step, setStep] = useState(1);
  const [crop, setCrop] = useState('');
  const [acres, setAcres] = useState('');
  const [planName, setPlanName] = useState('');

  // Step 2: Weed targets
  const [weedInput, setWeedInput] = useState('');
  const [targetWeeds, setTargetWeeds] = useState<string[]>([]);
  const [weedPressure, setWeedPressure] = useState<'light' | 'moderate' | 'heavy'>('moderate');

  // Step 3: AI generation & review
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [draft, setDraft] = useState<FarmerDraftPlan | null>(null);

  // Step 4: Save
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Farm location for soil temperature widget
  const [farmZip, setFarmZip] = useState<string | null>(null);
  const [envCoords, setEnvCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Carbon score preview — computed from the AI draft whenever it changes
  const previewCarbonScore = useMemo(() => {
    if (!draft) return null;
    const acresNum = parseFloat(acres) || 0;
    const scoringPasses = draft.passes.map((pass) => ({
      category: pass.category,
      products: pass.products.map((p) => ({
        product_name: p.product_name,
        rate_per_acre: p.rate_per_acre,
        rate_unit: p.rate_unit,
      })),
    }));
    return calculateCarbonScore(scoringPasses, crop, acresNum);
  }, [draft, crop, acres]);

  useEffect(() => {
    fetch('/api/profile/farm')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.farmProfile?.latitude && data?.farmProfile?.longitude) {
          // Use precise stored coordinates — no ZIP lookup needed
          setEnvCoords({ lat: data.farmProfile.latitude, lng: data.farmProfile.longitude });
        } else if (data?.farmProfile?.zipCode) {
          // Fall back to ZIP-based widget lookup for profiles without stored coords
          setFarmZip(data.farmProfile.zipCode);
        }
      })
      .catch(() => {});
  }, []);

  const addWeed = useCallback((weed: string) => {
    const trimmed = weed.trim();
    if (trimmed && !targetWeeds.includes(trimmed)) {
      setTargetWeeds((prev) => [...prev, trimmed]);
    }
    setWeedInput('');
  }, [targetWeeds]);

  const removeWeed = (weed: string) => {
    setTargetWeeds((prev) => prev.filter((w) => w !== weed));
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError('');
    try {
      const payload: Record<string, unknown> = {
        crop,
        acres: parseFloat(acres),
        targetWeeds,
        weedPressure,
      };
      if (envCoords) {
        payload.latitude = envCoords.lat;
        payload.longitude = envCoords.lng;
      }
      const res = await fetch('/api/crop/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error ?? 'Failed to generate plan. Please try again.');
        return;
      }
      setDraft(data.draft);
      setStep(3);
    } catch {
      setGenError('Network error. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const removePassFromDraft = (passIdx: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, passes: prev.passes.filter((_, i) => i !== passIdx) };
    });
  };

  const removeProductFromDraft = (passIdx: number, productIdx: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const passes = prev.passes.map((pass, i) => {
        if (i !== passIdx) return pass;
        return { ...pass, products: pass.products.filter((_, j) => j !== productIdx) };
      }).filter((pass) => pass.products.length > 0);
      return { ...prev, passes };
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError('');

    try {
      // 1. Create the plan record
      const acresNum = parseFloat(acres);
      const name = planName.trim() || `${crop.charAt(0).toUpperCase() + crop.slice(1)} Plan ${new Date().getFullYear()}`;

      const createRes = await fetch(`/api/crop?tenant_id=${tenant.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_name: name,
          crop,
          plan_year: new Date().getFullYear(),
          total_acres: acresNum,
          target_weeds: targetWeeds,
          weed_pressure: weedPressure,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        setSaveError(createData.error ?? 'Failed to create plan.');
        return;
      }

      const planId = createData.plan.id;

      // 2. Compute costs for all products before saving
      const computedPasses = draft.passes.map((pass, i) => {
        let passCost = 0;
        const products = pass.products.map((p, j) => {
          const unitsNeeded = calcUnitsNeeded(
            acresNum,
            p.rate_per_acre,
            p.unit_size,
            p.rate_unit,
            p.unit_size_unit,
            p.lbs_per_gallon
          );
          const unitCost = isFinite(parseFloat(p.price)) ? parseFloat(p.price) : 0;
          const lineTotal = unitsNeeded * unitCost;
          const costPerAcre = calcCostPerAcre(unitsNeeded, p.price, acresNum);
          passCost += lineTotal;
          return {
            product_id: p.product_id,
            product_name: p.product_name,
            is_recommended: p.is_recommended,
            rate_per_acre: p.rate_per_acre,
            rate_unit: p.rate_unit,
            unit_size: p.unit_size,
            unit_size_unit: p.unit_size_unit,
            lbs_per_gallon: p.lbs_per_gallon,
            units_needed: unitsNeeded,
            unit_cost: unitCost,
            line_total: lineTotal,
            cost_per_acre: costPerAcre,
            sort_order: j,
          };
        });
        return {
          name: pass.name,
          category: pass.category,
          timing_label: pass.timing_label,
          sort_order: i,
          pass_cost: passCost,
          products,
        };
      });

      const totalCost = computedPasses.reduce((sum, p) => sum + (p.pass_cost ?? 0), 0);
      const planCostPerAcre = acresNum > 0 ? totalCost / acresNum : 0;

      // Sanitize: replace any NaN/Infinity that slipped through with 0
      const safeNum = (n: number | undefined | null) =>
        n == null || !isFinite(n) ? 0 : n;
      const sanitizedPasses = computedPasses.map((pass) => ({
        ...pass,
        pass_cost: safeNum(pass.pass_cost),
        products: pass.products.map((p) => ({
          ...p,
          unit_cost: safeNum(p.unit_cost),
          line_total: safeNum(p.line_total),
          cost_per_acre: safeNum(p.cost_per_acre),
          units_needed: safeNum(p.units_needed),
        })),
      }));

      // 3. Save passes and products
      const saveRes = await fetch(`/api/crop/${planId}/passes?tenant_id=${tenant.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passes: sanitizedPasses,
          total_cost: safeNum(totalCost),
          cost_per_acre: safeNum(planCostPerAcre),
          ai_generated: true,
        }),
      });

      if (!saveRes.ok) {
        const saveData = await saveRes.json();
        setSaveError(saveData.error ?? 'Failed to save plan.');
        return;
      }

      router.push(`/crop/${planId}`);
    } catch {
      setSaveError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      {/* Header */}
      <div className="border-b border-border/40 bg-white py-4">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/crop"
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 hover:cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
              My Plans
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-medium text-slate-700">New Plan</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Step indicator */}
        <div className="mb-8 flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                  step > s
                    ? 'bg-emerald-600 text-white'
                    : step === s
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {step > s ? <Check className="h-4 w-4" /> : s}
              </div>
              <span className={`text-sm font-medium ${step === s ? 'text-slate-900' : 'text-slate-400'}`}>
                {s === 1 ? 'Crop & Acres' : s === 2 ? 'Weed Targets' : 'Review Plan'}
              </span>
              {s < 3 && <ChevronRight className="h-4 w-4 text-slate-300" />}
            </div>
          ))}
        </div>

        {/* Step 1: Crop & Acres */}
        {step === 1 && (
          <div>
            <h1 className="mb-2 text-2xl font-extrabold text-slate-900">Select Your Crop</h1>
            <p className="mb-6 text-slate-500">Choose the crop you&apos;re planning for this season.</p>

            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {CROPS.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => setCrop(c.slug)}
                  className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all hover:cursor-pointer ${
                    crop === c.slug ? c.selectedBg : c.cardBg
                  }`}
                >
                  {c.icon}
                  <span className="font-bold text-slate-900 text-sm">{c.label}</span>
                </button>
              ))}
            </div>

            {/* Soil Temperature Widget — shown when crop is selected and farm location is available */}
            {crop && (envCoords || farmZip) && (
              <div className="mb-6">
                <p className="mb-2 text-sm font-semibold text-slate-700">
                  Current Field Conditions
                </p>
                <SoilTemperatureWidget
                  latitude={envCoords?.lat}
                  longitude={envCoords?.lng}
                  zip={envCoords ? undefined : (farmZip ?? undefined)}
                  cropType={crop}
                  onDataLoaded={(lat, lng) => setEnvCoords({ lat, lng })}
                />
              </div>
            )}

            <div className="mb-4">
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Total Acres <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="1000000"
                value={acres}
                onChange={(e) => setAcres(e.target.value)}
                placeholder="e.g. 1000"
                className="w-full rounded-lg border border-border px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="mb-6">
              <label className="mb-1 block text-sm font-semibold text-slate-700">Plan Name (optional)</label>
              <input
                type="text"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder={crop ? `${crop.charAt(0).toUpperCase() + crop.slice(1)} Plan ${new Date().getFullYear()}` : 'e.g. North Field Corn 2026'}
                className="w-full rounded-lg border border-border px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <Button
              onClick={() => setStep(2)}
              disabled={!crop || !acres || parseFloat(acres) <= 0}
              className="w-full bg-emerald-600 hover:bg-emerald-700 hover:cursor-pointer"
              size="lg"
            >
              Next: Target Weeds
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        )}

        {/* Step 2: Weed targets */}
        {step === 2 && (
          <div>
            <h1 className="mb-2 text-2xl font-extrabold text-slate-900">What Weeds Are You Fighting?</h1>
            <p className="mb-6 text-slate-500">
              Select or type the weeds you&apos;re targeting. Our AI will build a program specifically designed to control them.
            </p>

            {/* Common weed chips */}
            <div className="mb-4">
              <p className="mb-2 text-sm font-semibold text-slate-700">Common Problem Weeds</p>
              <div className="flex flex-wrap gap-2">
                {COMMON_WEEDS.map((weed) => (
                  <button
                    key={weed}
                    onClick={() => addWeed(weed)}
                    disabled={targetWeeds.includes(weed)}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors hover:cursor-pointer ${
                      targetWeeds.includes(weed)
                        ? 'border-emerald-400 bg-emerald-100 text-emerald-700 cursor-default'
                        : 'border-border bg-white text-slate-700 hover:border-emerald-400 hover:bg-emerald-50'
                    }`}
                  >
                    {targetWeeds.includes(weed) ? <Check className="inline h-3 w-3 mr-1" /> : <Plus className="inline h-3 w-3 mr-1" />}
                    {weed}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom weed input */}
            <div className="mb-4">
              <label className="mb-1 block text-sm font-semibold text-slate-700">Add a Custom Weed</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={weedInput}
                  onChange={(e) => setWeedInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addWeed(weedInput)}
                  placeholder="Type weed name and press Enter"
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <Button
                  onClick={() => addWeed(weedInput)}
                  disabled={!weedInput.trim()}
                  variant="outline"
                  className="hover:cursor-pointer"
                >
                  Add
                </Button>
              </div>
            </div>

            {/* Selected weeds */}
            {targetWeeds.length > 0 && (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="mb-2 text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                  Selected Weeds ({targetWeeds.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {targetWeeds.map((weed) => (
                    <span
                      key={weed}
                      className="flex items-center gap-1 rounded-full bg-white border border-emerald-300 px-3 py-1 text-sm text-emerald-800"
                    >
                      {weed}
                      <button
                        onClick={() => removeWeed(weed)}
                        className="ml-1 text-emerald-500 hover:text-red-500 hover:cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Weed pressure */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-semibold text-slate-700">Weed Pressure Level</label>
              <div className="grid grid-cols-3 gap-3">
                {(['light', 'moderate', 'heavy'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setWeedPressure(level)}
                    className={`rounded-xl border-2 p-3 text-center transition-all hover:cursor-pointer ${
                      weedPressure === level
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                        : 'border-border bg-white text-slate-700 hover:border-emerald-300'
                    }`}
                  >
                    <p className="font-bold capitalize">{level}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {level === 'light' ? 'Few escapes' : level === 'moderate' ? 'Typical pressure' : 'Dense population'}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {genError && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {genError}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="hover:cursor-pointer"
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={targetWeeds.length === 0 || generating}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 hover:cursor-pointer"
                size="lg"
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Building Your Plan...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    Generate AI Plan
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Review AI draft */}
        {step === 3 && draft && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              <h1 className="text-2xl font-extrabold text-slate-900">Review Your Plan</h1>
            </div>
            <p className="mb-2 text-slate-500">
              AI-generated plan for <strong className="capitalize">{crop}</strong> targeting{' '}
              <strong>{targetWeeds.join(', ')}</strong>. Review and remove anything that doesn&apos;t fit your operation.
            </p>

            {draft.summary && (
              <div className="mb-4 rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-800">
                <p className="font-semibold mb-1">Plan Summary</p>
                <p>{draft.summary}</p>
              </div>
            )}

            {draft.weed_management_notes && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold mb-1">Resistance Management Notes</p>
                <p>{draft.weed_management_notes}</p>
              </div>
            )}

            {/* Carbon score preview */}
            {previewCarbonScore && (
              <div className="mb-6">
                <CarbonScoreWidget carbonScore={previewCarbonScore} acres={parseFloat(acres) || 0} />
              </div>
            )}

            {/* Passes */}
            {(() => {
              const acresNum = parseFloat(acres) || 0;
              let grandTotal = 0;
              const passBlocks = draft.passes.map((pass, passIdx) => {
                const cardColor = CATEGORY_COLORS[pass.category] ?? 'bg-slate-50 border-slate-200';
                const badgeColor = CATEGORY_BADGE[pass.category] ?? 'bg-slate-100 text-slate-700';
                let passCost = 0;
                const productRows = pass.products.map((product, productIdx) => {
                  const unitsNeeded = acresNum > 0
                    ? calcUnitsNeeded(acresNum, product.rate_per_acre, product.unit_size, product.rate_unit, product.unit_size_unit, product.lbs_per_gallon)
                    : 0;
                  const unitCost = parseFloat(product.price) || 0;
                  const lineTotal = unitsNeeded * unitCost;
                  const cpa = acresNum > 0 ? calcCostPerAcre(unitsNeeded, product.price, acresNum) : 0;
                  passCost += lineTotal;
                  return (
                    <div
                      key={productIdx}
                      className="rounded-xl border border-border bg-white p-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-slate-900 text-sm">{product.product_name}</p>
                            {product.is_recommended && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                Recommended
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {product.rate_per_acre} {product.rate_unit}/acre
                            {product.price && (
                              <span className="ml-2 text-slate-400">
                                · ${parseFloat(product.price).toFixed(2)}/{product.unit_of_measure ?? 'unit'}
                              </span>
                            )}
                          </p>
                          {product.reasoning && (
                            <p className="mt-1 text-xs text-slate-400 italic line-clamp-2">{product.reasoning}</p>
                          )}
                        </div>
                        <button
                          onClick={() => removeProductFromDraft(passIdx, productIdx)}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border text-slate-300 hover:text-red-500 hover:cursor-pointer"
                          title="Remove product"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      {acresNum > 0 && (
                        <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg border border-border/50 bg-slate-50 p-2 text-center text-xs">
                          <div>
                            <p className="text-slate-400">Units needed</p>
                            <p className="font-bold text-slate-800">{unitsNeeded}</p>
                            <p className="text-slate-400">{product.unit_of_measure ?? 'units'}</p>
                          </div>
                          <div>
                            <p className="text-slate-400">Line total</p>
                            <p className="font-bold text-slate-800">${lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            <p className="text-slate-400">for {acresNum.toLocaleString()} ac</p>
                          </div>
                          <div>
                            <p className="text-slate-400">Cost/acre</p>
                            <p className="font-bold text-emerald-700">${cpa.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
                grandTotal += passCost;
                return (
                  <div key={passIdx} className={`rounded-2xl border-2 p-4 ${cardColor}`}>
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${badgeColor}`}>
                          {pass.category}
                        </span>
                        <h3 className="mt-1 font-bold text-slate-900">{pass.name}</h3>
                        {pass.timing_label && (
                          <p className="text-xs text-slate-500">{pass.timing_label}</p>
                        )}
                      </div>
                      <button
                        onClick={() => removePassFromDraft(passIdx)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-white text-slate-400 hover:text-red-500 hover:cursor-pointer"
                        title="Remove pass"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="space-y-2">{productRows}</div>
                    {acresNum > 0 && passCost > 0 && (
                      <div className="mt-3 flex items-center justify-between rounded-lg border border-border/50 bg-white/70 px-3 py-2 text-sm">
                        <span className="text-slate-500">Pass total</span>
                        <span className="font-bold text-slate-900">
                          ${passCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                );
              });

              return (
                <>
                  <div className="mb-4 space-y-4">{passBlocks}</div>
                  {acresNum > 0 && grandTotal > 0 && (
                    <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-slate-500">Estimated total program cost</p>
                          <p className="text-2xl font-extrabold text-slate-900">
                            ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-slate-500">Cost per acre</p>
                          <p className="text-2xl font-extrabold text-emerald-700">
                            ${(grandTotal / acresNum).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {saveError && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {saveError}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => { setStep(2); setDraft(null); }}
                className="hover:cursor-pointer"
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Regenerate
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || draft.passes.length === 0}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 hover:cursor-pointer"
                size="lg"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Saving Plan...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-5 w-5" />
                    Save Plan
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
