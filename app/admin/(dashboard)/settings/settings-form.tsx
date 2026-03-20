'use client';

import { useState } from 'react';
import { Save, Loader2, Plus, Trash2 } from 'lucide-react';

interface ShippingMethod {
  id: string;
  name: string;
  price: number;
  days: string;
}

interface TaxSettings {
  default_rate: number;
  rates_by_state: Record<string, number>;
}

interface PaymentSettings {
  stripe_enabled: boolean;
  min_order_amount: number;
  max_order_amount: number;
  allow_saved_cards: boolean;
  send_receipt_emails: boolean;
}

interface CategoriesSettings {
  categories: string[];
}

interface UnitsOfMeasureSettings {
  units_of_measure: string[];
}

interface StoreInfoSettings {
  store_name: string;
  phone: string;
  email: string;
  support_email: string;
  address_street: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  business_hours: string;
}

interface TruckloadRate {
  id: string;
  label: string;
  rate_per_mile: number;
}

interface TruckloadSettings {
  enabled: boolean;
  min_totes: number;
  gallons_per_tote: number;
  min_pallets: number;
  max_weight_lbs: number;
  rates: TruckloadRate[];
}

interface SettingsFormProps {
  settings: {
    shipping?: ShippingMethod[];
    tax?: TaxSettings;
    payment?: PaymentSettings;
    categories?: CategoriesSettings;
    units_of_measure?: UnitsOfMeasureSettings;
    store_info?: StoreInfoSettings;
    truckload?: TruckloadSettings;
  };
  canUpdateShipping: boolean;
  canUpdateTax: boolean;
  canUpdatePayment: boolean;
  canUpdateCategories: boolean;
  canUpdateUnitsOfMeasure: boolean;
  canUpdateStoreInfo: boolean;
}

type ActiveTab = 'store_info' | 'shipping' | 'tax' | 'payment' | 'categories' | 'units_of_measure';

const TABS: { id: ActiveTab; label: string }[] = [
  { id: 'store_info', label: 'Store Info' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'tax', label: 'Tax' },
  { id: 'payment', label: 'Payment' },
  { id: 'categories', label: 'Categories' },
  { id: 'units_of_measure', label: 'Units of Measure' },
];

