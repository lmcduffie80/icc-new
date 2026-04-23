/**
 * ShipBoss shipping rate client
 *
 * Calls the ShipBoss API to return live carrier rates for both parcel
 * and LTL freight shipments.
 *
 * - Shipments ≤ 150 lbs  → POST /get-rates (parcel carriers)
 * - Shipments > 150 lbs  → POST /get-freight-rates (LTL freight carriers)
 *
 * Authentication: Bearer token via SHIPPING_ICC env var.
 * SHIPPING_ICC must be set — no flat-rate fallback is used.
 */

import { createHash } from 'crypto';
import { redis } from '@/lib/rate-limit';

const SHIPBOSS_BASE_URL = 'https://ship.shipboss.io/api/public/v1';

/** Cache TTL in seconds (10 minutes) */
const QUOTE_CACHE_TTL = 600;

export interface FreightShipToAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
}

export interface FreightShipFromAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
}

export interface FreightShipItem {
  name?: string;
  unitOfMeasure?: string | null;
  quantity: number;
  /** Weight in lbs per unit — if provided, overrides the unit-of-measure estimate */
  weightLbs?: number;
  /** Carton dimensions in inches (from product record) */
  cartonLength?: number | null;
  cartonWidth?: number | null;
  cartonHeight?: number | null;
  /** Carton weight in lbs (from product record) — takes precedence over weightLbs */
  cartonWeightLbs?: number | null;
  /** NMFC item code for LTL freight quoting (e.g. "46120") */
  nmfcNumber?: string | null;
  /** LTL freight class (e.g. "55", "65", "70") */
  freightClass?: string | null;
}

export interface FreightRate {
  /** Carrier name, e.g. "ODFL", "EXLA", "UPS" */
  carrier: string;
  /** Service level name, e.g. "Standard Rate", "LTL Standard Transit" */
  service: string;
  /** Human-readable estimated delivery, e.g. "Fri, May 3" */
  transitDays: string;
  /** Raw est_delivery_date from ShipBoss — used for fastest-delivery comparison */
  estDeliveryDate?: string;
  /** Total shipping price in USD */
  price: number;
  /** ShipBoss quote ID — present for LTL freight, absent for parcel */
  quoteId: string;
  /** Shipment type: 'parcel' uses create-label, 'ltl' uses quote_id booking */
  type: 'parcel' | 'ltl';
  /** Service code from ShipBoss (parcel only, e.g. "PRIORITY_OVERNIGHT") */
  serviceCode?: string;
}

/** ShipBoss parcel rate object (from get-rates endpoint) */
interface ShipBossParcelRate {
  carrier_name: string;
  service_name: string;
  service_code: string;
  estimated_delivery_date: string;
  shipment_total: number;
}

/** ShipBoss parcel response */
interface ShipBossParcelResponse {
  status: string;
  data?: {
    rates?: ShipBossParcelRate[];
    errors?: string[];
  };
  message?: string;
}

/** ShipBoss LTL freight rate object */
interface ShipBossFreightRate {
  quote_id: string;
  carrier: string;
  service_name: string;
  est_delivery_date: string;
  shipment_total: number;
}

/** ShipBoss LTL freight response */
interface ShipBossFreightResponse {
  status: string;
  data?: {
    rates?: ShipBossFreightRate[];
    errors?: string[];
  };
  message?: string;
}

/**
 * Returns true when the ShipBoss API is configured in the environment.
 */
export function isShipBossConfigured(): boolean {
  return !!process.env.SHIPPING_ICC;
}

/**
 * Thrown when a shipment is too heavy for parcel carriers and ShipBoss
 * LTL returns no rates (e.g. no freight carriers connected).
 */
export class FreightTooHeavyError extends Error {
  public readonly weightLbs: number;
  constructor(weightLbs: number) {
    super(
      `Shipment weight of ${weightLbs.toLocaleString()} lbs exceeds parcel carrier limits (150 lbs max). ` +
        `This order requires LTL or TL freight quoting.`
    );
    this.name = 'FreightTooHeavyError';
    this.weightLbs = weightLbs;
  }
}

