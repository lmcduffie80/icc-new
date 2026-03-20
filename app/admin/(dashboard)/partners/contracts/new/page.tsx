'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ContractViewer } from '@/components/contract-viewer';

const DEFAULT_TERMS = `SUPPLY AGREEMENT

This Supply Agreement ("Agreement") is entered into between Innovative CropCare, LLC ("ICC") and the Supplier identified herein ("Supplier"), collectively referred to as the "Parties."

1. SCOPE OF AGREEMENT

Supplier agrees to supply the products listed in the Products and Pricing Schedule below to ICC under the terms and conditions set forth in this Agreement. ICC shall make such products available for resale through its platform and distribution channels.

2. PRICING AND PAYMENT

All product pricing, margin splits, and cost structures are defined in the Products and Pricing Schedule attached to this Agreement. ICC agrees to pay Supplier the agreed-upon supplier cost for each product sold. Payment terms are Net 30 from date of invoice unless otherwise agreed upon in writing.

3. PRODUCT LIABILITY AND PERFORMANCE

Supplier acknowledges and agrees that Innovative CropCare, LLC shall not be held liable for any product supplied under this Agreement, including but not limited to product defects, failures, or underperformance. In the event that any product does not perform as expected in the field, Supplier agrees to, at the sole discretion of Innovative CropCare, LLC, either (a) replace the non-performing product at no additional cost to Innovative CropCare, LLC, or (b) reimburse Innovative CropCare, LLC in full for any such non-performing product. This obligation shall survive the termination or expiration of this Agreement.

4. PRODUCT QUALITY AND COMPLIANCE

Supplier warrants that all products supplied under this Agreement shall conform to their product labels, specifications, and all applicable federal, state, and local laws and regulations. Supplier shall maintain all necessary registrations, licenses, and permits required for the manufacture, sale, and distribution of its products.

5. TERM AND TERMINATION

This Agreement shall be effective as of the Effective Date and shall remain in effect until the Expiry Date, unless terminated earlier by either Party with thirty (30) days written notice. Either Party may terminate this Agreement immediately upon material breach by the other Party.

6. CONFIDENTIALITY

Both Parties agree to keep confidential all proprietary business information, pricing structures, margin details, and customer data shared under this Agreement. This confidentiality obligation shall survive termination of this Agreement for a period of two (2) years.

7. INDEMNIFICATION

Supplier agrees to indemnify and hold harmless ICC, its officers, directors, employees, and agents from and against any and all claims, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or related to Supplier's products, including but not limited to product liability claims, regulatory violations, and intellectual property infringement.

8. GOVERNING LAW

This Agreement shall be governed by and construed in accordance with the laws of the State in which ICC is incorporated, without regard to its conflict of laws provisions.

9. ENTIRE AGREEMENT

This Agreement, including the Products and Pricing Schedule, constitutes the entire agreement between the Parties and supersedes all prior negotiations, representations, or agreements relating to its subject matter.`;

type PartnerType = 'supplier' | 'vendor';

interface Partner {
  id: string;
  email: string;
  name: string;
  company_name: string;
  type: PartnerType;
  address_street?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
}

interface SupplierProduct {
  product_id: string;
  name: string;
  sku: string | null;
  price: string;
  original_price: string | null;
  unit_of_measure: string | null;
  margin_split_percentage: string | null;
  icc_margin_percent: string | null;
}

interface ContractProduct {
  product_id: string;
  name: string;
  sku: string | null;
  supplier_price: string;
  store_price: string;
  margin_split_icc_percent: string;
  margin_split_supplier_percent: string;
  icc_margin_amount: string;
  supplier_margin_amount: string;
  unit_of_measure: string | null;
}

interface ParentContract {
  id: string;
  version: number;
  supplier_id: string;
  contract_type: string;
  content: {
    effective_date: string;
    expiry_date?: string | null;
    terms: string;
    custom_clauses?: string[];
    products: ContractProduct[];
    version_notes?: string | null;
    supplier_name: string;
    supplier_company: string;
  };
}

