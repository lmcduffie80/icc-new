'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Search,
  X,
  Sparkles,
  Check,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Program {
  id: number;
  crop: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  pass_count: string;
}

interface Pass {
  id: number;
  name: string;
  timing_label: string | null;
  category: string;
  description: string | null;
  is_required: boolean;
  sort_order: number;
  product_count: string;
}

interface LabelScenario {
  label: string;
  rate: number;
}

interface PassProduct {
  id: number;
  product_id: string;
  product_name: string;
  price: string;
  unit_of_measure: string | null;
  is_recommended: boolean;
  default_rate_per_acre: string;
  min_rate: string;
  max_rate: string;
  rate_unit: string;
  unit_size: string;
  unit_size_unit: string | null;
  lbs_per_gallon: string | null;
  label_scenarios: LabelScenario[] | null;
  sort_order: number;
}

interface AIDraftProduct {
  product_id: string;
  product_name: string;
  is_recommended: boolean;
  default_rate_per_acre: number;
  min_rate: number;
  max_rate: number;
  rate_unit: string;
  unit_size: number;
  unit_size_unit: string;
  lbs_per_gallon: number | null;
  reasoning: string;
}

interface AIDraftPass {
  name: string;
  timing_label: string;
  category: string;
  description: string;
  is_required: boolean;
  sort_order: number;
  products: AIDraftProduct[];
}

interface AIDraftProgram {
  passes: AIDraftPass[];
  summary: string;
}

const CATEGORY_OPTIONS = ['Herbicides', 'Fungicides', 'Insecticides', 'Adjuvants', 'Other'];
const RATE_UNIT_OPTIONS = ['fl oz', 'oz', 'lbs', 'pt', 'qt', 'gal'];

interface ProductSearchResult {
  id: string;
  name: string;
  price: string;
  unit_of_measure: string | null;
}