/**
 * Estimate total shipment weight in lbs based on product unit of measure.
 */
export function estimateWeightLbs(items: FreightShipItem[]): number {
  let totalLbs = 0;

  for (const item of items) {
    if (item.cartonWeightLbs) {
      totalLbs += item.cartonWeightLbs * item.quantity;
      continue;
    }
    if (item.weightLbs) {
      totalLbs += item.weightLbs * item.quantity;
      continue;
    }

    const uom = item.unitOfMeasure?.toLowerCase() ?? '';
    const name = item.name?.toLowerCase() ?? '';
    const qty = item.quantity;

    if (uom.includes('tote') || name.includes('tote') || uom.includes('tank')) {
      totalLbs += 2200 * qty;
    } else if (uom.includes('case') || name.includes('2x2.5')) {
      totalLbs += 45 * qty;
    } else if (uom.includes('gallon') || uom === 'gal') {
      totalLbs += 9 * qty;
    } else if (uom.includes('quart') || uom === 'qt') {
      totalLbs += 2.5 * qty;
    } else if (uom.includes('pint') || uom === 'pt') {
      totalLbs += 1.25 * qty;
    } else if (uom.includes('ounce') || uom === 'oz') {
      totalLbs += 0.0625 * qty;
    } else {
      totalLbs += 5 * qty;
    }
  }

  return Math.max(0.1, totalLbs);
}

/**
 * Build the ShipBoss address object from our internal address type.
 */
function buildAddress(addr: FreightShipFromAddress | FreightShipToAddress, isResidential = false) {
  return {
    address_1: addr.street,
    city: addr.city,
    state: addr.state,
    zip: addr.zip,
    country: addr.country ?? 'US',
    ...(isResidential ? { is_residential: true } : {}),
  };
}

/**
 * Call ShipBoss parcel endpoint for shipments ≤ 150 lbs.
 */
async function getParcelRates(
  items: FreightShipItem[],
  shipTo: FreightShipToAddress,
  shipFrom: FreightShipFromAddress,
  liftgateRequired = false
): Promise<FreightRate[]> {
  const token = process.env.SHIPPING_ICC!;
  const weightLbs = estimateWeightLbs(items);

  // Use carton dimensions from the first non-tote item that has them
  const itemWithDims = items.find((i) => {
    const uom = i.unitOfMeasure?.toLowerCase() ?? '';
    const isTote = uom.includes('tote') || uom.includes('tank');
    return !isTote && i.cartonLength && i.cartonWidth && i.cartonHeight;
  });
  const length = itemWithDims?.cartonLength ?? 12;
  const width = itemWithDims?.cartonWidth ?? 12;
  const height = itemWithDims?.cartonHeight ?? 12;

  const requestBody = {
    addresses: {
      from: buildAddress(shipFrom),
      to: buildAddress(shipTo),
    },
    packages: [
      {
        weight: Math.max(1, Math.round(weightLbs)),
        length: Math.round(length),
        width: Math.round(width),
        height: Math.round(height),
        ...(liftgateRequired ? { liftgate: true } : {}),
      },
    ],
    ship_date: new Date().toISOString().split('T')[0],
  };

  console.log('[freight-quote] Sending parcel rate request:', JSON.stringify(requestBody));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  let response: Response;
  try {
    response = await fetch(`${SHIPBOSS_BASE_URL}/get-rates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[freight-quote] ShipBoss parcel API error ${response.status}:`, errorText);
    throw new Error(`ShipBoss parcel API error ${response.status}: ${errorText}`);
  }

  const data: ShipBossParcelResponse = await response.json();

  if (data.status !== 'success' || !data.data?.rates?.length) {
    console.warn('[freight-quote] ShipBoss parcel returned no rates. Full response:', JSON.stringify(data));
    throw new Error('ShipBoss returned no parcel rates for this shipment');
  }

  return data.data.rates
    .map((r) => ({
      carrier: r.carrier_name,
      service: r.service_name,
      transitDays: r.estimated_delivery_date || 'Estimated delivery varies',
      estDeliveryDate: r.estimated_delivery_date || undefined,
      price: r.shipment_total,
      quoteId: `parcel:${r.carrier_name}:${r.service_code}`,
      type: 'parcel' as const,
      serviceCode: r.service_code,
    }))
    .filter((r) => !isNaN(r.price) && r.price > 0)
    .sort((a, b) => {
      if (a.estDeliveryDate && b.estDeliveryDate) {
        return new Date(a.estDeliveryDate).getTime() - new Date(b.estDeliveryDate).getTime();
      }
      if (a.estDeliveryDate) return -1;
      if (b.estDeliveryDate) return 1;
      return 0;
    })
    .slice(0, 5);
}

