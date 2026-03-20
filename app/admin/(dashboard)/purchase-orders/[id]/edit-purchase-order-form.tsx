'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Loader2, Plus, Trash2, Calendar, MapPin } from 'lucide-react';

interface Vendor {
  id: number;
  vendor_number: string;
  name: string;
  default_payment_terms: string | null;
  tax_exempt: boolean;
  address_id: number | null;
  address?: {
    id: number;
    address1: string;
    address2: string | null;
    city: string;
    state: string;
    zip_code: string;
    country: string;
  } | null;
}

interface Address {
  id: number;
  type: string;
  company_name: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  is_default: boolean;
}

interface LineItem {
  line_number: number;
  item_number: string;
  description: string;
  need_by_date: string;
  quantity: number;
  uom: string;
  unit_price: number;
  taxable: boolean;
}

interface PurchaseOrder {
  id: number;
  po_number: string;
  vendor_id: number;
  order_date: string;
  buyer_name: string;
  payment_terms: string;
  ship_to_address_id: number;
  bill_to_address_id: number;
  tax_rate: number;
  status: string;
  notes: string | null;
  vendor_name: string;
  lines: Array<{
    id: number;
    line_number: number;
    item_number: string;
    description: string;
    need_by_date: string | null;
    quantity: number;
    uom: string;
    unit_price: number;
    taxable: boolean;
  }>;
  ship_to_address: Address;
  bill_to_address: Address;
}

interface EditPurchaseOrderFormProps {
  purchaseOrder: PurchaseOrder;
}