export function AcrePackManager() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProgram, setExpandedProgram] = useState<number | null>(null);
  const [passes, setPasses] = useState<Record<number, Pass[]>>({});
  const [expandedPass, setExpandedPass] = useState<number | null>(null);
  const [passProducts, setPassProducts] = useState<Record<number, PassProduct[]>>({});
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New pass form state
  const [newPassForm, setNewPassForm] = useState<Record<number, {
    name: string;
    timing_label: string;
    category: string;
    description: string;
    is_required: boolean;
  }>>({});

  // New product form state
  const [newProductForm, setNewProductForm] = useState<Record<number, {
    product_id: string;
    is_recommended: boolean;
    default_rate_per_acre: string;
    min_rate: string;
    max_rate: string;
    rate_unit: string;
    unit_size: string;
    unit_size_unit: string;
    lbs_per_gallon: string;
    label_scenarios: LabelScenario[];
  }>>({});

  // Inline edit state for existing pass products (key: `${passId}:${productId}`)
  const [editingProduct, setEditingProduct] = useState<Record<string, {
    default_rate_per_acre: string;
    min_rate: string;
    max_rate: string;
    rate_unit: string;
    unit_size: string;
    unit_size_unit: string;
    lbs_per_gallon: string;
    is_recommended: boolean;
    label_scenarios: LabelScenario[];
  }>>({});

  // All products loaded once for the dropdown picker
  const [allProducts, setAllProducts] = useState<ProductSearchResult[]>([]);
  const [allProductsLoading, setAllProductsLoading] = useState(false);

  // Product picker state (keyed by passId)
  const [productSearchQuery, setProductSearchQuery] = useState<Record<number, string>>({});
  const [productDropdownOpen, setProductDropdownOpen] = useState<Record<number, boolean>>({});
  const [selectedProductName, setSelectedProductName] = useState<Record<number, string>>({});
  const blurTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // AI generation state
  const [aiGenerating, setAiGenerating] = useState<number | null>(null);
  const [aiDraft, setAiDraft] = useState<AIDraftProgram | null>(null);
  const [aiDraftCrop, setAiDraftCrop] = useState<string>('');
  const [aiDraftProgramId, setAiDraftProgramId] = useState<number | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [aiApplyProgress, setAiApplyProgress] = useState('');
  const [aiExpandedPass, setAiExpandedPass] = useState<number | null>(null);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Load all products once on mount
  useEffect(() => {
    setAllProductsLoading(true);
    fetch('/api/admin/products')
      .then((r) => r.json())
      .then((data) => setAllProducts(Array.isArray(data) ? data : []))
      .catch(() => setAllProducts([]))
      .finally(() => setAllProductsLoading(false));
  }, []);

  const getFilteredProducts = (passId: number): ProductSearchResult[] => {
    const q = (productSearchQuery[passId] ?? '').toLowerCase().trim();
    if (!q) return allProducts.slice(0, 60);
    return allProducts.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 60);
  };

  const handleProductQueryChange = (passId: number, value: string) => {
    setProductSearchQuery((prev) => ({ ...prev, [passId]: value }));
    // Clear selection if user starts typing again
    if (selectedProductName[passId]) {
      setSelectedProductName((prev) => ({ ...prev, [passId]: '' }));
      setNewProductForm((prev) => ({
        ...prev,
        [passId]: { ...prev[passId] ?? defaultProductForm(), product_id: '' },
      }));
    }
  };

  const handleProductFocus = (passId: number) => {
    if (blurTimers.current[passId]) clearTimeout(blurTimers.current[passId]);
    setProductDropdownOpen((prev) => ({ ...prev, [passId]: true }));
  };

  const handleProductBlur = (passId: number) => {
    blurTimers.current[passId] = setTimeout(() => {
      setProductDropdownOpen((prev) => ({ ...prev, [passId]: false }));
    }, 150);
  };

  const handleSelectProduct = (passId: number, product: ProductSearchResult) => {
    setNewProductForm((prev) => ({
      ...prev,
      [passId]: { ...prev[passId] ?? defaultProductForm(), product_id: product.id },
    }));
    setSelectedProductName((prev) => ({ ...prev, [passId]: product.name }));
    setProductSearchQuery((prev) => ({ ...prev, [passId]: '' }));
    setProductDropdownOpen((prev) => ({ ...prev, [passId]: false }));
  };

  const handleClearProductSelection = (passId: number) => {
    setSelectedProductName((prev) => ({ ...prev, [passId]: '' }));
    setProductSearchQuery((prev) => ({ ...prev, [passId]: '' }));
    setProductDropdownOpen((prev) => ({ ...prev, [passId]: false }));
    setNewProductForm((prev) => ({
      ...prev,
      [passId]: { ...prev[passId] ?? defaultProductForm(), product_id: '' },
    }));
  };

  const handleStartEdit = (passId: number, pp: PassProduct) => {
    const key = `${passId}:${pp.product_id}`;
    setEditingProduct((prev) => ({
      ...prev,
      [key]: {
        default_rate_per_acre: pp.default_rate_per_acre,
        min_rate: pp.min_rate,
        max_rate: pp.max_rate,
        rate_unit: pp.rate_unit,
        unit_size: pp.unit_size,
        unit_size_unit: pp.unit_size_unit ?? 'gal',
        lbs_per_gallon: pp.lbs_per_gallon ?? '',
        is_recommended: pp.is_recommended,
        label_scenarios: pp.label_scenarios ? [...pp.label_scenarios] : [],
      },
    }));
  };

  const handleCancelEdit = (passId: number, productId: string) => {
    const key = `${passId}:${productId}`;
    setEditingProduct((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSaveEdit = async (passId: number, productId: string) => {
    const key = `${passId}:${productId}`;
    const form = editingProduct[key];
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/acre-pack/passes/${passId}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          is_recommended: form.is_recommended,
          default_rate_per_acre: parseFloat(form.default_rate_per_acre) || 1,
          min_rate: parseFloat(form.min_rate) || 0.5,
          max_rate: parseFloat(form.max_rate) || 4,
          rate_unit: form.rate_unit || 'fl oz',
          unit_size: parseFloat(form.unit_size) || 1,
          unit_size_unit: form.unit_size_unit || null,
          lbs_per_gallon: form.lbs_per_gallon ? parseFloat(form.lbs_per_gallon) : null,
          label_scenarios: form.label_scenarios.length > 0 ? form.label_scenarios : null,
        }),
      });
      if (!res.ok) throw new Error();
      await fetchPassProducts(passId);
      handleCancelEdit(passId, productId);
      showStatus('success', 'Product updated.');
    } catch {
      showStatus('error', 'Failed to update product.');
    } finally {
      setSaving(false);
    }
  };

  const fetchPrograms = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/acre-pack');
      if (!res.ok) throw new Error('Failed to load programs');
      const data = await res.json();
      setPrograms(data.programs);
    } catch {
      setError('Failed to load Crop Planning programs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPrograms(); }, [fetchPrograms]);

  const fetchPasses = async (programId: number) => {
    try {
      const res = await fetch(`/api/admin/acre-pack/passes?programId=${programId}`);
      if (!res.ok) throw new Error('Failed to load passes');
      const data = await res.json();
      setPasses((prev) => ({ ...prev, [programId]: data.passes }));
    } catch {
      showStatus('error', 'Failed to load passes.');
    }
  };

  const fetchPassProducts = async (passId: number) => {
    try {
      const res = await fetch(`/api/admin/acre-pack/passes/${passId}/products`);
      if (!res.ok) throw new Error('Failed to load products');
      const data = await res.json();
      setPassProducts((prev) => ({ ...prev, [passId]: data.products }));
    } catch {
      showStatus('error', 'Failed to load pass products.');
    }
  };

  const toggleProgramActive = async (program: Program) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/acre-pack', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: program.id, is_active: !program.is_active }),
      });
      if (!res.ok) throw new Error();
      setPrograms((prev) =>
        prev.map((p) => (p.id === program.id ? { ...p, is_active: !p.is_active } : p))
      );
      showStatus('success', `${program.name} ${!program.is_active ? 'activated' : 'deactivated'}.`);
    } catch {
      showStatus('error', 'Failed to update program.');
    } finally {
      setSaving(false);
    }
  };

  const handleExpandProgram = async (programId: number) => {
    if (expandedProgram === programId) {
      setExpandedProgram(null);
      return;
    }
    setExpandedProgram(programId);
    if (!passes[programId]) {
      await fetchPasses(programId);
    }
  };

  const handleExpandPass = async (passId: number) => {
    if (expandedPass === passId) {
      setExpandedPass(null);
      return;
    }
    setExpandedPass(passId);
    if (!passProducts[passId]) {
      await fetchPassProducts(passId);
    }
  };

  const handleCreatePass = async (programId: number) => {
    const form = newPassForm[programId];
    if (!form?.name || !form?.category) {
      showStatus('error', 'Pass name and category are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/acre-pack/passes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program_id: programId,
          name: form.name,
          timing_label: form.timing_label || null,
          category: form.category,
          description: form.description || null,
          is_required: form.is_required,
        }),
      });
      if (!res.ok) throw new Error();
      await fetchPasses(programId);
      setNewPassForm((prev) => ({ ...prev, [programId]: { name: '', timing_label: '', category: 'Herbicides', description: '', is_required: false } }));
      showStatus('success', 'Pass created.');
    } catch {
      showStatus('error', 'Failed to create pass.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePass = async (programId: number, passId: number) => {
    if (!confirm('Delete this pass and all its product assignments?')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/acre-pack/passes?id=${passId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setPasses((prev) => ({ ...prev, [programId]: (prev[programId] ?? []).filter((p) => p.id !== passId) }));
      showStatus('success', 'Pass deleted.');
    } catch {
      showStatus('error', 'Failed to delete pass.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddProduct = async (passId: number) => {
    const form = newProductForm[passId];
    if (!form?.product_id) {
      showStatus('error', 'Product ID is required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/acre-pack/passes/${passId}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: form.product_id,
          is_recommended: form.is_recommended,
          default_rate_per_acre: parseFloat(form.default_rate_per_acre) || 1,
          min_rate: parseFloat(form.min_rate) || 0.5,
          max_rate: parseFloat(form.max_rate) || 4,
          rate_unit: form.rate_unit || 'fl oz',
          unit_size: parseFloat(form.unit_size) || 1,
          unit_size_unit: form.unit_size_unit || null,
          lbs_per_gallon: form.lbs_per_gallon ? parseFloat(form.lbs_per_gallon) : null,
          label_scenarios: form.label_scenarios.length > 0 ? form.label_scenarios : null,
        }),
      });
      if (!res.ok) throw new Error();
      await fetchPassProducts(passId);
      setNewProductForm((prev) => ({
        ...prev,
        [passId]: defaultProductForm(),
      }));
      setSelectedProductName((prev) => ({ ...prev, [passId]: '' }));
      setProductSearchQuery((prev) => ({ ...prev, [passId]: '' }));
      setProductDropdownOpen((prev) => ({ ...prev, [passId]: false }));
      showStatus('success', 'Product assigned to pass.');
    } catch {
      showStatus('error', 'Failed to assign product. Check that the product ID exists.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveProduct = async (passId: number, productId: string) => {
    if (!confirm('Remove this product from the pass?')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/acre-pack/passes/${passId}/products?productId=${productId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setPassProducts((prev) => ({
        ...prev,
        [passId]: (prev[passId] ?? []).filter((p) => p.product_id !== productId),
      }));
      showStatus('success', 'Product removed.');
    } catch {
      showStatus('error', 'Failed to remove product.');
    } finally {
      setSaving(false);
    }
  };

  const handleAIGenerate = async (program: Program) => {
    setAiGenerating(program.id);
    try {
      const res = await fetch('/api/admin/acre-pack/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crop: program.crop }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      setAiDraft(data.draft);
      setAiDraftCrop(program.crop);
      setAiDraftProgramId(program.id);
      setAiModalOpen(true);
      setAiExpandedPass(0);
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'AI generation failed.');
    } finally {
      setAiGenerating(null);
    }
  };

  const handleAIRemovePass = (passIndex: number) => {
    if (!aiDraft) return;
    setAiDraft({
      ...aiDraft,
      passes: aiDraft.passes.filter((_, i) => i !== passIndex),
    });
  };

  const handleAIRemoveProduct = (passIndex: number, productIndex: number) => {
    if (!aiDraft) return;
    const updatedPasses = [...aiDraft.passes];
    updatedPasses[passIndex] = {
      ...updatedPasses[passIndex],
      products: updatedPasses[passIndex].products.filter((_, i) => i !== productIndex),
    };
    setAiDraft({ ...aiDraft, passes: updatedPasses });
  };

  const handleAIToggleRecommended = (passIndex: number, productIndex: number) => {
    if (!aiDraft) return;
    const updatedPasses = [...aiDraft.passes];
    const products = [...updatedPasses[passIndex].products];
    products[productIndex] = { ...products[productIndex], is_recommended: !products[productIndex].is_recommended };
    updatedPasses[passIndex] = { ...updatedPasses[passIndex], products };
    setAiDraft({ ...aiDraft, passes: updatedPasses });
  };

  const handleAIUpdateRate = (passIndex: number, productIndex: number, field: 'default_rate_per_acre' | 'min_rate' | 'max_rate', value: string) => {
    if (!aiDraft) return;
    const updatedPasses = [...aiDraft.passes];
    const products = [...updatedPasses[passIndex].products];
    products[productIndex] = { ...products[productIndex], [field]: parseFloat(value) || 0 };
    updatedPasses[passIndex] = { ...updatedPasses[passIndex], products };
    setAiDraft({ ...aiDraft, passes: updatedPasses });
  };

  const handleAIApply = async () => {
    if (!aiDraft || aiDraftProgramId === null) return;
    setAiApplying(true);
    try {
      const totalPasses = aiDraft.passes.length;
      let passesCreated = 0;
      let productsAssigned = 0;

      for (const pass of aiDraft.passes) {
        setAiApplyProgress(`Creating pass ${passesCreated + 1} of ${totalPasses}: ${pass.name}...`);

        const passRes = await fetch('/api/admin/acre-pack/passes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            program_id: aiDraftProgramId,
            name: pass.name,
            timing_label: pass.timing_label || null,
            category: pass.category,
            description: pass.description || null,
            is_required: pass.is_required,
            sort_order: pass.sort_order,
          }),
        });
        if (!passRes.ok) {
          const err = await passRes.json().catch(() => ({}));
          throw new Error(`Failed to create pass "${pass.name}": ${err.error || passRes.status}`);
        }
        const passData = await passRes.json();
        const newPassId = passData.pass?.id;
        if (!newPassId) throw new Error(`No pass ID returned for "${pass.name}"`);

        passesCreated++;

        for (const product of pass.products) {
          setAiApplyProgress(`Assigning ${product.product_name} to ${pass.name}...`);
          const prodRes = await fetch(`/api/admin/acre-pack/passes/${newPassId}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              product_id: product.product_id,
              is_recommended: product.is_recommended,
              default_rate_per_acre: product.default_rate_per_acre,
              min_rate: product.min_rate,
              max_rate: product.max_rate,
              rate_unit: product.rate_unit,
              unit_size: product.unit_size,
              unit_size_unit: product.unit_size_unit || null,
              lbs_per_gallon: product.lbs_per_gallon,
            }),
          });
          if (!prodRes.ok) {
            console.error(`Failed to assign product ${product.product_name} to pass ${pass.name}`);
          } else {
            productsAssigned++;
          }
        }
      }

      setAiModalOpen(false);
      setAiDraft(null);
      setAiApplyProgress('');

      await fetchPasses(aiDraftProgramId);
      if (expandedProgram !== aiDraftProgramId) {
        setExpandedProgram(aiDraftProgramId);
      }

      showStatus('success', `AI program applied: ${passesCreated} passes created, ${productsAssigned} products assigned.`);
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Failed to apply AI program.');
    } finally {
      setAiApplying(false);
      setAiApplyProgress('');
    }
  };

  const handleAIDiscard = () => {
    setAiModalOpen(false);
    setAiDraft(null);
    setAiDraftCrop('');
    setAiDraftProgramId(null);
    setAiExpandedPass(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status message */}
      {statusMessage && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Preview link */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link href="/shop/acre-pack" target="_blank">
            <ExternalLink className="mr-1.5 h-4 w-4" />
            Preview Crop Planning
          </Link>
        </Button>
      </div>

      {programs.map((program) => (
        <div key={program.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Program header */}
          <div className="flex items-center justify-between px-5 py-4">
            <button
              onClick={() => handleExpandProgram(program.id)}
              className="flex flex-1 items-center gap-3 text-left hover:cursor-pointer"
            >
              {expandedProgram === program.id ? (
                <ChevronDown className="h-5 w-5 text-slate-400" />
              ) : (
                <ChevronRight className="h-5 w-5 text-slate-400" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{program.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    program.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {program.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {program.pass_count} passes · Crop: {program.crop}
                </p>
              </div>
            </button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAIGenerate(program)}
                disabled={saving || aiGenerating !== null}
                className="gap-1.5 text-violet-600 border-violet-200 hover:bg-violet-50 hover:text-violet-700 hover:cursor-pointer"
                title="Generate program with AI"
              >
                {aiGenerating === program.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {aiGenerating === program.id ? 'Generating...' : 'AI Generate'}
              </Button>
              <button
                onClick={() => toggleProgramActive(program)}
                disabled={saving}
                className="text-slate-400 hover:text-slate-700 transition-colors hover:cursor-pointer"
                title={program.is_active ? 'Deactivate program' : 'Activate program'}
              >
                {program.is_active ? (
                  <ToggleRight className="h-6 w-6 text-emerald-500" />
                ) : (
                  <ToggleLeft className="h-6 w-6" />
                )}
              </button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/shop/acre-pack/${program.crop}`} target="_blank">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Passes */}
          {expandedProgram === program.id && (
            <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 space-y-3">
              {(passes[program.id] ?? []).length === 0 && (
                <p className="text-sm text-slate-400">No passes yet. Add one below.</p>
              )}

              {(passes[program.id] ?? []).map((pass) => (
                <div key={pass.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3">
                    <button
                      onClick={() => handleExpandPass(pass.id)}
                      className="flex flex-1 items-center gap-2 text-left hover:cursor-pointer"
                    >
                      {expandedPass === pass.id ? (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      )}
                      <div>
                        <span className="text-sm font-medium text-slate-800">{pass.name}</span>
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          {pass.category}
                        </span>
                        {pass.is_required && (
                          <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                            Recommended
                          </span>
                        )}
                        <p className="text-xs text-slate-400 mt-0.5">
                          {pass.product_count} products
                          {pass.timing_label ? ` · ${pass.timing_label}` : ''}
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => handleDeletePass(program.id, pass.id)}
                      disabled={saving}
                      className="text-slate-300 hover:text-red-500 transition-colors hover:cursor-pointer"
                      title="Delete pass"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Pass products */}
                  {expandedPass === pass.id && (
                    <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-2">
                      {(passProducts[pass.id] ?? []).length === 0 && (
                        <p className="text-xs text-slate-400">No products assigned. Add one below.</p>
                      )}

                      {(passProducts[pass.id] ?? []).map((pp) => {
                        const editKey = `${pass.id}:${pp.product_id}`;
                        const editForm = editingProduct[editKey];
                        if (editForm) {
                          // Edit mode
                          return (
                            <div key={pp.id} className="rounded-md border border-emerald-300 bg-emerald-50 p-3 space-y-2">
                              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                                Editing: {pp.product_name}
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-slate-500">Default Rate/Acre</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={editForm.default_rate_per_acre}
                                    onChange={(e) => setEditingProduct((prev) => ({
                                      ...prev,
                                      [editKey]: { ...prev[editKey], default_rate_per_acre: e.target.value },
                                    }))}
                                    className="w-full rounded border border-input bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">Rate Unit</label>
                                  <select
                                    value={editForm.rate_unit}
                                    onChange={(e) => setEditingProduct((prev) => ({
                                      ...prev,
                                      [editKey]: { ...prev[editKey], rate_unit: e.target.value },
                                    }))}
                                    className="w-full rounded border border-input bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  >
                                    {RATE_UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">Min Rate</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={editForm.min_rate}
                                    onChange={(e) => setEditingProduct((prev) => ({
                                      ...prev,
                                      [editKey]: { ...prev[editKey], min_rate: e.target.value },
                                    }))}
                                    className="w-full rounded border border-input bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">Max Rate</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={editForm.max_rate}
                                    onChange={(e) => setEditingProduct((prev) => ({
                                      ...prev,
                                      [editKey]: { ...prev[editKey], max_rate: e.target.value },
                                    }))}
                                    className="w-full rounded border border-input bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">Unit Size</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={editForm.unit_size}
                                    onChange={(e) => setEditingProduct((prev) => ({
                                      ...prev,
                                      [editKey]: { ...prev[editKey], unit_size: e.target.value },
                                    }))}
                                    className="w-full rounded border border-input bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">Container Unit</label>
                                  <select
                                    value={editForm.unit_size_unit}
                                    onChange={(e) => setEditingProduct((prev) => ({
                                      ...prev,
                                      [editKey]: { ...prev[editKey], unit_size_unit: e.target.value },
                                    }))}
                                    className="w-full rounded border border-input bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  >
                                    {RATE_UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                                  </select>
                                </div>
                                {editForm.rate_unit === 'lbs' && (
                                  <div className="col-span-2">
                                    <label className="text-xs text-slate-500">Lbs per Gallon</label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      placeholder="e.g. 10 for Glyphosate"
                                      value={editForm.lbs_per_gallon}
                                      onChange={(e) => setEditingProduct((prev) => ({
                                        ...prev,
                                        [editKey]: { ...prev[editKey], lbs_per_gallon: e.target.value },
                                      }))}
                                      className="w-full rounded border border-input bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    />
                                  </div>
                                )}
                                <div className="col-span-2 flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id={`edit-rec-${editKey}`}
                                    checked={editForm.is_recommended}
                                    onChange={(e) => setEditingProduct((prev) => ({
                                      ...prev,
                                      [editKey]: { ...prev[editKey], is_recommended: e.target.checked },
                                    }))}
                                    className="h-3.5 w-3.5 accent-emerald-600"
                                  />
                                  <label htmlFor={`edit-rec-${editKey}`} className="text-xs text-slate-600">
                                    Mark as recommended
                                  </label>
                                </div>
                                {/* Label Scenarios Editor */}
                                <div className="col-span-2 space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <label className="text-xs text-slate-500">Label Rate Scenarios</label>
                                    <button
                                      type="button"
                                      onClick={() => setEditingProduct((prev) => ({
                                        ...prev,
                                        [editKey]: {
                                          ...prev[editKey],
                                          label_scenarios: [...(prev[editKey].label_scenarios ?? []), { label: '', rate: 0 }],
                                        },
                                      }))}
                                      className="text-xs text-emerald-600 hover:text-emerald-800 hover:cursor-pointer"
                                    >
                                      + Add scenario
                                    </button>
                                  </div>
                                  {editForm.label_scenarios.length === 0 && (
                                    <p className="text-xs text-slate-400 italic">No scenarios. Click &quot;+ Add scenario&quot; to add label rate reference rows.</p>
                                  )}
                                  {editForm.label_scenarios.map((scenario, idx) => (
                                    <div key={idx} className="flex items-center gap-1.5">
                                      <input
                                        type="text"
                                        placeholder="Scenario label"
                                        value={scenario.label}
                                        onChange={(e) => {
                                          const updated = [...editForm.label_scenarios];
                                          updated[idx] = { ...updated[idx], label: e.target.value };
                                          setEditingProduct((prev) => ({ ...prev, [editKey]: { ...prev[editKey], label_scenarios: updated } }));
                                        }}
                                        className="flex-1 rounded border border-input bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                      />
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Rate"
                                        value={scenario.rate}
                                        onChange={(e) => {
                                          const updated = [...editForm.label_scenarios];
                                          updated[idx] = { ...updated[idx], rate: parseFloat(e.target.value) || 0 };
                                          setEditingProduct((prev) => ({ ...prev, [editKey]: { ...prev[editKey], label_scenarios: updated } }));
                                        }}
                                        className="w-20 rounded border border-input bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                      />
                                      <span className="text-xs text-slate-400">{editForm.rate_unit}</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = editForm.label_scenarios.filter((_, i) => i !== idx);
                                          setEditingProduct((prev) => ({ ...prev, [editKey]: { ...prev[editKey], label_scenarios: updated } }));
                                        }}
                                        className="text-slate-300 hover:text-red-500 hover:cursor-pointer"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveEdit(pass.id, pp.product_id)}
                                  disabled={saving}
                                  className="flex-1"
                                >
                                  {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCancelEdit(pass.id, pp.product_id)}
                                  disabled={saving}
                                  className="flex-1"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          );
                        }
                        // View mode
                        return (
                          <div key={pp.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                            <div>
                              <span className="font-medium text-slate-800">{pp.product_name}</span>
                              {pp.is_recommended && (
                                <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">
                                  Recommended
                                </span>
                              )}
                              <p className="text-xs text-slate-400 mt-0.5">
                                Rate: {pp.default_rate_per_acre} {pp.rate_unit}/ac
                                {pp.lbs_per_gallon ? ` (${(parseFloat(pp.default_rate_per_acre) / parseFloat(pp.lbs_per_gallon)).toFixed(2)} gal/ac @ ${pp.lbs_per_gallon} lbs/gal)` : ''}
                                · Range: {pp.min_rate}–{pp.max_rate}
                                · Unit size: {pp.unit_size} {pp.unit_size_unit ?? (pp.lbs_per_gallon ? 'gal' : pp.rate_unit)}
                                {pp.label_scenarios && pp.label_scenarios.length > 0 ? ` · ${pp.label_scenarios.length} label scenario${pp.label_scenarios.length > 1 ? 's' : ''}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleStartEdit(pass.id, pp)}
                                disabled={saving}
                                className="text-slate-300 hover:text-emerald-600 transition-colors hover:cursor-pointer"
                                title="Edit product"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleRemoveProduct(pass.id, pp.product_id)}
                                disabled={saving}
                                className="text-slate-300 hover:text-red-500 transition-colors hover:cursor-pointer"
                                title="Remove product"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Add product form */}
                      <div className="rounded-md border border-dashed border-slate-300 bg-white p-3 space-y-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Add Product</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="col-span-2">
                            <label className="text-xs text-slate-500">Product</label>
                            {selectedProductName[pass.id] ? (
                              <div className="flex items-center gap-2 rounded border border-emerald-300 bg-emerald-50 px-2 py-1.5">
                                <span className="flex-1 text-xs font-medium text-emerald-800 truncate">
                                  {selectedProductName[pass.id]}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleClearProductSelection(pass.id)}
                                  className="text-emerald-500 hover:text-emerald-700 hover:cursor-pointer flex-shrink-0"
                                  title="Change product"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="relative">
                                <div className="relative">
                                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                                  <input
                                    type="text"
                                    placeholder={allProductsLoading ? 'Loading products…' : 'Click or type to pick a product…'}
                                    value={productSearchQuery[pass.id] ?? ''}
                                    onChange={(e) => handleProductQueryChange(pass.id, e.target.value)}
                                    onFocus={() => handleProductFocus(pass.id)}
                                    onBlur={() => handleProductBlur(pass.id)}
                                    disabled={allProductsLoading}
                                    className="w-full rounded border border-input bg-background pl-7 pr-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                                  />
                                  {allProductsLoading && (
                                    <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400" />
                                  )}
                                </div>
                                {productDropdownOpen[pass.id] && (
                                  <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-56 overflow-y-auto">
                                    {getFilteredProducts(pass.id).length > 0 ? (
                                      getFilteredProducts(pass.id).map((product) => (
                                        <button
                                          key={product.id}
                                          type="button"
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() => handleSelectProduct(pass.id, product)}
                                          className="w-full px-3 py-2 text-left hover:bg-emerald-50 transition-colors border-b border-slate-100 last:border-0 hover:cursor-pointer"
                                        >
                                          <p className="text-xs font-medium text-slate-800 truncate">{product.name}</p>
                                          <p className="text-xs text-slate-400">
                                            ${product.price}
                                            {product.unit_of_measure ? ` / ${product.unit_of_measure}` : ''}
                                          </p>
                                        </button>
                                      ))
                                    ) : (
                                      <p className="px-3 py-2 text-xs text-slate-400">No products match your search.</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">Default Rate/Acre</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={newProductForm[pass.id]?.default_rate_per_acre ?? '1'}
                              onChange={(e) => setNewProductForm((prev) => ({
                                ...prev,
                                [pass.id]: { ...prev[pass.id] ?? defaultProductForm(), default_rate_per_acre: e.target.value },
                              }))}
                              className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">Rate Unit</label>
                            <select
                              value={newProductForm[pass.id]?.rate_unit ?? 'fl oz'}
                              onChange={(e) => setNewProductForm((prev) => ({
                                ...prev,
                                [pass.id]: { ...prev[pass.id] ?? defaultProductForm(), rate_unit: e.target.value },
                              }))}
                              className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            >
                              {RATE_UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">Min Rate</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={newProductForm[pass.id]?.min_rate ?? '0.5'}
                              onChange={(e) => setNewProductForm((prev) => ({
                                ...prev,
                                [pass.id]: { ...prev[pass.id] ?? defaultProductForm(), min_rate: e.target.value },
                              }))}
                              className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">Max Rate</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={newProductForm[pass.id]?.max_rate ?? '4'}
                              onChange={(e) => setNewProductForm((prev) => ({
                                ...prev,
                                [pass.id]: { ...prev[pass.id] ?? defaultProductForm(), max_rate: e.target.value },
                              }))}
                              className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">Unit Size</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              placeholder="e.g. 265"
                              value={newProductForm[pass.id]?.unit_size ?? '1'}
                              onChange={(e) => setNewProductForm((prev) => ({
                                ...prev,
                                [pass.id]: { ...prev[pass.id] ?? defaultProductForm(), unit_size: e.target.value },
                              }))}
                              className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">Container Unit</label>
                            <select
                              value={newProductForm[pass.id]?.unit_size_unit ?? 'gal'}
                              onChange={(e) => setNewProductForm((prev) => ({
                                ...prev,
                                [pass.id]: { ...prev[pass.id] ?? defaultProductForm(), unit_size_unit: e.target.value },
                              }))}
                              className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            >
                              {RATE_UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                            <p className="text-xs text-slate-400 mt-0.5">Unit the container is sold in</p>
                          </div>
                          {(newProductForm[pass.id]?.rate_unit ?? 'fl oz') === 'lbs' && (
                            <div>
                              <label className="text-xs text-slate-500">Lbs per Gallon</label>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                placeholder="e.g. 10 for Glyphosate"
                                value={newProductForm[pass.id]?.lbs_per_gallon ?? ''}
                                onChange={(e) => setNewProductForm((prev) => ({
                                  ...prev,
                                  [pass.id]: { ...prev[pass.id] ?? defaultProductForm(), lbs_per_gallon: e.target.value },
                                }))}
                                className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                              <p className="text-xs text-slate-400 mt-0.5">Product density for lbs-to-gal conversion</p>
                            </div>
                          )}
                          <div className="col-span-2 flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`rec-${pass.id}`}
                              checked={newProductForm[pass.id]?.is_recommended ?? false}
                              onChange={(e) => setNewProductForm((prev) => ({
                                ...prev,
                                [pass.id]: { ...prev[pass.id] ?? defaultProductForm(), is_recommended: e.target.checked },
                              }))}
                              className="h-3.5 w-3.5 accent-emerald-600"
                            />
                            <label htmlFor={`rec-${pass.id}`} className="text-xs text-slate-600">
                              Mark as recommended (pre-selected for farmers)
                            </label>
                          </div>
                          {/* Label Scenarios Editor */}
                          <div className="col-span-2 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-xs text-slate-500">Label Rate Scenarios</label>
                              <button
                                type="button"
                                onClick={() => setNewProductForm((prev) => ({
                                  ...prev,
                                  [pass.id]: {
                                    ...prev[pass.id] ?? defaultProductForm(),
                                    label_scenarios: [...(prev[pass.id]?.label_scenarios ?? []), { label: '', rate: 0 }],
                                  },
                                }))}
                                className="text-xs text-emerald-600 hover:text-emerald-800 hover:cursor-pointer"
                              >
                                + Add scenario
                              </button>
                            </div>
                            {(newProductForm[pass.id]?.label_scenarios ?? []).length === 0 && (
                              <p className="text-xs text-slate-400 italic">Optional. Add label rate reference rows shown to farmers.</p>
                            )}
                            {(newProductForm[pass.id]?.label_scenarios ?? []).map((scenario, idx) => (
                              <div key={idx} className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  placeholder="Scenario label"
                                  value={scenario.label}
                                  onChange={(e) => {
                                    const updated = [...(newProductForm[pass.id]?.label_scenarios ?? [])];
                                    updated[idx] = { ...updated[idx], label: e.target.value };
                                    setNewProductForm((prev) => ({
                                      ...prev,
                                      [pass.id]: { ...prev[pass.id] ?? defaultProductForm(), label_scenarios: updated },
                                    }));
                                  }}
                                  className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="Rate"
                                  value={scenario.rate}
                                  onChange={(e) => {
                                    const updated = [...(newProductForm[pass.id]?.label_scenarios ?? [])];
                                    updated[idx] = { ...updated[idx], rate: parseFloat(e.target.value) || 0 };
                                    setNewProductForm((prev) => ({
                                      ...prev,
                                      [pass.id]: { ...prev[pass.id] ?? defaultProductForm(), label_scenarios: updated },
                                    }));
                                  }}
                                  className="w-20 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                                <span className="text-xs text-slate-400">{newProductForm[pass.id]?.rate_unit ?? 'fl oz'}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (newProductForm[pass.id]?.label_scenarios ?? []).filter((_, i) => i !== idx);
                                    setNewProductForm((prev) => ({
                                      ...prev,
                                      [pass.id]: { ...prev[pass.id] ?? defaultProductForm(), label_scenarios: updated },
                                    }));
                                  }}
                                  className="text-slate-300 hover:text-red-500 hover:cursor-pointer"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddProduct(pass.id)}
                          disabled={saving}
                          className="w-full"
                        >
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                          Add Product to Pass
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add pass form */}
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Add New Pass</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs text-slate-500">Pass Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Pre-Emerge Herbicide"
                      value={newPassForm[program.id]?.name ?? ''}
                      onChange={(e) => setNewPassForm((prev) => ({
                        ...prev,
                        [program.id]: { ...prev[program.id] ?? defaultPassForm(), name: e.target.value },
                      }))}
                      className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Category *</label>
                    <select
                      value={newPassForm[program.id]?.category ?? 'Herbicides'}
                      onChange={(e) => setNewPassForm((prev) => ({
                        ...prev,
                        [program.id]: { ...prev[program.id] ?? defaultPassForm(), category: e.target.value },
                      }))}
                      className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Timing Label</label>
                    <input
                      type="text"
                      placeholder="e.g. Spring, before planting"
                      value={newPassForm[program.id]?.timing_label ?? ''}
                      onChange={(e) => setNewPassForm((prev) => ({
                        ...prev,
                        [program.id]: { ...prev[program.id] ?? defaultPassForm(), timing_label: e.target.value },
                      }))}
                      className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-slate-500">Description</label>
                    <input
                      type="text"
                      placeholder="Short description shown to farmers"
                      value={newPassForm[program.id]?.description ?? ''}
                      onChange={(e) => setNewPassForm((prev) => ({
                        ...prev,
                        [program.id]: { ...prev[program.id] ?? defaultPassForm(), description: e.target.value },
                      }))}
                      className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`req-${program.id}`}
                      checked={newPassForm[program.id]?.is_required ?? false}
                      onChange={(e) => setNewPassForm((prev) => ({
                        ...prev,
                        [program.id]: { ...prev[program.id] ?? defaultPassForm(), is_required: e.target.checked },
                      }))}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    <label htmlFor={`req-${program.id}`} className="text-sm text-slate-600">
                      Mark as recommended pass
                    </label>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleCreatePass(program.id)}
                  disabled={saving}
                  className="w-full"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add Pass
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* AI Review Modal */}
      {aiModalOpen && aiDraft && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl my-8">
            {/* Modal header */}
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100">
                    <Sparkles className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      AI-Generated Program for {aiDraftCrop.charAt(0).toUpperCase() + aiDraftCrop.slice(1)}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {aiDraft.passes.length} passes · {aiDraft.passes.reduce((sum, p) => sum + p.products.length, 0)} products
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleAIDiscard}
                  disabled={aiApplying}
                  className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 hover:cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {aiDraft.summary && (
                <div className="mt-3 flex gap-2 rounded-lg bg-violet-50 px-4 py-3 text-sm text-violet-800">
                  <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <p>{aiDraft.summary}</p>
                </div>
              )}
            </div>

            {/* Modal body */}
            <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-3">
              {aiDraft.passes.length === 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4" />
                  <p>All passes have been removed. Nothing to apply.</p>
                </div>
              )}

              {aiDraft.passes.map((pass, passIdx) => (
                <div key={passIdx} className="rounded-xl border border-slate-200 overflow-hidden">
                  {/* Pass header */}
                  <div className="flex items-center justify-between bg-slate-50 px-4 py-3">
                    <button
                      onClick={() => setAiExpandedPass(aiExpandedPass === passIdx ? null : passIdx)}
                      className="flex flex-1 items-center gap-2 text-left hover:cursor-pointer"
                    >
                      {aiExpandedPass === passIdx ? (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">{pass.name}</span>
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                            {pass.category}
                          </span>
                          {pass.is_required && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                              Required
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {pass.timing_label} · {pass.products.length} products
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => handleAIRemovePass(passIdx)}
                      disabled={aiApplying}
                      className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors hover:cursor-pointer"
                      title="Remove this pass"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Pass description */}
                  {aiExpandedPass === passIdx && pass.description && (
                    <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 bg-white">
                      {pass.description}
                    </div>
                  )}

                  {/* Pass products */}
                  {aiExpandedPass === passIdx && (
                    <div className="border-t border-slate-100 px-4 py-3 space-y-2 bg-white">
                      {pass.products.map((product, prodIdx) => (
                        <div key={prodIdx} className="rounded-lg border border-slate-200 p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-800">
                                  {product.product_name}
                                </span>
                                {product.is_recommended && (
                                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">
                                    Recommended
                                  </span>
                                )}
                              </div>
                              {/* Rate editing */}
                              <div className="mt-2 grid grid-cols-3 gap-2">
                                <div>
                                  <label className="text-xs text-slate-400">Default Rate</label>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      value={product.default_rate_per_acre}
                                      onChange={(e) => handleAIUpdateRate(passIdx, prodIdx, 'default_rate_per_acre', e.target.value)}
                                      disabled={aiApplying}
                                      className="w-full rounded border border-input bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
                                    />
                                    <span className="text-xs text-slate-400 whitespace-nowrap">{product.rate_unit}/ac</span>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-xs text-slate-400">Min</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={product.min_rate}
                                    onChange={(e) => handleAIUpdateRate(passIdx, prodIdx, 'min_rate', e.target.value)}
                                    disabled={aiApplying}
                                    className="w-full rounded border border-input bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-slate-400">Max</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={product.max_rate}
                                    onChange={(e) => handleAIUpdateRate(passIdx, prodIdx, 'max_rate', e.target.value)}
                                    disabled={aiApplying}
                                    className="w-full rounded border border-input bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
                                  />
                                </div>
                              </div>
                              <p className="mt-1 text-xs text-slate-400">
                                Container: {product.unit_size} {product.unit_size_unit}
                                {product.lbs_per_gallon ? ` · ${product.lbs_per_gallon} lbs/gal` : ''}
                              </p>
                              {/* AI reasoning */}
                              {product.reasoning && (
                                <div className="mt-2 flex gap-1.5 rounded-md bg-violet-50 px-2.5 py-1.5 text-xs text-violet-700">
                                  <Sparkles className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                  <span>{product.reasoning}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 ml-3">
                              <button
                                onClick={() => handleAIToggleRecommended(passIdx, prodIdx)}
                                disabled={aiApplying}
                                className={`rounded p-1.5 transition-colors hover:cursor-pointer ${
                                  product.is_recommended
                                    ? 'text-emerald-600 hover:bg-emerald-50'
                                    : 'text-slate-300 hover:bg-slate-50 hover:text-slate-500'
                                }`}
                                title={product.is_recommended ? 'Remove recommendation' : 'Mark as recommended'}
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleAIRemoveProduct(passIdx, prodIdx)}
                                disabled={aiApplying}
                                className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors hover:cursor-pointer"
                                title="Remove product"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {pass.products.length === 0 && (
                        <p className="text-xs text-slate-400 italic">No products in this pass. Consider removing the pass.</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Modal footer */}
            <div className="border-t border-slate-200 px-6 py-4">
              {aiApplying && aiApplyProgress && (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-violet-50 px-4 py-2 text-sm text-violet-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{aiApplyProgress}</span>
                </div>
              )}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleAIDiscard}
                  disabled={aiApplying}
                  className="flex-1 hover:cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAIApply}
                  disabled={aiApplying || aiDraft.passes.length === 0}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-white hover:cursor-pointer"
                >
                  {aiApplying ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-1.5 h-4 w-4" />
                  )}
                  {aiApplying ? 'Applying...' : 'Apply Program'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function defaultPassForm() {
  return { name: '', timing_label: '', category: 'Herbicides', description: '', is_required: false };
}

function defaultProductForm() {
  return { product_id: '', is_recommended: false, default_rate_per_acre: '1', min_rate: '0.5', max_rate: '4', rate_unit: 'fl oz', unit_size: '1', unit_size_unit: 'gal', lbs_per_gallon: '', label_scenarios: [] as Array<{ label: string; rate: number }> };
}