export function SettingsForm({
  settings,
  canUpdateShipping,
  canUpdateTax,
  canUpdatePayment,
  canUpdateCategories,
  canUpdateUnitsOfMeasure,
  canUpdateStoreInfo,
}: SettingsFormProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('store_info');
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Store Info state
  const [storeInfo, setStoreInfo] = useState<StoreInfoSettings>({
    store_name: settings.store_info?.store_name || '',
    phone: settings.store_info?.phone || '',
    email: settings.store_info?.email || '',
    support_email: settings.store_info?.support_email || '',
    address_street: settings.store_info?.address_street || '',
    address_city: settings.store_info?.address_city || '',
    address_state: settings.store_info?.address_state || '',
    address_zip: settings.store_info?.address_zip || '',
    business_hours: settings.store_info?.business_hours || '',
  });

  // Shipping state
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>(
    settings.shipping || []
  );

  // Tax state
  const [taxSettings, setTaxSettings] = useState<TaxSettings>({
    default_rate: settings.tax?.default_rate ?? 0,
    rates_by_state: settings.tax?.rates_by_state || {},
  });
  const [newStateCode, setNewStateCode] = useState('');
  const [newStateRate, setNewStateRate] = useState('');

  // Payment state
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>({
    stripe_enabled: settings.payment?.stripe_enabled ?? true,
    min_order_amount: settings.payment?.min_order_amount ?? 0,
    max_order_amount: settings.payment?.max_order_amount ?? 999999,
    allow_saved_cards: settings.payment?.allow_saved_cards ?? true,
    send_receipt_emails: settings.payment?.send_receipt_emails ?? true,
  });

  // Categories state
  const [categories, setCategories] = useState<string[]>(
    settings.categories?.categories || []
  );
  const [newCategory, setNewCategory] = useState('');

  // Units of Measure state
  const [unitsOfMeasure, setUnitsOfMeasure] = useState<string[]>(
    settings.units_of_measure?.units_of_measure || []
  );
  const [newUnit, setNewUnit] = useState('');

  const showFeedback = (success: boolean, message: string) => {
    if (success) {
      setSuccessMessage(message);
      setErrorMessage('');
      setTimeout(() => setSuccessMessage(''), 3000);
    } else {
      setErrorMessage(message);
      setSuccessMessage('');
    }
  };

  const saveSettings = async (key: string, value: unknown) => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      showFeedback(true, 'Settings saved successfully');
    } catch (err) {
      showFeedback(false, err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStoreInfo = () => saveSettings('store_info', storeInfo);
  const handleSaveShipping = () => saveSettings('shipping', shippingMethods);
  const handleSaveTax = () => saveSettings('tax', taxSettings);
  const handleSavePayment = () => saveSettings('payment', paymentSettings);
  const handleSaveCategories = () => saveSettings('categories', { categories });
  const handleSaveUnitsOfMeasure = () => saveSettings('units_of_measure', { units_of_measure: unitsOfMeasure });

  const addShippingMethod = () => {
    setShippingMethods([
      ...shippingMethods,
      { id: `method_${Date.now()}`, name: '', price: 0, days: '' },
    ]);
  };

  const updateShippingMethod = (index: number, field: keyof ShippingMethod, value: string | number) => {
    const updated = [...shippingMethods];
    updated[index] = { ...updated[index], [field]: value };
    setShippingMethods(updated);
  };

  const removeShippingMethod = (index: number) => {
    setShippingMethods(shippingMethods.filter((_, i) => i !== index));
  };

  const addStateRate = () => {
    if (!newStateCode || !newStateRate) return;
    setTaxSettings({
      ...taxSettings,
      rates_by_state: {
        ...taxSettings.rates_by_state,
        [newStateCode.toUpperCase()]: parseFloat(newStateRate),
      },
    });
    setNewStateCode('');
    setNewStateRate('');
  };

  const removeStateRate = (state: string) => {
    const updated = { ...taxSettings.rates_by_state };
    delete updated[state];
    setTaxSettings({ ...taxSettings, rates_by_state: updated });
  };

  const addCategory = () => {
    if (!newCategory.trim()) return;
    setCategories([...categories, newCategory.trim()]);
    setNewCategory('');
  };

  const removeCategory = (index: number) => {
    setCategories(categories.filter((_, i) => i !== index));
  };

  const addUnit = () => {
    if (!newUnit.trim()) return;
    setUnitsOfMeasure([...unitsOfMeasure, newUnit.trim()]);
    setNewUnit('');
  };

  const removeUnit = (index: number) => {
    setUnitsOfMeasure(unitsOfMeasure.filter((_, i) => i !== index));
  };

  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';
  const labelClass = 'block text-sm font-medium text-slate-700';

  return (
    <div className="space-y-6">
      {/* Feedback */}
      {successMessage && (
        <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">{successMessage}</div>
      )}
      {errorMessage && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">{errorMessage}</div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Settings tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors hover:cursor-pointer ${
                activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Store Info */}
      {activeTab === 'store_info' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-6 text-lg font-semibold text-slate-900">Store Information</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="store-name" className={labelClass}>Store Name</label>
              <input
                id="store-name"
                type="text"
                value={storeInfo.store_name}
                onChange={(e) => setStoreInfo({ ...storeInfo, store_name: e.target.value })}
                className={inputClass}
                disabled={!canUpdateStoreInfo}
              />
            </div>
            <div>
              <label htmlFor="store-phone" className={labelClass}>Phone</label>
              <input
                id="store-phone"
                type="tel"
                value={storeInfo.phone}
                onChange={(e) => setStoreInfo({ ...storeInfo, phone: e.target.value })}
                className={inputClass}
                disabled={!canUpdateStoreInfo}
              />
            </div>
            <div>
              <label htmlFor="store-email" className={labelClass}>Email</label>
              <input
                id="store-email"
                type="email"
                value={storeInfo.email}
                onChange={(e) => setStoreInfo({ ...storeInfo, email: e.target.value })}
                className={inputClass}
                disabled={!canUpdateStoreInfo}
              />
            </div>
            <div>
              <label htmlFor="store-support-email" className={labelClass}>Support Email</label>
              <input
                id="store-support-email"
                type="email"
                value={storeInfo.support_email}
                onChange={(e) => setStoreInfo({ ...storeInfo, support_email: e.target.value })}
                className={inputClass}
                disabled={!canUpdateStoreInfo}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="store-address-street" className={labelClass}>Street Address</label>
              <input
                id="store-address-street"
                type="text"
                value={storeInfo.address_street}
                onChange={(e) => setStoreInfo({ ...storeInfo, address_street: e.target.value })}
                className={inputClass}
                disabled={!canUpdateStoreInfo}
              />
            </div>
            <div>
              <label htmlFor="store-address-city" className={labelClass}>City</label>
              <input
                id="store-address-city"
                type="text"
                value={storeInfo.address_city}
                onChange={(e) => setStoreInfo({ ...storeInfo, address_city: e.target.value })}
                className={inputClass}
                disabled={!canUpdateStoreInfo}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="store-address-state" className={labelClass}>State</label>
                <input
                  id="store-address-state"
                  type="text"
                  value={storeInfo.address_state}
                  onChange={(e) => setStoreInfo({ ...storeInfo, address_state: e.target.value })}
                  className={inputClass}
                  maxLength={2}
                  placeholder="TX"
                  disabled={!canUpdateStoreInfo}
                />
              </div>
              <div>
                <label htmlFor="store-address-zip" className={labelClass}>ZIP Code</label>
                <input
                  id="store-address-zip"
                  type="text"
                  value={storeInfo.address_zip}
                  onChange={(e) => setStoreInfo({ ...storeInfo, address_zip: e.target.value })}
                  className={inputClass}
                  disabled={!canUpdateStoreInfo}
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="store-business-hours" className={labelClass}>Business Hours</label>
              <input
                id="store-business-hours"
                type="text"
                value={storeInfo.business_hours}
                onChange={(e) => setStoreInfo({ ...storeInfo, business_hours: e.target.value })}
                className={inputClass}
                placeholder="Mon–Fri 8am–5pm CST"
                disabled={!canUpdateStoreInfo}
              />
            </div>
          </div>
          {canUpdateStoreInfo && (
            <div className="mt-6 flex justify-end">
              <SaveButton saving={saving} onClick={handleSaveStoreInfo} />
            </div>
          )}
        </div>
      )}

      {/* Shipping */}
      {activeTab === 'shipping' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Shipping Methods</h2>
            {canUpdateShipping && (
              <button
                type="button"
                onClick={addShippingMethod}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Add Method
              </button>
            )}
          </div>
          <div className="space-y-4">
            {shippingMethods.length === 0 && (
              <p className="text-sm text-slate-500">No shipping methods configured.</p>
            )}
            {shippingMethods.map((method, index) => (
              <div key={method.id} className="grid gap-4 rounded-lg border border-slate-100 bg-slate-50 p-4 sm:grid-cols-4">
                <div>
                  <label htmlFor={`shipping-name-${index}`} className={labelClass}>Name</label>
                  <input
                    id={`shipping-name-${index}`}
                    type="text"
                    value={method.name}
                    onChange={(e) => updateShippingMethod(index, 'name', e.target.value)}
                    className={inputClass}
                    placeholder="Standard Shipping"
                    disabled={!canUpdateShipping}
                  />
                </div>
                <div>
                  <label htmlFor={`shipping-price-${index}`} className={labelClass}>Price ($)</label>
                  <input
                    id={`shipping-price-${index}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={method.price}
                    onChange={(e) => updateShippingMethod(index, 'price', parseFloat(e.target.value) || 0)}
                    className={inputClass}
                    disabled={!canUpdateShipping}
                  />
                </div>
                <div>
                  <label htmlFor={`shipping-days-${index}`} className={labelClass}>Delivery Days</label>
                  <input
                    id={`shipping-days-${index}`}
                    type="text"
                    value={method.days}
                    onChange={(e) => updateShippingMethod(index, 'days', e.target.value)}
                    className={inputClass}
                    placeholder="5-7"
                    disabled={!canUpdateShipping}
                  />
                </div>
                {canUpdateShipping && (
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeShippingMethod(index)}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 hover:cursor-pointer"
                      aria-label="Remove shipping method"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {canUpdateShipping && (
            <div className="mt-6 flex justify-end">
              <SaveButton saving={saving} onClick={handleSaveShipping} />
            </div>
          )}
        </div>
      )}

      {/* Tax */}
      {activeTab === 'tax' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-6 text-lg font-semibold text-slate-900">Tax Settings</h2>
          <div className="mb-6">
            <label htmlFor="tax-default-rate" className={labelClass}>Default Tax Rate (%)</label>
            <input
              id="tax-default-rate"
              type="number"
              min="0"
              max="100"
              step="0.001"
              value={taxSettings.default_rate}
              onChange={(e) => setTaxSettings({ ...taxSettings, default_rate: parseFloat(e.target.value) || 0 })}
              className="mt-1 w-48 rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              disabled={!canUpdateTax}
            />
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-slate-700">State-Specific Rates</h3>
            {canUpdateTax && (
              <div className="mb-4 flex items-end gap-3">
                <div>
                  <label htmlFor="new-state-code" className={labelClass}>State Code</label>
                  <input
                    id="new-state-code"
                    type="text"
                    value={newStateCode}
                    onChange={(e) => setNewStateCode(e.target.value.toUpperCase())}
                    className="mt-1 w-24 rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="TX"
                    maxLength={2}
                  />
                </div>
                <div>
                  <label htmlFor="new-state-rate" className={labelClass}>Rate (%)</label>
                  <input
                    id="new-state-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.001"
                    value={newStateRate}
                    onChange={(e) => setNewStateRate(e.target.value)}
                    className="mt-1 w-32 rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="8.25"
                  />
                </div>
                <button
                  type="button"
                  onClick={addStateRate}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 hover:cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>
            )}
            <div className="space-y-2">
              {Object.entries(taxSettings.rates_by_state).length === 0 && (
                <p className="text-sm text-slate-500">No state-specific rates configured.</p>
              )}
              {Object.entries(taxSettings.rates_by_state).map(([state, rate]) => (
                <div key={state} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-2">
                  <span className="text-sm font-medium text-slate-700">{state}</span>
                  <span className="text-sm text-slate-600">{rate}%</span>
                  {canUpdateTax && (
                    <button
                      type="button"
                      onClick={() => removeStateRate(state)}
                      className="ml-4 text-red-500 hover:text-red-700 hover:cursor-pointer"
                      aria-label={`Remove ${state} tax rate`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {canUpdateTax && (
            <div className="mt-6 flex justify-end">
              <SaveButton saving={saving} onClick={handleSaveTax} />
            </div>
          )}
        </div>
      )}

      {/* Payment */}
      {activeTab === 'payment' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-6 text-lg font-semibold text-slate-900">Payment Settings</h2>
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="stripe-enabled"
                checked={paymentSettings.stripe_enabled}
                onChange={(e) => setPaymentSettings({ ...paymentSettings, stripe_enabled: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                disabled={!canUpdatePayment}
              />
              <label htmlFor="stripe-enabled" className="text-sm font-medium text-slate-700">
                Stripe Payments Enabled
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="allow-saved-cards"
                checked={paymentSettings.allow_saved_cards}
                onChange={(e) => setPaymentSettings({ ...paymentSettings, allow_saved_cards: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                disabled={!canUpdatePayment}
              />
              <label htmlFor="allow-saved-cards" className="text-sm font-medium text-slate-700">
                Allow Saved Cards
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="send-receipt-emails"
                checked={paymentSettings.send_receipt_emails}
                onChange={(e) => setPaymentSettings({ ...paymentSettings, send_receipt_emails: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                disabled={!canUpdatePayment}
              />
              <label htmlFor="send-receipt-emails" className="text-sm font-medium text-slate-700">
                Send Receipt Emails
              </label>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="min-order-amount" className={labelClass}>Minimum Order Amount ($)</label>
                <input
                  id="min-order-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentSettings.min_order_amount}
                  onChange={(e) => setPaymentSettings({ ...paymentSettings, min_order_amount: parseFloat(e.target.value) || 0 })}
                  className={inputClass}
                  disabled={!canUpdatePayment}
                />
              </div>
              <div>
                <label htmlFor="max-order-amount" className={labelClass}>Maximum Order Amount ($)</label>
                <input
                  id="max-order-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentSettings.max_order_amount}
                  onChange={(e) => setPaymentSettings({ ...paymentSettings, max_order_amount: parseFloat(e.target.value) || 0 })}
                  className={inputClass}
                  disabled={!canUpdatePayment}
                />
              </div>
            </div>
          </div>

          {canUpdatePayment && (
            <div className="mt-6 flex justify-end">
              <SaveButton saving={saving} onClick={handleSavePayment} />
            </div>
          )}
        </div>
      )}

      {/* Categories */}
      {activeTab === 'categories' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-6 text-lg font-semibold text-slate-900">Product Categories</h2>
          {canUpdateCategories && (
            <div className="mb-4 flex items-end gap-3">
              <div className="flex-1">
                <label htmlFor="new-category" className={labelClass}>New Category</label>
                <input
                  id="new-category"
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                  className={inputClass}
                  placeholder="Category name"
                />
              </div>
              <button
                type="button"
                onClick={addCategory}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 hover:cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
          )}
          <div className="space-y-2">
            {categories.length === 0 && (
              <p className="text-sm text-slate-500">No categories configured.</p>
            )}
            {categories.map((cat, index) => (
              <div key={index} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-2">
                <span className="text-sm text-slate-700">{cat}</span>
                {canUpdateCategories && (
                  <button
                    type="button"
                    onClick={() => removeCategory(index)}
                    className="text-red-500 hover:text-red-700 hover:cursor-pointer"
                    aria-label={`Remove category ${cat}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {canUpdateCategories && (
            <div className="mt-6 flex justify-end">
              <SaveButton saving={saving} onClick={handleSaveCategories} />
            </div>
          )}
        </div>
      )}

      {/* Units of Measure */}
      {activeTab === 'units_of_measure' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-6 text-lg font-semibold text-slate-900">Units of Measure</h2>
          {canUpdateUnitsOfMeasure && (
            <div className="mb-4 flex items-end gap-3">
              <div className="flex-1">
                <label htmlFor="new-unit" className={labelClass}>New Unit</label>
                <input
                  id="new-unit"
                  type="text"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addUnit()}
                  className={inputClass}
                  placeholder="e.g. lbs, kg, tote"
                />
              </div>
              <button
                type="button"
                onClick={addUnit}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 hover:cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
          )}
          <div className="space-y-2">
            {unitsOfMeasure.length === 0 && (
              <p className="text-sm text-slate-500">No units of measure configured.</p>
            )}
            {unitsOfMeasure.map((unit, index) => (
              <div key={index} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-2">
                <span className="text-sm text-slate-700">{unit}</span>
                {canUpdateUnitsOfMeasure && (
                  <button
                    type="button"
                    onClick={() => removeUnit(index)}
                    className="text-red-500 hover:text-red-700 hover:cursor-pointer"
                    aria-label={`Remove unit ${unit}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {canUpdateUnitsOfMeasure && (
            <div className="mt-6 flex justify-end">
              <SaveButton saving={saving} onClick={handleSaveUnitsOfMeasure} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 hover:cursor-pointer"
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {saving ? 'Saving...' : 'Save Settings'}
    </button>
  );
}