/**
 * Call ShipBoss LTL freight endpoint for shipments > 150 lbs.
 * Returns empty array if no rates are available.
 */
async function getFreightLtlRates(
  items: FreightShipItem[],
  shipTo: FreightShipToAddress,
  shipFrom: FreightShipFromAddress,
  liftgateRequired = false
): Promise<FreightRate[]> {
  const token = process.env.SHIPPING_ICC!;

  // Build one package per item type, using carton dimensions and freight class
  const packages = items.map((item) => {
    const itemWeightLbs = item.cartonWeightLbs
      ? item.cartonWeightLbs
      : item.weightLbs
        ? item.weightLbs
        : estimateWeightLbs([{ ...item, quantity: 1 }]);

    const freightClass = item.freightClass ? parseFloat(item.freightClass) : 70;

    return {
      weight: Math.max(1, Math.round(itemWeightLbs)),
      length: item.cartonLength ? Math.round(item.cartonLength) : 48,
      width: item.cartonWidth ? Math.round(item.cartonWidth) : 40,
      height: item.cartonHeight ? Math.round(item.cartonHeight) : 48,
      quantity: item.quantity,
      commodity: item.name ?? 'Agricultural Product',
      freight_class: freightClass,
      ...(liftgateRequired ? { liftgate_delivery: true } : {}),
    };
  });

  const requestBody = {
    addresses: {
      from: buildAddress(shipFrom),
      to: buildAddress(shipTo),
    },
    packages,
    package_type: 'PLT',
    pickup: {
      date: new Date().toISOString().split('T')[0],
    },
  };

  console.log('[freight-quote] Sending LTL freight rate request:', JSON.stringify(requestBody));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${SHIPBOSS_BASE_URL}/get-freight-rates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Auth failures should propagate — they indicate a misconfiguration, not a carrier-level issue
      if (response.status === 401 || response.status === 403) {
        console.error(`[freight-quote] ShipBoss LTL auth error ${response.status}:`, errorText);
        throw new Error(`ShipBoss LTL auth error ${response.status}: ${errorText}`);
      }
      // Other 4xx/5xx: log and return empty — carrier-level errors mean no rates available
      console.warn(`[freight-quote] ShipBoss LTL API error ${response.status}:`, errorText);
      return [];
    }

    const data: ShipBossFreightResponse = await response.json();

    if (data.status !== 'success' || !data.data?.rates?.length) {
      console.warn('[freight-quote] ShipBoss LTL returned no rates. Full response:', JSON.stringify(data));
      return [];
    }

    return data.data.rates
      .map((r) => ({
        carrier: r.carrier,
        service: r.service_name,
        transitDays: r.est_delivery_date || 'Estimated delivery varies',
        estDeliveryDate: r.est_delivery_date || undefined,
        price: r.shipment_total,
        quoteId: r.quote_id,
        type: 'ltl' as const,
      }))
      .filter((r) => !isNaN(r.price) && r.price > 0)
      .sort((a, b) => {
        if (a.estDeliveryDate && b.estDeliveryDate) {
          return new Date(a.estDeliveryDate).getTime() - new Date(b.estDeliveryDate).getTime();
        }
        if (a.estDeliveryDate) return -1;
        if (b.estDeliveryDate) return 1;
        return 0;
      })
      .slice(0, 5);
  } catch (err) {
    // Re-throw network errors (timeouts, DNS failures) so they surface as retryable errors
    // rather than being silently treated as "no rates available"
    if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('fetch'))) {
      throw err;
    }
    console.warn('[freight-quote] ShipBoss LTL quote failed:', err);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Build a deterministic Redis cache key for a ShipBoss quote request.
 *
 * Key format: `shipboss:quote:{zip}:{sha256-of-sorted-items}`
 *
 * Items are sorted by productId so cart order doesn't affect the key.
 * Only productId and quantity are included — dimensions and names are
 * derived from the product record and don't change between requests.
 */