export default function ContractBuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromContractId = searchParams.get('from');

  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [selectedPartnerType, setSelectedPartnerType] = useState<PartnerType>('supplier');
  const [contractType, setContractType] = useState<string>('Supply Agreement');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDate, setExpiryDate] = useState('');
  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [customClauses, setCustomClauses] = useState<string[]>([]);
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [newClause, setNewClause] = useState('');
  const [products, setProducts] = useState<ContractProduct[]>([]);
  const [versionNotes, setVersionNotes] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingPartners, setLoadingPartners] = useState(true);

  // Parent contract state for "new version" mode
  const [parentContract, setParentContract] = useState<ParentContract | null>(null);
  const [partnerLocked, setPartnerLocked] = useState(false);

  // Fetch both suppliers and vendors
  useEffect(() => {
    async function fetchPartners() {
      try {
        const [suppliersRes, vendorsRes] = await Promise.all([
          fetch('/api/admin/suppliers'),
          fetch('/api/admin/vendors'),
        ]);

        const suppliersData = await suppliersRes.json();
        const vendorsData = await vendorsRes.json();

        const supplierList: Partner[] = (Array.isArray(suppliersData) ? suppliersData : []).map(
          (s: { id: string; email: string; name: string; company_name: string; address_street?: string | null; address_city?: string | null; address_state?: string | null; address_zip?: string | null }) => ({
            id: s.id,
            email: s.email || '',
            name: s.name,
            company_name: s.company_name,
            type: 'supplier' as PartnerType,
            address_street: s.address_street || null,
            address_city: s.address_city || null,
            address_state: s.address_state || null,
            address_zip: s.address_zip || null,
          })
        );

        const vendorList: Partner[] = (Array.isArray(vendorsData) ? vendorsData : []).map(
          (v: { id: number; name: string }) => ({
            id: String(v.id),
            email: '',
            name: v.name,
            company_name: v.name,
            type: 'vendor' as PartnerType,
          })
        );

        setPartners([...supplierList, ...vendorList]);
      } catch (error) {
        console.error('Failed to fetch partners:', error);
      } finally {
        setLoadingPartners(false);
      }
    }
    fetchPartners();
  }, []);

  // Fetch the active Supply Agreement template to pre-populate terms (only for new contracts, not "new version" mode)
  useEffect(() => {
    if (fromContractId || templateLoaded) return;

    async function fetchTemplate() {
      try {
        const res = await fetch('/api/admin/supply-agreement');
        if (res.ok) {
          const data = await res.json();
          if (data.activeTemplate?.content) {
            setTerms(data.activeTemplate.content);
          }
        }
      } catch {
        // Fall back to hardcoded DEFAULT_TERMS already set as initial state
      } finally {
        setTemplateLoaded(true);
      }
    }
    fetchTemplate();
  }, [fromContractId, templateLoaded]);

  // If "from" query param is present, load the parent contract for "new version" mode
  useEffect(() => {
    if (!fromContractId) return;

    async function loadParentContract() {
      try {
        const res = await fetch(`/api/admin/contracts/${fromContractId}`);
        const data = await res.json();
        if (data.contract && data.contract.content) {
          const c = data.contract;
          setParentContract(c);
          setSelectedPartnerId(c.supplier_id);
          setSelectedPartnerType(c.content?.partner_type || c.partner_type || 'supplier');
          setPartnerLocked(true);
          setContractType(c.contract_type);
          setEffectiveDate(new Date().toISOString().split('T')[0]);
          setExpiryDate(c.content.expiry_date || '');
          setTerms(c.content.terms || DEFAULT_TERMS);
          setCustomClauses(c.content.custom_clauses || []);
          setProducts(c.content.products || []);
        }
      } catch (error) {
        console.error('Failed to load parent contract:', error);
      }
    }
    loadParentContract();
  }, [fromContractId]);

  // Compute contract products from supplier products.
  // icc_margin_percent must be explicitly set on the product — no silent default.
  // Products with a null margin are flagged with icc_margin_percent = '' so the UI can warn.
  const computeContractProducts = useCallback((supplierProducts: SupplierProduct[]): ContractProduct[] => {
    return supplierProducts.map((p) => {
      const storePrice = parseFloat(p.price) || 0;
      const supplierPrice = parseFloat(p.original_price || p.price) || 0;
      const margin = storePrice - supplierPrice;

      // Use icc_margin_percent first, fall back to margin_split_percentage, but never silently default to 50
      const rawPercent = p.icc_margin_percent ?? p.margin_split_percentage;
      const iccPercent = rawPercent !== null ? parseFloat(rawPercent) : null;
      const supplierPercent = iccPercent !== null ? 100 - iccPercent : null;
      const iccAmount = iccPercent !== null && margin > 0 ? (margin * iccPercent / 100) : 0;
      const supplierAmount = supplierPercent !== null && margin > 0 ? (margin * supplierPercent / 100) : 0;

      return {
        product_id: p.product_id,
        name: p.name,
        sku: p.sku,
        supplier_price: supplierPrice.toFixed(2),
        store_price: storePrice.toFixed(2),
        // Empty string signals "margin not set" — the UI will show a warning
        margin_split_icc_percent: iccPercent !== null ? iccPercent.toFixed(0) : '',
        margin_split_supplier_percent: supplierPercent !== null ? supplierPercent.toFixed(0) : '',
        icc_margin_amount: iccAmount.toFixed(2),
        supplier_margin_amount: supplierAmount.toFixed(2),
        unit_of_measure: p.unit_of_measure,
      };
    });
  }, []);

  // Fetch products when supplier changes (only for suppliers in new contract mode, not version mode)
  useEffect(() => {
    if (!selectedPartnerId || (fromContractId && parentContract)) return;

    // Only auto-fetch products for suppliers; vendors use manual entry
    if (selectedPartnerType === 'vendor') {
      setProducts([]);
      return;
    }

    async function fetchProducts() {
      setLoadingProducts(true);
      try {
        const res = await fetch(`/api/admin/suppliers/${selectedPartnerId}/products`);
        const data = await res.json();
        const supplierProducts: SupplierProduct[] = data.products || [];
        setProducts(computeContractProducts(supplierProducts));
      } catch (error) {
        console.error('Failed to fetch products:', error);
      } finally {
        setLoadingProducts(false);
      }
    }
    fetchProducts();
  }, [selectedPartnerId, selectedPartnerType, fromContractId, parentContract, computeContractProducts]);

  // Manual product entry helpers (for vendor contracts)
  const addManualProduct = () => {
    const newProduct: ContractProduct = {
      product_id: `manual-${Date.now()}`,
      name: '',
      sku: null,
      supplier_price: '0.00',
      store_price: '0.00',
      margin_split_icc_percent: '50',
      margin_split_supplier_percent: '50',
      icc_margin_amount: '0.00',
      supplier_margin_amount: '0.00',
      unit_of_measure: null,
    };
    setProducts([...products, newProduct]);
  };

  const removeManualProduct = (index: number) => {
    setProducts(products.filter((_, i) => i !== index));
  };

  const updateManualProduct = (index: number, field: string, value: string) => {
    setProducts((prev) => {
      const updated = [...prev];
      const product = { ...updated[index] };

      if (field === 'name') product.name = value;
      else if (field === 'sku') product.sku = value || null;
      else if (field === 'unit_of_measure') product.unit_of_measure = value || null;
      else if (field === 'supplier_price') product.supplier_price = value;
      else if (field === 'store_price') product.store_price = value;
      else if (field === 'margin_split_icc_percent') product.margin_split_icc_percent = value;

      // Recalculate derived fields
      const supplierCost = parseFloat(product.supplier_price) || 0;
      const storePrice = parseFloat(product.store_price) || 0;
      const iccPct = parseFloat(product.margin_split_icc_percent) || 0;
      const supplierPct = 100 - iccPct;
      const margin = storePrice - supplierCost;
      product.margin_split_supplier_percent = supplierPct.toFixed(0);
      product.icc_margin_amount = (margin > 0 ? margin * iccPct / 100 : 0).toFixed(2);
      product.supplier_margin_amount = (margin > 0 ? margin * supplierPct / 100 : 0).toFixed(2);

      updated[index] = product;
      return updated;
    });
  };

  const addClause = () => {
    if (newClause.trim()) {
      setCustomClauses([...customClauses, newClause.trim()]);
      setNewClause('');
    }
  };

  const removeClause = (index: number) => {
    setCustomClauses(customClauses.filter((_, i) => i !== index));
  };

  const handleSave = async (status: 'draft' | 'pending_supplier_signature') => {
    if (!selectedPartnerId) {
      alert('Please select a partner (supplier or vendor)');
      return;
    }
    if (products.length === 0) {
      alert('At least one product is required. Please add products before creating the contract.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        supplierId: selectedPartnerId,
        partnerType: selectedPartnerType,
        contractType,
        effectiveDate,
        expiryDate: expiryDate || null,
        terms,
        customClauses: customClauses.length > 0 ? customClauses : undefined,
        products,
        parentContractId: parentContract?.id || null,
        versionNotes: versionNotes || null,
        status,
        supplierAddressStreet: selectedPartner?.address_street || null,
        supplierAddressCity: selectedPartner?.address_city || null,
        supplierAddressState: selectedPartner?.address_state || null,
        supplierAddressZip: selectedPartner?.address_zip || null,
      };

      const res = await fetch('/api/admin/contracts/builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const responseData = await res.json();

        // Auto-email partner when sending for signature (only if they have an email)
        if (status === 'pending_supplier_signature' && responseData.contract?.id && selectedPartner?.email) {
          try {
            await fetch(`/api/admin/contracts/${responseData.contract.id}/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipientEmail: selectedPartner.email,
                recipientName: selectedPartner.name,
                message: 'A contract has been prepared and is ready for your review and signature. Please log in to the supplier portal to review it.',
                ccAdmin: true,
              }),
            });
          } catch (emailError) {
            console.error('Failed to auto-email partner (contract still saved):', emailError);
          }
        }

        alert(`Contract ${status === 'draft' ? 'saved as draft' : 'sent for signature'} successfully!`);
        router.push('/admin/partners/contracts');
      } else {
        const errorData = await res.json();
        alert(`Failed to save contract: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error saving contract:', error);
      alert('Failed to save contract');
    } finally {
      setSaving(false);
    }
  };

  const selectedPartner = partners.find((p) => p.id === selectedPartnerId && p.type === selectedPartnerType);

  // Derived values
  const supplierPartners = partners.filter((p) => p.type === 'supplier');
  const vendorPartners = partners.filter((p) => p.type === 'vendor');

  // Build preview content
  const previewContent = {
    template: 'supply_agreement',
    effective_date: effectiveDate,
    expiry_date: expiryDate || null,
    supplier_name: selectedPartner?.name || parentContract?.content?.supplier_name || '',
    supplier_company: selectedPartner?.company_name || parentContract?.content?.supplier_company || '',
    supplier_address_street: selectedPartner?.address_street || null,
    supplier_address_city: selectedPartner?.address_city || null,
    supplier_address_state: selectedPartner?.address_state || null,
    supplier_address_zip: selectedPartner?.address_zip || null,
    partner_type: selectedPartnerType,
    terms,
    custom_clauses: customClauses,
    products,
    version_notes: versionNotes || null,
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {parentContract ? 'Create New Version' : 'Create Contract'}
          </h1>
          {parentContract && (
            <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-1.5 mt-2">
              Creating version {parentContract.version + 1} based on version {parentContract.version}
            </p>
          )}
        </div>
        <Button
          onClick={() => router.push('/admin/partners/contracts')}
          className="bg-gray-200 text-gray-700 hover:bg-gray-300"
        >
          Cancel
        </Button>
      </div>

      {showPreview ? (
        /* Preview Mode */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Contract Preview</h2>
            <Button
              onClick={() => setShowPreview(false)}
              className="bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              Back to Edit
            </Button>
          </div>
          <ContractViewer
            content={previewContent}
            version={parentContract ? parentContract.version + 1 : 1}
            status="draft"
            adminSignedAt={null}
            supplierSignedAt={null}
          />
          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={() => handleSave('draft')}
              disabled={saving}
              className="bg-gray-600 hover:bg-gray-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save as Draft'}
            </Button>
            <Button
              onClick={() => handleSave('pending_supplier_signature')}
              disabled={saving}
              className="bg-green-700 hover:bg-green-800 disabled:opacity-50"
            >
              {saving ? 'Sending...' : 'Save & Send for Signature'}
            </Button>
          </div>
        </div>
      ) : (
        /* Edit Mode */
        <div className="space-y-6">
          {/* Section 1: Parties */}
          <div className="bg-white border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold border-b pb-2">Contract Parties</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="block text-sm font-medium text-gray-500 mb-1">Party A</p>
                <p className="text-lg font-semibold">Innovative CropCare, LLC</p>
              </div>
              <div>
                <label htmlFor="partner-select" className="block text-sm font-medium text-gray-500 mb-1">
                  Party B (Supplier / Vendor)
                </label>
                {partnerLocked ? (
                  <p className="text-lg font-semibold">
                    {selectedPartner?.company_name || parentContract?.content?.supplier_company}
                  </p>
                ) : (
                  <select
                    id="partner-select"
                    className="w-full border rounded px-3 py-2"
                    value={`${selectedPartnerType}:${selectedPartnerId}`}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setSelectedPartnerId('');
                        setSelectedPartnerType('supplier');
                        return;
                      }
                      const [type, ...idParts] = val.split(':');
                      setSelectedPartnerType(type as PartnerType);
                      setSelectedPartnerId(idParts.join(':'));
                    }}
                    disabled={loadingPartners}
                  >
                    <option value="">Select a partner...</option>
                    {supplierPartners.length > 0 && (
                      <optgroup label="Suppliers">
                        {supplierPartners.map((s) => (
                          <option key={`supplier:${s.id}`} value={`supplier:${s.id}`}>
                            {s.company_name} ({s.name})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {vendorPartners.length > 0 && (
                      <optgroup label="Vendors">
                        {vendorPartners.map((v) => (
                          <option key={`vendor:${v.id}`} value={`vendor:${v.id}`}>
                            {v.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Contract Details */}
          <div className="bg-white border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold border-b pb-2">Contract Details</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="contract-type" className="block text-sm font-medium text-gray-700 mb-1">
                  Contract Type
                </label>
                <select
                  id="contract-type"
                  className="w-full border rounded px-3 py-2"
                  value={contractType}
                  onChange={(e) => setContractType(e.target.value)}
                >
                  <option value="Supply Agreement">Supply Agreement</option>
                  <option value="NDA">NDA</option>
                </select>
              </div>
              <div>
                <label htmlFor="effective-date" className="block text-sm font-medium text-gray-700 mb-1">
                  Effective Date
                </label>
                <input
                  id="effective-date"
                  type="date"
                  className="w-full border rounded px-3 py-2"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="expiry-date" className="block text-sm font-medium text-gray-700 mb-1">
                  Expiry Date (optional)
                </label>
                <input
                  id="expiry-date"
                  type="date"
                  className="w-full border rounded px-3 py-2"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Terms */}
          <div className="bg-white border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold border-b pb-2">Terms and Conditions</h2>
            <textarea
              className="w-full border rounded px-3 py-2 min-h-[400px] text-sm font-mono leading-relaxed"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Enter contract terms..."
            />
          </div>

          {/* Section 4: Product Pricing Table */}
          <div className="bg-white border rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="text-lg font-semibold">Products and Pricing Schedule</h2>
              {selectedPartnerType === 'vendor' && selectedPartnerId && (
                <Button
                  type="button"
                  onClick={addManualProduct}
                  className="bg-green-700 hover:bg-green-800 text-white text-sm hover:cursor-pointer"
                >
                  + Add Product
                </Button>
              )}
            </div>
            {products.some(p => p.margin_split_icc_percent === '') && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <strong>Warning:</strong> One or more products below have no margin split set. Go to the product&apos;s margin approval page to set the ICC % before saving this contract.
              </div>
            )}
            {!selectedPartnerId ? (
              <p className="text-gray-500 text-sm italic">Select a partner to load or add products.</p>
            ) : loadingProducts ? (
              <p className="text-gray-500 text-sm">Loading products...</p>
            ) : products.length === 0 ? (
              <p className="text-gray-500 text-sm italic">
                {selectedPartnerType === 'vendor'
                  ? 'No products added yet. Click "+ Add Product" to add products manually.'
                  : 'No active products found for this supplier.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Product</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">SKU</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Supplier Cost</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Store Price</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">ICC %</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Supplier %</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">ICC Gets</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Supplier Gets</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Unit</th>
                      {selectedPartnerType === 'vendor' && (
                        <th className="px-3 py-2 text-center font-medium text-gray-600">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product, i) => (
                      <tr key={product.product_id || i} className={`border-b last:border-0 ${product.margin_split_icc_percent === '' ? 'bg-amber-50' : ''}`}>
                        {selectedPartnerType === 'vendor' ? (
                          <>
                            <td className="px-2 py-1">
                              <input
                                type="text"
                                className="w-full border rounded px-2 py-1 text-sm"
                                value={product.name}
                                onChange={(e) => updateManualProduct(i, 'name', e.target.value)}
                                placeholder="Product name"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="text"
                                className="w-24 border rounded px-2 py-1 text-sm"
                                value={product.sku || ''}
                                onChange={(e) => updateManualProduct(i, 'sku', e.target.value)}
                                placeholder="SKU"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="w-24 border rounded px-2 py-1 text-sm text-right"
                                value={product.supplier_price}
                                onChange={(e) => updateManualProduct(i, 'supplier_price', e.target.value)}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="w-24 border rounded px-2 py-1 text-sm text-right"
                                value={product.store_price}
                                onChange={(e) => updateManualProduct(i, 'store_price', e.target.value)}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="number"
                                step="1"
                                min="0"
                                max="100"
                                className="w-16 border rounded px-2 py-1 text-sm text-right"
                                value={product.margin_split_icc_percent}
                                onChange={(e) => updateManualProduct(i, 'margin_split_icc_percent', e.target.value)}
                              />
                            </td>
                            <td className="px-3 py-2 text-right">{product.margin_split_supplier_percent}%</td>
                            <td className="px-3 py-2 text-right text-green-700">${product.icc_margin_amount}</td>
                            <td className="px-3 py-2 text-right text-green-700">${product.supplier_margin_amount}</td>
                            <td className="px-2 py-1">
                              <input
                                type="text"
                                className="w-20 border rounded px-2 py-1 text-sm"
                                value={product.unit_of_measure || ''}
                                onChange={(e) => updateManualProduct(i, 'unit_of_measure', e.target.value)}
                                placeholder="e.g. gal"
                              />
                            </td>
                            <td className="px-2 py-1 text-center">
                              <button
                                type="button"
                                onClick={() => removeManualProduct(i)}
                                className="text-red-500 hover:text-red-700 text-sm hover:cursor-pointer"
                              >
                                Remove
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 font-medium">{product.name}</td>
                            <td className="px-3 py-2 text-gray-600">{product.sku || '-'}</td>
                            <td className="px-3 py-2 text-right">${product.supplier_price}</td>
                            <td className="px-3 py-2 text-right">${product.store_price}</td>
                            <td className="px-3 py-2 text-right">
                              {product.margin_split_icc_percent === ''
                                ? <span className="text-amber-600 font-medium">Not set</span>
                                : `${product.margin_split_icc_percent}%`}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {product.margin_split_supplier_percent === ''
                                ? <span className="text-amber-600 font-medium">Not set</span>
                                : `${product.margin_split_supplier_percent}%`}
                            </td>
                            <td className="px-3 py-2 text-right text-green-700">${product.icc_margin_amount}</td>
                            <td className="px-3 py-2 text-right text-green-700">${product.supplier_margin_amount}</td>
                            <td className="px-3 py-2 text-gray-600">{product.unit_of_measure || '-'}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 5: Custom Clauses */}
          <div className="bg-white border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold border-b pb-2">Additional Clauses (Optional)</h2>
            {customClauses.length > 0 && (
              <div className="space-y-2">
                {customClauses.map((clause, i) => (
                  <div key={i} className="flex items-start gap-2 bg-gray-50 border rounded p-3">
                    <span className="text-sm flex-1">{clause}</span>
                    <button
                      onClick={() => removeClause(i)}
                      className="text-red-500 hover:text-red-700 text-sm hover:cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 border rounded px-3 py-2 text-sm"
                value={newClause}
                onChange={(e) => setNewClause(e.target.value)}
                placeholder="Add an additional clause..."
                onKeyDown={(e) => e.key === 'Enter' && addClause()}
              />
              <Button onClick={addClause} className="bg-gray-600 hover:bg-gray-700">
                Add
              </Button>
            </div>
          </div>

          {/* Section 6: Version Notes (only for new versions) */}
          {parentContract && (
            <div className="bg-white border rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold border-b pb-2">Version Notes</h2>
              <textarea
                className="w-full border rounded px-3 py-2 min-h-[80px] text-sm"
                value={versionNotes}
                onChange={(e) => setVersionNotes(e.target.value)}
                placeholder="Describe what changed in this version..."
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={() => setShowPreview(true)}
              disabled={!selectedPartnerId || products.length === 0}
              className="bg-green-700 hover:bg-green-800 disabled:opacity-50 hover:cursor-pointer"
            >
              Preview Contract
            </Button>
            <Button
              onClick={() => handleSave('draft')}
              disabled={saving || !selectedPartnerId || products.length === 0}
              className="bg-gray-600 hover:bg-gray-700 disabled:opacity-50 hover:cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save as Draft'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