export function EditPurchaseOrderForm({ purchaseOrder }: EditPurchaseOrderFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state - initialized from purchase order
  const [vendorId, setVendorId] = useState<string>(purchaseOrder.vendor_id.toString());
  const [orderDate, setOrderDate] = useState(purchaseOrder.order_date);
  const [buyerName, setBuyerName] = useState(purchaseOrder.buyer_name);
  const [paymentTerms, setPaymentTerms] = useState(purchaseOrder.payment_terms);
  const [shipToAddressId, setShipToAddressId] = useState<string>(purchaseOrder.ship_to_address_id.toString());
  const [useManualShipTo, setUseManualShipTo] = useState(false);
  const [shipToAddress1, setShipToAddress1] = useState('');
  const [shipToAddress2, setShipToAddress2] = useState('');
  const [shipToCity, setShipToCity] = useState('');
  const [shipToState, setShipToState] = useState('');
  const [shipToZipCode, setShipToZipCode] = useState('');
  const [shipToCountry, setShipToCountry] = useState('United States');
  const [shipToCompanyName, setShipToCompanyName] = useState('');
  const [billToAddressId, setBillToAddressId] = useState<string>(purchaseOrder.bill_to_address_id.toString());
  const [taxRate, setTaxRate] = useState(purchaseOrder.tax_rate);
  const [status, setStatus] = useState(purchaseOrder.status);
  const [notes, setNotes] = useState(purchaseOrder.notes || '');
  const [lines, setLines] = useState<LineItem[]>(
    purchaseOrder.lines.map(line => ({
      line_number: line.line_number,
      item_number: line.item_number,
      description: line.description,
      need_by_date: line.need_by_date || '',
      quantity: line.quantity,
      uom: line.uom,
      unit_price: line.unit_price,
      taxable: line.taxable,
    }))
  );

  // Fetch vendors and addresses
  useEffect(() => {
    async function fetchData() {
      try {
        const [vendorsRes, addressesRes] = await Promise.all([
          fetch('/api/admin/vendors'),
          fetch('/api/admin/addresses'),
        ]);

        if (vendorsRes.ok) {
          const vendorsData = await vendorsRes.json();
          setVendors(vendorsData);
        }

        if (addressesRes.ok) {
          const addressesData = await addressesRes.json();
          setAddresses(addressesData);
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError('Failed to load form data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Update payment terms and fetch vendor address when vendor changes
  useEffect(() => {
    // Clear ship-to address if it was a vendor address from a different vendor
    if (shipToAddressId.startsWith('vendor-')) {
      const vendorIdFromAddress = shipToAddressId.replace('vendor-', '');
      if (vendorId && vendorId !== vendorIdFromAddress) {
        setShipToAddressId('');
      }
    }

    if (vendorId) {
      const vendor = vendors.find(v => v.id.toString() === vendorId);
      if (vendor?.default_payment_terms) {
        setPaymentTerms(vendor.default_payment_terms);
      }
      
      // Set tax rate to 0 if vendor is tax exempt
      if (vendor?.tax_exempt) {
        setTaxRate(0);
      }
      
      // Fetch vendor details including address if not already loaded
      if (vendor && vendor.address_id && !vendor.address) {
        fetch(`/api/admin/vendors/${vendorId}`)
          .then(res => res.json())
          .then(data => {
            if (data.address) {
              // Update vendor in vendors array with address
              setVendors(prevVendors =>
                prevVendors.map(v =>
                  v.id.toString() === vendorId
                    ? { ...v, address: data.address }
                    : v
                )
              );
            }
          })
          .catch(err => console.error('Failed to fetch vendor address:', err));
      }
    }
  }, [vendorId, vendors, shipToAddressId]);

  const addLine = () => {
    setLines([
      ...lines,
      {
        line_number: lines.length + 1,
        item_number: '',
        description: '',
        need_by_date: '',
        quantity: 1,
        uom: 'each',
        unit_price: 0,
        taxable: false,
      },
    ]);
  };

  const removeLine = (index: number) => {
    const newLines = lines.filter((_, i) => i !== index);
    // Renumber lines
    newLines.forEach((line, i) => {
      line.line_number = i + 1;
    });
    setLines(newLines);
  };

  const updateLine = (index: number, field: keyof LineItem, value: unknown) => {
    const newLines = [...lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setLines(newLines);
  };

  const validateForm = (): string | null => {
    if (!vendorId) return 'Vendor is required';
    if (!orderDate) return 'Order date is required';
    if (!buyerName.trim()) return 'Buyer name is required';
    if (!useManualShipTo && !shipToAddressId) return 'Ship-to address is required';
    if (useManualShipTo) {
      if (!shipToAddress1.trim()) return 'Ship-to address line 1 is required';
      if (!shipToCity.trim()) return 'Ship-to city is required';
      if (!shipToState.trim()) return 'Ship-to state is required';
      if (!shipToZipCode.trim()) return 'Ship-to ZIP code is required';
      if (!shipToCompanyName.trim()) return 'Ship-to company name is required';
    }
    if (!billToAddressId) return 'Bill-to address is required';
    if (lines.length === 0) return 'At least one line item is required';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.item_number.trim()) return `Line ${i + 1}: Item number is required`;
      if (!line.description.trim()) return `Line ${i + 1}: Description is required`;
      if (line.quantity <= 0) return `Line ${i + 1}: Quantity must be greater than 0`;
      if (line.unit_price < 0) return `Line ${i + 1}: Unit price cannot be negative`;
      if (!line.uom.trim()) return `Line ${i + 1}: Unit of measure is required`;
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    try {
      const requestBody: {
        vendor_id: number;
        order_date: string;
        buyer_name: string;
        payment_terms: string;
        bill_to_address_id: number;
        tax_rate: number;
        status: string;
        notes: string | null;
        lines: Array<{
          item_number: string;
          description: string;
          quantity: number;
          unit_price: number;
          taxable: boolean;
          need_by_date: string | null;
        }>;
        ship_to_address?: {
          company_name: string;
          address1: string;
          address2: string | null;
          city: string;
          state: string;
          zip_code: string;
          country: string;
        };
        ship_to_address_id?: number;
      } = {
        vendor_id: parseInt(vendorId, 10),
        order_date: orderDate,
        buyer_name: buyerName.trim(),
        payment_terms: paymentTerms,
        bill_to_address_id: parseInt(billToAddressId, 10),
        tax_rate: taxRate,
        status,
        notes: notes.trim() || null,
        lines: lines.map(line => ({
          ...line,
          need_by_date: line.need_by_date || null,
        })),
      };

      // Handle ship-to address - either use existing, vendor address, or create new
      if (useManualShipTo) {
        requestBody.ship_to_address = {
          company_name: shipToCompanyName.trim(),
          address1: shipToAddress1.trim(),
          address2: shipToAddress2.trim() || null,
          city: shipToCity.trim(),
          state: shipToState.trim(),
          zip_code: shipToZipCode.trim(),
          country: shipToCountry.trim() || 'United States',
        };
      } else if (shipToAddressId.startsWith('vendor-')) {
        // Vendor address selected - use vendor's address
        const vendorIdFromAddress = shipToAddressId.replace('vendor-', '');
        const vendor = vendors.find(v => v.id.toString() === vendorIdFromAddress);
        if (vendor?.address) {
          requestBody.ship_to_address = {
            company_name: vendor.name,
            address1: vendor.address.address1,
            address2: vendor.address.address2 || null,
            city: vendor.address.city,
            state: vendor.address.state,
            zip_code: vendor.address.zip_code,
            country: vendor.address.country || 'United States',
          };
        } else {
          throw new Error('Vendor address not found');
        }
      } else {
        requestBody.ship_to_address_id = parseInt(shipToAddressId, 10);
      }

      // Clean the ID in case it has any unexpected characters (e.g., from source maps)
      const cleanId = purchaseOrder.id.toString().split(':')[0].trim();
      const response = await fetch(`/api/admin/purchase-orders/${cleanId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update purchase order');
      }

      router.push('/admin/purchase-orders');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update purchase order');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const selectedVendor = vendors.find(v => v.id.toString() === vendorId);
  const subtotal = lines.reduce((sum, line) => sum + (line.quantity * line.unit_price), 0);
  const taxableSubtotal = lines
    .filter(line => line.taxable)
    .reduce((sum, line) => sum + (line.quantity * line.unit_price), 0);
  const taxAmount = taxableSubtotal * taxRate;
  const total = subtotal + taxAmount;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Header Information */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Purchase Order Details</h2>
        
        <div className="grid gap-4 md:grid-cols-2">
          {/* Vendor */}
          <div>
            <label htmlFor="vendor" className="block text-sm font-medium text-slate-700 mb-1">
              Vendor <span className="text-red-500">*</span>
            </label>
            <select
              id="vendor"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              required
            >
              <option value="">Select vendor...</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.vendor_number} - {vendor.name}
                </option>
              ))}
            </select>
          </div>

          {/* Order Date */}
          <div>
            <label htmlFor="orderDate" className="block text-sm font-medium text-slate-700 mb-1">
              Order Date <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                id="orderDate"
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                required
              />
            </div>
          </div>

          {/* Buyer Name */}
          <div>
            <label htmlFor="buyerName" className="block text-sm font-medium text-slate-700 mb-1">
              Buyer Name <span className="text-red-500">*</span>
            </label>
            <input
              id="buyerName"
              type="text"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              placeholder="Enter buyer name"
              required
            />
          </div>

          {/* Payment Terms */}
          <div>
            <label htmlFor="paymentTerms" className="block text-sm font-medium text-slate-700 mb-1">
              Payment Terms <span className="text-red-500">*</span>
            </label>
            <select
              id="paymentTerms"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              required
            >
              <option value="DUE_UPON_RECEIPT">Due Upon Receipt</option>
              <option value="NET_30">Net 30</option>
              <option value="NET_60">Net 60</option>
              <option value="NET_90">Net 90</option>
              <option value="NET_180">Net 180</option>
            </select>
          </div>

          {/* Ship-to Address */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="shipTo" className="block text-sm font-medium text-slate-700">
                Ship-to Address <span className="text-red-500">*</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useManualShipTo}
                  onChange={(e) => {
                    setUseManualShipTo(e.target.checked);
                    if (!e.target.checked) {
                      // Clear manual fields when switching back to select
                      setShipToAddress1('');
                      setShipToAddress2('');
                      setShipToCity('');
                      setShipToState('');
                      setShipToZipCode('');
                      setShipToCountry('United States');
                      setShipToCompanyName('');
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs text-slate-600">Enter manually</span>
              </label>
            </div>
            {useManualShipTo ? (
              <div className="space-y-3 rounded-lg border border-slate-300 bg-white p-4">
                <div>
                  <label htmlFor="shipToCompany" className="block text-xs font-medium text-slate-600 mb-1">
                    Company Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="shipToCompany"
                    type="text"
                    value={shipToCompanyName}
                    onChange={(e) => setShipToCompanyName(e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                    placeholder="Company name"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="shipToAddress1" className="block text-xs font-medium text-slate-600 mb-1">
                    Address Line 1 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="shipToAddress1"
                      type="text"
                      value={shipToAddress1}
                      onChange={(e) => setShipToAddress1(e.target.value)}
                      className="w-full rounded border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                      placeholder="Street address"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="shipToAddress2" className="block text-xs font-medium text-slate-600 mb-1">
                    Address Line 2
                  </label>
                  <input
                    id="shipToAddress2"
                    type="text"
                    value={shipToAddress2}
                    onChange={(e) => setShipToAddress2(e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                    placeholder="Apartment, suite, etc. (optional)"
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label htmlFor="shipToCity" className="block text-xs font-medium text-slate-600 mb-1">
                      City <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="shipToCity"
                      type="text"
                      value={shipToCity}
                      onChange={(e) => setShipToCity(e.target.value)}
                      className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                      placeholder="City"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="shipToState" className="block text-xs font-medium text-slate-600 mb-1">
                      State <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="shipToState"
                      type="text"
                      value={shipToState}
                      onChange={(e) => setShipToState(e.target.value.toUpperCase())}
                      maxLength={2}
                      className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 uppercase focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                      placeholder="GA"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="shipToZipCode" className="block text-xs font-medium text-slate-600 mb-1">
                      ZIP Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="shipToZipCode"
                      type="text"
                      value={shipToZipCode}
                      onChange={(e) => setShipToZipCode(e.target.value)}
                      className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                      placeholder="31794"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="shipToCountry" className="block text-xs font-medium text-slate-600 mb-1">
                    Country
                  </label>
                  <input
                    id="shipToCountry"
                    type="text"
                    value={shipToCountry}
                    onChange={(e) => setShipToCountry(e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                    placeholder="United States"
                  />
                </div>
              </div>
            ) : (
              <select
                id="shipTo"
                value={shipToAddressId}
                onChange={(e) => setShipToAddressId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                required={!useManualShipTo}
              >
                <option value="">Select ship-to address...</option>
                {/* Vendor address option if available */}
                {selectedVendor?.address && (
                  <option value={`vendor-${selectedVendor.id}`}>
                    {selectedVendor.name} - {selectedVendor.address.city}, {selectedVendor.address.state} (Vendor Address)
                  </option>
                )}
                {/* Regular SHIP_TO addresses */}
                {addresses.filter(a => a.type === 'SHIP_TO').map((address) => (
                  <option key={address.id} value={address.id}>
                    {address.company_name} - {address.city}, {address.state}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Bill-to Address */}
          <div>
            <label htmlFor="billTo" className="block text-sm font-medium text-slate-700 mb-1">
              Bill-to Address <span className="text-red-500">*</span>
            </label>
            <select
              id="billTo"
              value={billToAddressId}
              onChange={(e) => setBillToAddressId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              required
            >
              <option value="">Select bill-to address...</option>
              {addresses.filter(a => a.type === 'BILL_TO').map((address) => (
                <option key={address.id} value={address.id}>
                  {address.company_name} - {address.city}, {address.state}
                </option>
              ))}
            </select>
            {/* Display selected bill-to address */}
            {billToAddressId && (() => {
              const selectedBillTo = addresses.find(a => a.id.toString() === billToAddressId);
              return selectedBillTo ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h4 className="mb-2 text-sm font-semibold text-slate-700">Bill-to Address:</h4>
                  <div className="space-y-1 text-sm text-slate-600">
                    <p className="font-medium text-slate-900">{selectedBillTo.company_name}</p>
                    <p>{selectedBillTo.address1}</p>
                    {selectedBillTo.address2 && <p>{selectedBillTo.address2}</p>}
                    <p>{selectedBillTo.city}, {selectedBillTo.state} {selectedBillTo.zip_code}</p>
                    {selectedBillTo.country && selectedBillTo.country !== 'United States' && (
                      <p>{selectedBillTo.country}</p>
                    )}
                  </div>
                </div>
              ) : null;
            })()}
          </div>

          {/* Tax Rate */}
          <div>
            <label htmlFor="taxRate" className="block text-sm font-medium text-slate-700 mb-1">
              Tax Rate (%)
              {selectedVendor?.tax_exempt && (
                <span className="ml-2 text-xs font-normal text-green-700">(Vendor is tax exempt)</span>
              )}
            </label>
            <input
              id="taxRate"
              type="number"
              step="0.0001"
              min="0"
              max="100"
              value={taxRate * 100}
              onChange={(e) => setTaxRate(parseFloat(e.target.value) / 100)}
              disabled={selectedVendor?.tax_exempt === true}
              className={`w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                selectedVendor?.tax_exempt ? 'bg-slate-100 cursor-not-allowed' : ''
              }`}
            />
            {selectedVendor?.tax_exempt && (
              <p className="mt-1 text-xs text-green-700">
                Tax rate is set to 0% because this vendor is tax exempt.
              </p>
            )}
          </div>

          {/* Status */}
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-slate-700 mb-1">
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="SENT">Sent</option>
              <option value="RECEIVED">Received</option>
              <option value="CLOSED">Closed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Notes */}
        <div className="mt-4">
          <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-1">
            Notes
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            placeholder="Additional notes..."
          />
        </div>
      </div>

      {/* Line Items */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Line Items</h2>
          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            <Plus className="h-4 w-4" />
            Add Line
          </button>
        </div>

        <div className="space-y-4">
          {lines.map((line, index) => (
            <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Line {line.line_number}</span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label htmlFor={`item-number-${index}`} className="block text-xs font-medium text-slate-600 mb-1">
                    Item Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    id={`item-number-${index}`}
                    type="text"
                    value={line.item_number}
                    onChange={(e) => updateLine(index, 'item_number', e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label htmlFor={`description-${index}`} className="block text-xs font-medium text-slate-600 mb-1">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <input
                    id={`description-${index}`}
                    type="text"
                    value={line.description}
                    onChange={(e) => updateLine(index, 'description', e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                    required
                  />
                </div>

                <div>
                  <label htmlFor={`need-by-date-${index}`} className="block text-xs font-medium text-slate-600 mb-1">
                    Need By Date
                  </label>
                  <input
                    id={`need-by-date-${index}`}
                    type="date"
                    value={line.need_by_date}
                    onChange={(e) => updateLine(index, 'need_by_date', e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label htmlFor={`quantity-${index}`} className="block text-xs font-medium text-slate-600 mb-1">
                    Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    id={`quantity-${index}`}
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={line.quantity}
                    onChange={(e) => updateLine(index, 'quantity', parseFloat(e.target.value) || 0)}
                    className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                    required
                  />
                </div>

                <div>
                  <label htmlFor={`uom-${index}`} className="block text-xs font-medium text-slate-600 mb-1">
                    UOM <span className="text-red-500">*</span>
                  </label>
                  <input
                    id={`uom-${index}`}
                    type="text"
                    value={line.uom}
                    onChange={(e) => updateLine(index, 'uom', e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                    placeholder="each, gal, lb, etc."
                    required
                  />
                </div>

                <div>
                  <label htmlFor={`unit-price-${index}`} className="block text-xs font-medium text-slate-600 mb-1">
                    Unit Price <span className="text-red-500">*</span>
                  </label>
                  <input
                    id={`unit-price-${index}`}
                    type="number"
                    step="0.0001"
                    min="0"
                    value={line.unit_price}
                    onChange={(e) => updateLine(index, 'unit_price', parseFloat(e.target.value) || 0)}
                    className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                    required
                  />
                </div>

                <div className="flex items-end">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={line.taxable}
                      onChange={(e) => updateLine(index, 'taxable', e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-medium text-slate-700">Taxable</span>
                  </label>
                </div>
              </div>

              <div className="mt-2 text-right text-sm text-slate-600">
                Line Total: ${((line.quantity * line.unit_price).toFixed(2))}
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="mt-6 border-t border-slate-200 pt-4">
          <div className="flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal:</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600">
                <span>Tax ({((taxRate * 100).toFixed(2))}%):</span>
                <span>${taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                <span>Total:</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Updating...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Update Purchase Order
            </>
          )}
        </button>
      </div>
    </form>
  );
}