function buildQuoteCacheKey(
  shipTo: FreightShipToAddress,
  items: FreightShipItem[]
): string {
  const itemsPayload = [...items]
    .sort((a, b) => {
      const aId = (a as FreightShipItem & { productId?: string }).productId ?? a.name ?? '';
      const bId = (b as FreightShipItem & { productId?: string }).productId ?? b.name ?? '';
      return aId.localeCompare(bId);
    })
    .map((i) => {
      const id = (i as FreightShipItem & { productId?: string }).productId ?? i.name ?? 'unknown';
      return `${id}:${i.quantity}`;
    })
    .join(',');

  const hash = createHash('sha256').update(itemsPayload).digest('hex').slice(0, 16);
  return `shipboss:quote:${shipTo.zip}:${hash}`;
}

/**
 * Fetch ShipBoss rates, using Redis to cache results for 10 minutes.
 *
 * On a cache hit the result is returned immediately (~5 ms).
 * On a cache miss the live ShipBoss API is called and the result is
 * stored in Redis before returning.
 *
 * Falls back to a direct live call if Redis is unavailable.
 */
export async function getFreightQuotesCached(
  items: FreightShipItem[],
  shipTo: FreightShipToAddress,
  shipFrom?: FreightShipFromAddress,
  liftgateRequired = false
): Promise<FreightRate[]> {
  if (redis) {
    const cacheKey = buildQuoteCacheKey(shipTo, items);
    try {
      const cached = await redis.get<FreightRate[]>(cacheKey);
      if (cached) {
        console.log(`[freight-quote] Cache hit for key ${cacheKey}`);
        return cached;
      }
    } catch (err) {
      console.warn('[freight-quote] Redis cache read failed, falling back to live call:', err);
    }

    const rates = await getFreightQuotes(items, shipTo, shipFrom, liftgateRequired);

    try {
      await redis.setex(cacheKey, QUOTE_CACHE_TTL, JSON.stringify(rates));
    } catch (err) {
      console.warn('[freight-quote] Redis cache write failed:', err);
    }

    return rates;
  }

  return getFreightQuotes(items, shipTo, shipFrom, liftgateRequired);
}

export interface FreightLabelContact {
  name: string;
  phone: string;
  email?: string;
}

export interface FreightLabelInput {
  quoteId: string;
  from: FreightLabelContact;
  to: FreightLabelContact;
  /** Pickup window ready time in HH:MM format (defaults to "08:00") */
  pickupReadyTime?: string;
  /** Pickup window close time in HH:MM format (defaults to "17:00") */
  pickupCloseTime?: string;
}

export interface FreightLabelResult {
  trackingNumber: string;
  labelUrl?: string;
  billOfLadingUrl?: string;
  estimatedCost?: number;
}

interface ShipBossFreightLabelItem {
  tracking_number: string;
  label?: { link?: string; expires?: string };
  bill_of_lading?: { link?: string; expires?: string };
  estimated_cost?: number;
}

