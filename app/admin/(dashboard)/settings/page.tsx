import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { SettingsForm } from './settings-form';

interface Setting {
  key: string;
  value: object;
}

interface ShippingMethod {
  id: string;
  name: string;
  price: number;
  days: string;
}

// New format: array of shipping methods
type ShippingSettings = ShippingMethod[];

// Old format for backward compatibility
interface LegacyShippingSettings {
  [key: string]: { name: string; price: number; days: string } | undefined;
}

// Default shipping settings if not configured
const DEFAULT_SHIPPING: ShippingSettings = [
  { id: 'standard', name: 'Standard Shipping', price: 9.99, days: '5-7' },
  { id: 'express', name: 'Express Shipping', price: 19.99, days: '2-3' },
];

/**
 * Normalize shipping settings from old format (object) to new format (array)
 */
function normalizeShippingSettings(raw: unknown): ShippingSettings {
  if (!raw) return DEFAULT_SHIPPING;

  // If already an array, return as-is
  if (Array.isArray(raw)) return raw as ShippingSettings;

  // Convert old object format to array
  const obj = raw as LegacyShippingSettings;
  const methods: ShippingSettings = [];

  for (const [id, method] of Object.entries(obj)) {
    if (method && typeof method === 'object' && 'name' in method) {
      methods.push({
        id,
        name: method.name || id,
        price: method.price || 0,
        days: method.days || '',
      });
    }
  }

  return methods.length > 0 ? methods : DEFAULT_SHIPPING;
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

async function getSettings() {
  const settings = await query<Setting>('SELECT * FROM site_settings');

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

  const result: {
    shipping?: ShippingSettings;
    tax?: TaxSettings;
    payment?: PaymentSettings;
    categories?: CategoriesSettings;
    units_of_measure?: UnitsOfMeasureSettings;
    store_info?: StoreInfoSettings;
    truckload?: TruckloadSettings;
  } = {};

  for (const setting of settings) {
    if (setting.key === 'shipping') {
      // Normalize shipping settings for backward compatibility
      result.shipping = normalizeShippingSettings(setting.value);
    } else {
      (result as Record<string, unknown>)[setting.key] = setting.value;
    }
  }

  return result;
}

export default async function SettingsPage() {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('settings.view')) {
    redirect('/admin');
  }

  const settings = await getSettings();

  const canUpdateShipping = session.permissions.includes('settings.update_shipping');
  const canUpdateTax = session.permissions.includes('settings.update_tax');
  const canUpdatePayment = session.permissions.includes('settings.update_payment');
  const canUpdateCategories = session.permissions.includes('settings.update_categories');
  const canUpdateUnitsOfMeasure = session.permissions.includes('settings.update_units_of_measure');
  const canUpdateStoreInfo = session.permissions.includes('settings.update_store_info');

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Site Settings</h1>
        <p className="mt-1 text-slate-500">Configure store information, shipping, tax, payment, and category settings</p>
      </div>

      <SettingsForm
        settings={settings}
        canUpdateShipping={canUpdateShipping}
        canUpdateTax={canUpdateTax}
        canUpdatePayment={canUpdatePayment}
        canUpdateCategories={canUpdateCategories}
        canUpdateUnitsOfMeasure={canUpdateUnitsOfMeasure}
        canUpdateStoreInfo={canUpdateStoreInfo}
      />
    </div>
  );
}

