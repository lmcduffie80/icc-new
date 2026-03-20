'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Loader2, Plus, Trash2, Calendar, MapPin } from 'lucide-react';
import { US_STATES } from '@/components/ui/state-select';
import { PartnerSelectionModal } from './partner-selection-modal';
import { VendorCreationModal } from './vendor-creation-modal';
import { SupplierCreationModal } from './supplier-creation-modal';

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

interface Supplier {
  id: string;
  supplier_number: string | null;
  name: string;
  company_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  tax_exempt: boolean;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
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
  // Margin fields for supplier products
  store_price?: number;
  supplier_base_price?: number;
  icc_margin_percent?: number;
  icc_margin_amount?: number;
  customer_margin_percent?: number;
  customer_margin_amount?: number;
  supplier_share_amount?: number;
  product_id?: string;
}

interface Product {
  id: string;
  name: string;
  sku: string | null;
  price: string;
  supplier_price?: string;
  icc_margin_percent?: number;
  customer_margin_percent?: number;
  unit_of_measure: string | null;
  category: string;
}

interface Partner {
  id: string; // Format: "vendor-{id}" or "supplier-{id}"
  type: 'vendor' | 'supplier';
  displayName: string;
  originalId: number | string;
}

export function PurchaseOrderForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);

  // Form state
  const [partnerId, setPartnerId] = useState<string>('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [buyerName, setBuyerName] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('NET_30');
  const [shipToAddressId, setShipToAddressId] = useState<string>('');
  const [useManualShipTo, setUseManualShipTo] = useState(false);
  const [shipToAddress1, setShipToAddress1] = useState('');
  const [shipToAddress2, setShipToAddress2] = useState('');
  const [shipToCity, setShipToCity] = useState('');
  const [shipToState, setShipToState] = useState('');
  const [shipToZipCode, setShipToZipCode] = useState('');
  const [shipToCountry, setShipToCountry] = useState('United States');
  const [shipToCompanyName, setShipToCompanyName] = useState('');
  const [billToAddressId, setBillToAddressId] = useState<string>('');
  const [taxRate, setTaxRate] = useState(0.07);
  const [status, setStatus] = useState('DRAFT');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineItem[]>([
    {
      line_number: 1,
      item_number: '',
      description: '',
      need_by_date: '',
      quantity: 1,
      uom: 'each',
      unit_price: 0,
      taxable: false,
    },
  ]);

  // Modal state
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);

  // Helper function to rebuild partners list
  const rebuildPartnersList = (vendorsList: Vendor[], suppliersList: Supplier[]) => {
    const vendorPartners: Partner[] = vendorsList.map((vendor) => ({
      id: `vendor-${vendor.id}`,
      type: 'vendor' as const,
      displayName: `${vendor.vendor_number} - ${vendor.name}`,
      originalId: vendor.id,
    }));

    const supplierPartners: Partner[] = suppliersList.map((supplier) => ({
      id: `supplier-${supplier.id}`,
      type: 'supplier' as const,
      displayName: `${supplier.supplier_number || 'N/A'} - ${supplier.company_name || supplier.name}`,
      originalId: supplier.id,
    }));

    const combined = [...vendorPartners, ...supplierPartners];
    combined.sort((a, b) => a.displayName.localeCompare(b.displayName));
    setPartners(combined);
  };

  // Fetch vendors, suppliers, and addresses
  useEffect(() => {
    async function fetchData() {
      try {
        const [vendorsRes, suppliersRes, addressesRes] = await Promise.all([
          fetch('/api/admin/vendors'),
          fetch('/api/admin/suppliers'),
          fetch('/api/admin/addresses'),
        ]);

        let vendorsData: Vendor[] = [];
        let suppliersData: Supplier[] = [];

        if (vendorsRes.ok) {
          vendorsData = await vendorsRes.json();
          setVendors(vendorsData);
        }

        if (suppliersRes.ok) {
          const allSuppliers = await suppliersRes.json();
          suppliersData = allSuppliers.filter((s: Supplier) => s.is_active);
          setSuppliers(suppliersData);
        }

        // Rebuild partners list
        rebuildPartnersList(vendorsData, suppliersData);

        if (addressesRes.ok) {
          const addressesData = await addressesRes.json();
          setAddresses(addressesData);
          // Set default bill-to address if available
          const billTo = addressesData.find((a: Address) => a.type === 'BILL_TO' && a.is_default);
          if (billTo) {
            setBillToAddressId(billTo.id.toString());
          }
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

  // Helper functions to refresh vendors and suppliers lists
  const fetchVendors = async () => {
    try {
      const response = await fetch('/api/admin/vendors');
      if (response.ok) {
        const data = await response.json();
        setVendors(data);
        // Rebuild partners list
        rebuildPartnersList(data, suppliers);
      }
    } catch (err) {
      console.error('Failed to fetch vendors:', err);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await fetch('/api/admin/suppliers');
      if (response.ok) {
        const data = await response.json();
        const active = data.filter((s: Supplier) => s.is_active);
        setSuppliers(active);
        // Rebuild partners list
        rebuildPartnersList(vendors, active);
      }
    } catch (err) {
      console.error('Failed to fetch suppliers:', err);
    }
  };

  // Update payment terms and fetch partner address when partner changes
  useEffect(() => {
    if (!partnerId) return;

    const [partnerType, partnerOriginalId] = partnerId.split('-');

    // Clear ship-to address if it was from a different partner
    if (shipToAddressId.startsWith('vendor-') || shipToAddressId.startsWith('supplier-')) {
      if (shipToAddressId !== `${partnerType}-${partnerOriginalId}`) {
        setShipToAddressId('');
      }
    }

    if (partnerType === 'vendor') {
      const vendor = vendors.find(v => v.id.toString() === partnerOriginalId);
      if (vendor?.default_payment_terms) {
        setPaymentTerms(vendor.default_payment_terms);
      }
      
      // Set tax rate to 0 if vendor is tax exempt
      if (vendor?.tax_exempt) {
        setTaxRate(0);
      }
      
      // Fetch vendor details including address if not already loaded
      if (vendor && vendor.address_id && !vendor.address) {
        fetch(`/api/admin/vendors/${partnerOriginalId}`)
          .then(res => res.json())
          .then(data => {
            if (data.address) {
              // Update vendor in vendors array with address
              setVendors(prevVendors =>
                prevVendors.map(v =>
                  v.id.toString() === partnerOriginalId
                    ? { ...v, address: data.address }
                    : v
                )
              );
            }
          })
          .catch(err => console.error('Failed to fetch vendor address:', err));
      }
    } else if (partnerType === 'supplier') {
      // Set tax rate to 0 if supplier is tax exempt
      const supplier = suppliers.find(s => s.id === partnerOriginalId);
      if (supplier?.tax_exempt) {
        setTaxRate(0);
      } else {
        // Reset to default if not tax exempt
        setTaxRate(0.07);
      }
      
      // Fetch supplier details to ensure we have address data
      if (supplier && (!supplier.address_street && !supplier.address_city)) {
        fetch(`/api/admin/suppliers/${partnerOriginalId}`)
          .then(res => res.json())
          .then(data => {
            // Update supplier in suppliers array with address data
            setSuppliers(prevSuppliers =>
              prevSuppliers.map(s =>
                s.id === partnerOriginalId
                  ? { ...s, ...data }
                  : s
              )
            );
          })
          .catch(err => console.error('Failed to fetch supplier details:', err));
      }
    }
  }, [partnerId, vendors, suppliers, shipToAddressId]);

  // Fetch products when partner changes
  useEffect(() => {
    if (!partnerId) {
      setProducts([]);
      return;
    }

    const [partnerType, partnerOriginalId] = partnerId.split('-');
    
    setProductsLoading(true);
    const url = partnerType === 'supplier'
      ? `/api/admin/purchase-orders/products?supplier_id=${partnerOriginalId}`
      : '/api/admin/purchase-orders/products';

    fetch(url)
      .then(res => res.json())
      .then(data => setProducts(data.products || []))
      .catch(err => console.error('Failed to fetch products:', err))
      .finally(() => setProductsLoading(false));
  }, [partnerId]);

  // Calculate unit price from margins for supplier products
  // Formula: ICC gets a percentage of total margin, supplier gets the rest
  const calculateUnitPriceFromMargins = (
    storePrice: number,
    supplierBasePrice: number,
    iccMarginPercent: number,
    customerMarginPercent: number
  ): {
    unit_price: number;
    icc_margin_amount: number;
    customer_margin_amount: number;
    customer_pays: number;
    total_margin: number;
    supplier_share: number;
  } => {
    // 1. Calculate what customer pays after discount
    const customerPays = storePrice * (1 - customerMarginPercent / 100);
    const customerMarginAmount = storePrice - customerPays;
    
    // 2. Calculate total margin from full price (store price - supplier base cost)
    const totalMargin = storePrice - supplierBasePrice;
    
    // 3. Split margin: ICC gets their percentage, supplier gets the rest
    const iccMarginAmount = (totalMargin * iccMarginPercent) / 100;
    const supplierShare = totalMargin - iccMarginAmount;
    
    // 4. PO unit price = supplier base + their share of margin
    const unitPrice = supplierBasePrice + supplierShare;
    
    return {
      unit_price: Math.max(0, Number(unitPrice.toFixed(2))),
      icc_margin_amount: Number(iccMarginAmount.toFixed(2)),
      customer_margin_amount: Number(customerMarginAmount.toFixed(2)),
      customer_pays: Number(customerPays.toFixed(2)),
      total_margin: Number(totalMargin.toFixed(2)),
      supplier_share: Number(supplierShare.toFixed(2)),
    };
  };

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
    if (!partnerId) return 'Partner is required';
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
      
      // Validate margins for supplier products
      if (line.store_price && line.store_price > 0 && line.supplier_base_price !== undefined) {
        const storePrice = line.store_price;
        const supplierBasePrice = line.supplier_base_price;
        const unitPrice = line.unit_price;
        
        // Basic validation: supplier base price must be less than what customer pays
        if (line.customer_margin_percent !== undefined) {
          const customerPays = storePrice * (1 - line.customer_margin_percent / 100);
          
          if (supplierBasePrice >= customerPays) {
            return `Line ${i + 1}: Supplier base price ($${supplierBasePrice.toFixed(2)}) must be less than customer pays ($${customerPays.toFixed(2)}) to have a positive margin`;
          }
          
          // Validate the margin split calculation
          if (line.icc_margin_percent !== undefined && line.icc_margin_amount !== undefined) {
            const totalMargin = storePrice - supplierBasePrice;
            const expectedIccShare = (totalMargin * line.icc_margin_percent) / 100;
            const supplierShare = totalMargin - expectedIccShare;
            const expectedUnitPrice = supplierShare;
            
            // Allow small rounding difference (0.5%)
            const priceDiff = Math.abs(unitPrice - expectedUnitPrice);
            const iccDiff = Math.abs(line.icc_margin_amount - expectedIccShare);
            
            if (priceDiff > 0.01) {
              return `Line ${i + 1}: PO unit price mismatch. Expected $${expectedUnitPrice.toFixed(2)} but got $${unitPrice.toFixed(2)}. Please recalculate.`;
            }
            
            if (iccDiff > 0.01) {
              return `Line ${i + 1}: ICC margin amount mismatch. Expected $${expectedIccShare.toFixed(2)} but got $${line.icc_margin_amount.toFixed(2)}. Please recalculate.`;
            }
          }
        }
        
        if (line.customer_margin_percent !== undefined && line.customer_margin_percent < 0) {
          return `Line ${i + 1}: Customer margin cannot be negative`;
        }
      }
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
        vendor_id?: number;
        supplier_id?: string;
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
          // Convert margin percentages from strings to numbers for API validation
          icc_margin_percent: line.icc_margin_percent !== undefined && line.icc_margin_percent !== null 
            ? Number(line.icc_margin_percent) 
            : null,
          customer_margin_percent: line.customer_margin_percent !== undefined && line.customer_margin_percent !== null
            ? Number(line.customer_margin_percent)
            : null,
        })),
      };

      // Set vendor_id or supplier_id based on selected partner
      if (partnerId) {
        const [partnerType, partnerOriginalId] = partnerId.split('-');
        if (partnerType === 'vendor') {
          requestBody.vendor_id = parseInt(partnerOriginalId, 10);
        } else {
          requestBody.supplier_id = partnerOriginalId;
        }
      }

      // Handle ship-to address - either use existing, vendor address, supplier address, or create new
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
      } else if (shipToAddressId.startsWith('supplier-')) {
        // Supplier address selected - use supplier's address
        const supplierIdFromAddress = shipToAddressId.replace('supplier-', '');
        const supplier = suppliers.find(s => s.id === supplierIdFromAddress);
        if (supplier && supplier.address_street && supplier.address_city && supplier.address_state && supplier.address_zip) {
          requestBody.ship_to_address = {
            company_name: supplier.company_name || supplier.name,
            address1: supplier.address_street,
            address2: null,
            city: supplier.address_city,
            state: supplier.address_state,
            zip_code: supplier.address_zip,
            country: 'United States',
          };
        } else {
          throw new Error('Supplier address not found or incomplete');
        }
      } else {
        requestBody.ship_to_address_id = parseInt(shipToAddressId, 10);
      }

      const response = await fetch('/api/admin/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create purchase order');
      }

      router.push('/admin/purchase-orders');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create purchase order');
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

  // Parse selected partner to get vendor or supplier
  const selectedPartner = partnerId ? partners.find(p => p.id === partnerId) : null;
  const selectedVendor = selectedPartner?.type === 'vendor' 
    ? vendors.find(v => v.id === selectedPartner.originalId) 
    : null;
  const selectedSupplier = selectedPartner?.type === 'supplier'
    ? suppliers.find(s => s.id === selectedPartner.originalId)
    : null;
  
  // Calculate totals - use customer amount for supplier products, unit price for vendor products
  const subtotal = lines.reduce((sum, line) => {
    if (line.store_price && line.customer_margin_percent !== undefined) {
      // Supplier product - use customer amount
      return sum + (line.quantity * line.store_price * (1 - line.customer_margin_percent / 100));
    }
    // Vendor product - use unit price
    return sum + (line.quantity * line.unit_price);
  }, 0);
  
  const taxableSubtotal = lines
    .filter(line => line.taxable)
    .reduce((sum, line) => {
      if (line.store_price && line.customer_margin_percent !== undefined) {
        // Supplier product - use customer amount
        return sum + (line.quantity * line.store_price * (1 - line.customer_margin_percent / 100));
      }
      // Vendor product - use unit price
      return sum + (line.quantity * line.unit_price);
    }, 0);
  
  const taxAmount = taxableSubtotal * taxRate;
  const total = subtotal + taxAmount;
  
  // Calculate PO subtotal (what ICC pays suppliers) for display
  const poSubtotal = lines.reduce((sum, line) => sum + (line.quantity * line.unit_price), 0);

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
          {/* PO Type - Fixed as Standard PO */}
          <div>
            <div className="block text-sm font-medium text-slate-700 mb-1">
              PO Type
            </div>
            <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-slate-900">
              Standard PO
            </div>
          </div>

          {/* Partner Selection with Create New */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="partner" className="block text-sm font-medium text-slate-700">
                Partner <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowPartnerModal(true)}
                className="inline-flex items-center gap-1 px-3 py-1 text-sm text-emerald-600 hover:text-emerald-700 border border-emerald-300 rounded-lg hover:bg-emerald-50 transition"
              >
                <Plus className="h-4 w-4" />
                Create New
              </button>
            </div>
            <select
              id="partner"
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              required
            >
              <option value="">Select partner...</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Partner Address - Display when partner selected */}
          {partnerId && (() => {
            const [partnerType, partnerOriginalId] = partnerId.split('-');
            
            if (partnerType === 'supplier') {
              const selectedSupplier = suppliers.find(s => s.id === partnerOriginalId);
              const hasAddress = selectedSupplier?.address_street || selectedSupplier?.address_city;
              
              if (hasAddress) {
                return (
                  <div className="col-span-2 rounded-lg bg-slate-50 border border-slate-200 p-4">
                    <h3 className="text-sm font-medium text-slate-700 mb-2">
                      Supplier Address
                    </h3>
                    <div className="text-sm text-slate-600 space-y-1">
                      {selectedSupplier.address_street && (
                        <div>{selectedSupplier.address_street}</div>
                      )}
                      {(selectedSupplier.address_city || selectedSupplier.address_state || 
                        selectedSupplier.address_zip) && (
                        <div>
                          {[
                            selectedSupplier.address_city,
                            selectedSupplier.address_state,
                            selectedSupplier.address_zip
                          ].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
            } else if (partnerType === 'vendor') {
              const selectedVendor = vendors.find(v => v.id === parseInt(partnerOriginalId));
              const hasAddress = selectedVendor?.address?.address1 || selectedVendor?.address?.city;
              
              if (hasAddress && selectedVendor?.address) {
                return (
                  <div className="col-span-2 rounded-lg bg-slate-50 border border-slate-200 p-4">
                    <h3 className="text-sm font-medium text-slate-700 mb-2">
                      Vendor Address
                    </h3>
                    <div className="text-sm text-slate-600 space-y-1">
                      {selectedVendor.address.address1 && (
                        <div>{selectedVendor.address.address1}</div>
                      )}
                      {selectedVendor.address.address2 && (
                        <div>{selectedVendor.address.address2}</div>
                      )}
                      {(selectedVendor.address.city || selectedVendor.address.state || 
                        selectedVendor.address.zip_code) && (
                        <div>
                          {[
                            selectedVendor.address.city,
                            selectedVendor.address.state,
                            selectedVendor.address.zip_code
                          ].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
            }
            return null;
          })()}

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
                    <select
                      id="shipToState"
                      value={shipToState}
                      onChange={(e) => setShipToState(e.target.value)}
                      className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20 hover:cursor-pointer"
                      required
                    >
                      <option value="">Select state...</option>
                      {US_STATES.map((state) => (
                        <option key={state.code} value={state.code}>
                          {state.code} - {state.name}
                        </option>
                      ))}
                    </select>
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
                {/* Supplier address option if available */}
                {selectedSupplier && selectedSupplier.address_street && selectedSupplier.address_city && selectedSupplier.address_state && selectedSupplier.address_zip && (
                  <option value={`supplier-${selectedSupplier.id}`}>
                    {selectedSupplier.company_name || selectedSupplier.name} - {selectedSupplier.address_city}, {selectedSupplier.address_state} (Supplier Address)
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
              value={taxRate === 0 ? '' : (taxRate * 100).toFixed(4).replace(/\.?0+$/, '')}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '' || value === null) {
                  setTaxRate(0);
                } else {
                  const parsed = parseFloat(value);
                  setTaxRate(isNaN(parsed) ? 0 : parsed / 100);
                }
              }}
              disabled={selectedVendor?.tax_exempt === true}
              className={`w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                selectedVendor?.tax_exempt ? 'bg-slate-100 cursor-not-allowed' : ''
              }`}
              placeholder="0"
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

              {/* Product Selector */}
              <div className="mb-4">
                <label htmlFor={`product-select-${index}`} className="block text-xs font-medium text-slate-600 mb-1">
                  Select Product (optional)
                </label>
                <select
                  id={`product-select-${index}`}
                  value=""
                  onChange={(e) => {
                    const product = products.find(p => p.id === e.target.value);
                    if (product) {
                      const storePrice = parseFloat(product.price) || 0;
                      let calculatedPrice = storePrice;
                      let marginData: Partial<LineItem> = {};
                      
                      // Calculate unit_price from margins for supplier products
                      // Note: PO unit price is set to supplier_share (supplier's portion of margin)
                      if (selectedPartner?.type === 'supplier' && 
                          product.supplier_price !== undefined && 
                          product.supplier_price !== null &&
                          product.icc_margin_percent !== undefined && 
                          product.customer_margin_percent !== undefined) {
                        const supplierBasePrice = parseFloat(product.supplier_price) || 0;
                        
                        // Validate that we have a positive margin to work with
                        if (supplierBasePrice > 0 && storePrice > supplierBasePrice) {
                          const calculated = calculateUnitPriceFromMargins(
                            storePrice,
                            supplierBasePrice,
                            product.icc_margin_percent,
                            product.customer_margin_percent
                          );
                          calculatedPrice = calculated.supplier_share;
                          marginData = {
                            store_price: storePrice,
                            supplier_base_price: supplierBasePrice,
                            icc_margin_percent: product.icc_margin_percent,
                            icc_margin_amount: calculated.icc_margin_amount,
                            customer_margin_percent: product.customer_margin_percent,
                            customer_margin_amount: calculated.customer_margin_amount,
                            supplier_share_amount: calculated.supplier_share,
                            product_id: product.id,
                          };
                        } else {
                          // Fallback: if no valid supplier_price, use store price
                          console.warn(`Product ${product.id} has invalid supplier_price. Using store price as fallback.`);
                          calculatedPrice = storePrice;
                        }
                      }
                      
                      setLines(prevLines => {
                        const newLines = [...prevLines];
                        newLines[index] = {
                          ...newLines[index],
                          item_number: product.sku || product.id,
                          description: product.name,
                          unit_price: calculatedPrice,
                          uom: product.unit_of_measure || 'each',
                          ...marginData,
                        };
                        return newLines;
                      });
                    }
                  }}
                  disabled={!partnerId}
                  className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20 disabled:bg-slate-100 hover:cursor-pointer"
                >
                  <option value="">
                    {productsLoading ? 'Loading products...' :
                     !partnerId ? 'Select a partner first...' :
                     products.length === 0 ? 'No products available' :
                     'Choose a product to auto-fill fields...'}
                  </option>
                  {products.map(product => (
                    <option key={product.id} value={product.id}>
                      {product.sku ? `${product.sku} - ` : ''}{product.name} ({product.category}) - {parseFloat(product.price).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </option>
                  ))}
                </select>
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
                    Unit Price {line.store_price && '(Supplier Cost)'} <span className="text-red-500">*</span>
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
                  {line.store_price && line.supplier_base_price !== undefined && line.customer_margin_percent !== undefined && (
                    <div className="mt-1 text-xs text-slate-600 space-y-0.5 border-t pt-1">
                      <div className="font-medium">Margin Breakdown:</div>
                      <div>Store Price: ${line.store_price.toFixed(2)}</div>
                      <div className="text-slate-500">
                        Supplier Base Cost: ${line.supplier_base_price.toFixed(2)}
                      </div>
                      {line.icc_margin_percent !== undefined && line.icc_margin_percent !== null && (
                        <>
                          <div className="text-amber-600">
                            Total Margin: ${(line.store_price - line.supplier_base_price).toFixed(2)}
                          </div>
                          <div className="text-blue-600">
                            ICC Share ({Number(line.icc_margin_percent ?? 0).toFixed(1)}%): ${line.icc_margin_amount?.toFixed(2) || '0.00'}
                          </div>
                          <div className="text-purple-600">
                            Supplier Share ({(100 - Number(line.icc_margin_percent ?? 0)).toFixed(1)}%): ${line.supplier_share_amount?.toFixed(2) || '0.00'}
                          </div>
                          <div className="font-medium text-slate-700 border-t pt-0.5">
                            PO Unit Price: ${line.unit_price.toFixed(2)}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Supplier Share - only show for supplier products */}
                {line.supplier_share_amount !== undefined && line.supplier_share_amount !== null && (
                  <div>
                    <label htmlFor={`supplier-share-${index}`} className="block text-xs font-medium text-slate-600 mb-1">
                      Supplier Share
                    </label>
                    <input
                      id={`supplier-share-${index}`}
                      type="number"
                      step="0.0001"
                      value={line.supplier_share_amount}
                      readOnly
                      className="w-full rounded border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 cursor-not-allowed"
                      title="Calculated field: Supplier's portion of the margin"
                    />
                    <div className="mt-1 text-xs text-slate-500">
                      Per unit margin share
                    </div>
                  </div>
                )}

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
                {line.store_price && line.customer_margin_percent !== undefined ? (
                  <>
                    <div className="text-xs text-slate-500">
                      PO Total: ${((line.quantity * line.unit_price).toFixed(2))}
                    </div>
                    {line.supplier_share_amount !== undefined && line.supplier_share_amount !== null && (
                      <div className="text-xs text-purple-600">
                        Supplier Share Total: ${((line.quantity * line.supplier_share_amount).toFixed(2))}
                      </div>
                    )}
                  </>
                ) : (
                  <div>Line Total: ${((line.quantity * line.unit_price).toFixed(2))}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="mt-6 border-t border-slate-200 pt-4">
          <div className="flex justify-end">
            <div className="w-80 space-y-2">
              {selectedPartner?.type === 'supplier' && lines.some(line => line.store_price && line.customer_margin_percent !== undefined) ? (
                <>
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Subtotal:</span>
                    <span>${poSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Tax ({((taxRate * 100).toFixed(2))}%):</span>
                    <span>${taxAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                    <span>Total:</span>
                    <span>${(poSubtotal + taxAmount).toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Subtotal:</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Tax ({((taxRate * 100).toFixed(2))}):</span>
                    <span>${taxAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                    <span>Total:</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                </>
              )}
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
              Creating...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Create Purchase Order
            </>
          )}
        </button>
      </div>

      {/* Partner Selection Modal */}
      <PartnerSelectionModal
        isOpen={showPartnerModal}
        onClose={() => setShowPartnerModal(false)}
        onSelectVendor={() => setShowVendorModal(true)}
        onSelectSupplier={() => setShowSupplierModal(true)}
      />

      {/* Vendor Creation Modal */}
      <VendorCreationModal
        isOpen={showVendorModal}
        onClose={() => setShowVendorModal(false)}
        onSuccess={async (vendorId) => {
          // Refresh vendors list
          await fetchVendors();
          // Auto-select newly created vendor
          setPartnerId(`vendor-${vendorId}`);
          // Close modal
          setShowVendorModal(false);
        }}
      />

      {/* Supplier Creation Modal */}
      <SupplierCreationModal
        isOpen={showSupplierModal}
        onClose={() => setShowSupplierModal(false)}
        onSuccess={async (supplierId) => {
          // Refresh suppliers list
          await fetchSuppliers();
          // Auto-select newly created supplier
          setPartnerId(`supplier-${supplierId}`);
          // Close modal
          setShowSupplierModal(false);
        }}
      />
    </form>
  );
}