interface ShipBossFreightLabelResponse {
  status: string;
  data?: ShipBossFreightLabelItem[];
  message?: string;
}

/**
 * Book an LTL freight shipment via the ShipBoss create-freight-label endpoint.
 *
 * Requires a quote_id returned from get-freight-rates. The full origin/destination
 * addresses are already embedded in the quote — only contact name/phone are needed here.
 */
export async function bookFreightLabel(input: FreightLabelInput): Promise<FreightLabelResult> {
  const token = process.env.SHIPPING_ICC;
  if (!token) {
    throw new Error('ShipBoss is not configured. Set SHIPPING_ICC to enable freight label creation.');
  }

  const requestBody = {
    addresses: {
      from: {
        name: input.from.name,
        phone: input.from.phone,
        ...(input.from.email ? { contact_email: input.from.email } : {}),
      },
      to: {
        name: input.to.name,
        phone: input.to.phone,
        ...(input.to.email ? { contact_email: input.to.email } : {}),
      },
    },
    quote_id: input.quoteId,
    pickup: {
      ready_time: input.pickupReadyTime ?? '08:00',
      close_time: input.pickupCloseTime ?? '17:00',
    },
    test: process.env.NODE_ENV !== 'production',
  };

  console.log('[freight-quote] Creating freight label:', JSON.stringify(requestBody));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let response: Response;
  try {
    response = await fetch(`${SHIPBOSS_BASE_URL}/create-freight-label`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  console.log(`[freight-quote] create-freight-label response (${response.status}):`, text.slice(0, 500));

  if (text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
    throw new Error(
      'ShipBoss returned an HTML error page for create-freight-label. This may indicate a service outage.'
    );
  }

  let parsed: ShipBossFreightLabelResponse;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `ShipBoss create-freight-label returned unexpected response (HTTP ${response.status}): ${text.slice(0, 200)}`
    );
  }

  if (!response.ok || parsed.status !== 'success') {
    throw new Error(
      `ShipBoss create-freight-label failed (${response.status}): ${parsed.message ?? text}`
    );
  }

  const item = Array.isArray(parsed.data) ? parsed.data[0] : undefined;
  if (!item?.tracking_number) {
    throw new Error(
      `ShipBoss create-freight-label succeeded but returned no tracking number. Response: ${text.slice(0, 300)}`
    );
  }

  return {
    trackingNumber: item.tracking_number,
    labelUrl: item.label?.link,
    billOfLadingUrl: item.bill_of_lading?.link,
    estimatedCost: item.estimated_cost,
  };
}

/**
 * Fetch live shipping rates from ShipBoss.
 *
 * - Shipments ≤ 150 lbs use the parcel endpoint.
 * - Shipments > 150 lbs use the LTL freight endpoint.
 * - Throws FreightTooHeavyError if LTL returns no rates.
 *
 * @param items            Cart items (used for weight/dimension estimation)
 * @param shipTo           Customer's shipping address
 * @param shipFrom         Fulfilling warehouse address
 * @param liftgateRequired Whether the delivery requires a liftgate service
 */
export async function getFreightQuotes(
  items: FreightShipItem[],
  shipTo: FreightShipToAddress,
  shipFrom?: FreightShipFromAddress,
  liftgateRequired = false
): Promise<FreightRate[]> {
  if (!isShipBossConfigured()) {
    throw new Error('ShipBoss is not configured. Set SHIPPING_ICC to enable shipping quotes.');
  }

  if (!shipFrom) {
    throw new Error('ShipBoss is configured but no ship-from warehouse address could be resolved');
  }

  const weightLbs = estimateWeightLbs(items);

  if (weightLbs > 150) {
    const ltlRates = await getFreightLtlRates(items, shipTo, shipFrom, liftgateRequired);
    if (ltlRates.length > 0) {
      return ltlRates;
    }
    throw new FreightTooHeavyError(Math.round(weightLbs));
  }

  return getParcelRates(items, shipTo, shipFrom, liftgateRequired);
}
