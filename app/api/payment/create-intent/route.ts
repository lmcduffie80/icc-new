import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { pool, queryOne, query } from '@/lib/db';
import { rateLimiters, checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { paymentIntentCreateSchema } from '@/lib/validation';
import { validateOrder } from '@/lib/order-validation';
import { createOrGetStripeCustomer, createPaymentIntent } from '@/lib/stripe';
import { calculateTax, getTaxRateForState } from '@/lib/tax';
import { getTenantById, type Tenant } from '@/lib/tenant';
import { calculateApplicationFeeCents } from '@/lib/stripe-connect';

// Shipping method interface (currently unused but kept for future use)
/* interface ShippingMethod {
  id: string;
  name: string;
  price: number;
  days: string;
}

// New format: array of shipping methods
type ShippingSettings = ShippingMethod[]; */

// Old format for backward compatibility (currently unused but kept for future migration needs)
/* interface LegacyShippingSettings {
  [key: string]: { name: string; price: number; days: string } | undefined;
}

// Default shipping settings if not configured
const DEFAULT_SHIPPING: ShippingSettings = [
  { id: 'standard', name: 'Standard Shipping', price: 9.99, days: '5-7' },
  { id: 'express', name: 'Express Shipping', price: 19.99, days: '2-3' },
]; */

// Payment settings interface
interface PaymentSettings {
  stripe_enabled: boolean;
  min_order_amount: number;
  max_order_amount: number;
  allow_saved_cards: boolean;
  send_receipt_emails: boolean;
}

// Default payment settings
const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  stripe_enabled: true,
  min_order_amount: 10,
  max_order_amount: 1000000, // Increased to $1M to allow large freight orders
  allow_saved_cards: true,
  send_receipt_emails: true,
};

/**
 * Get payment settings with defaults for missing fields
 * Ensures max_order_amount is at least the default to allow large freight orders
 */
function getPaymentSettings(raw: unknown): PaymentSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_PAYMENT_SETTINGS;
  const merged = { ...DEFAULT_PAYMENT_SETTINGS, ...(raw as Partial<PaymentSettings>) };
  // Ensure max_order_amount is at least the default (for large freight orders)
  if (merged.max_order_amount < DEFAULT_PAYMENT_SETTINGS.max_order_amount) {
    merged.max_order_amount = DEFAULT_PAYMENT_SETTINGS.max_order_amount;
  }
  return merged;
}

/**
 * Normalize shipping settings from old format (object) to new format (array)
 * Currently unused but kept for future backward compatibility
 */
/* function normalizeShippingSettings(raw: unknown): ShippingSettings {
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
} */

/**
 * POST /api/payment/create-intent
 * Create a Stripe payment intent for checkout
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  
  try {
    // Rate limiting - very relaxed for checkout operations to allow testing
    // In development, be more lenient; in production, use standard limits
    const isDevelopment = process.env.NODE_ENV === 'development';
    const limiter = isDevelopment ? null : rateLimiters.relaxed; // Disable rate limiting in development
    
    if (limiter) {
      const rateLimitResult = await checkRateLimit(request, limiter);
      if (!rateLimitResult.success) {
        securityLogger.logRateLimitExceeded(ip, '/api/payment/create-intent', 'POST');
        return NextResponse.json(
          { 
            error: 'Too many requests',
            message: 'Please wait a moment and try again. If you\'re testing, wait a few seconds between attempts.',
          },
          { status: 429, headers: { 'Retry-After': '10' } }
        );
      }
    }

    // Authentication required
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch payment settings
    const paymentSettingsResult = await queryOne<{ value: unknown }>(
      'SELECT value FROM site_settings WHERE key = $1',
      ['payment']
    );
    const paymentSettings = getPaymentSettings(paymentSettingsResult?.value);

    // Check if Stripe payments are enabled
    if (!paymentSettings.stripe_enabled) {
      securityLogger.logSuspiciousActivity(
        'payment_stripe_disabled',
        ip,
        { userId: session.user.id },
        session.user.id
      );
      return NextResponse.json(
        { error: 'Payments are currently disabled' },
        { status: 503 }
      );
    }

    // Resolve the tenant for Stripe Connect routing, if this request came from a
    // tenant storefront. `/api/*` routes bypass the tenant-slug middleware entirely,
    // so same-origin client fetches pass `?tenant_id=` explicitly (see
    // getRequiredTenantId in lib/tenant.ts). A missing tenant_id is expected and
    // valid here (e.g. ICC's own checkout), so we read it directly rather than
    // using getRequiredTenantId/MissingTenantError.
    const tenantIdParam = request.nextUrl.searchParams.get('tenant_id');
    let tenant: Tenant | null = null;
    if (tenantIdParam) {
      tenant = await getTenantById(tenantIdParam);
      if (!tenant) {
        // A stale/bad tenant_id shouldn't break checkout — fall back to the
        // direct-charge path below — but it does suggest a client bug worth flagging.
        console.warn(
          `[Payment Intent] tenant_id "${tenantIdParam}" did not resolve to a tenant; falling back to direct-charge behavior`
        );
      }
    }

    // Tenant has started Connect onboarding but can't accept charges yet. Block
    // checkout instead of silently falling back to a direct charge, which would put
    // the customer's money in ICC's own balance with no automated way to route it
    // to the tenant later.
    if (tenant?.stripeConnectAccountId && !tenant.stripeConnectChargesEnabled) {
      return NextResponse.json(
        { error: "This store's payment processing isn't fully set up yet. Please try again later." },
        { status: 503 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = paymentIntentCreateSchema.safeParse(body);
    
    if (!validation.success) {
      securityLogger.logValidationFailure(
        '/api/payment/create-intent',
        ip,
        'Invalid payment intent data',
        'POST'
      );
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
        },
        { status: 400 }
      );
    }

    const { items, deliveryFee, tax, deliveryMethod, state, freightQuoteId, shippingCarrier, liftgateFee } = validation.data;

    // Convert items to validation format
    const orderItems = items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      price: item.price,
      name: item.name,
      image: item.image,
      unitOfMeasure: item.unitOfMeasure,
    }));

    // Calculate subtotal (items only) for validation
    // validateOrder only validates item prices, not delivery/tax
    const clientSubtotal = validation.data.amount - deliveryFee - tax;

    // Server-side order validation (price verification)
    const orderValidation = await validateOrder(pool, orderItems, clientSubtotal, state);
    
    // Only fail on actual errors (not inventory warnings - we allow partial fulfillment)
    const actualErrors = orderValidation.errors.filter(error => 
      !error.includes('Insufficient inventory') && !error.includes('Partial inventory')
    );
    
    if (actualErrors.length > 0) {
      securityLogger.logSuspiciousActivity(
        'payment_validation_failed',
        ip,
        {
          userId: session.user.id,
          errors: actualErrors,
          clientTotal: orderValidation.clientTotal,
          serverTotal: orderValidation.serverTotal,
        },
        session.user.id
      );
      
      return NextResponse.json(
        {
          error: 'Order validation failed',
          details: actualErrors,
          validationDetails: {
            errors: actualErrors,
            warnings: orderValidation.warnings,
            items: orderValidation.items.map(item => ({
              productId: item.productId,
              name: item.name,
              quantity: item.quantity,
              availableInventory: item.inventory,
              inventoryAvailable: item.inventoryAvailable,
              nextAvailableQuantity: item.nextAvailableQuantity,
              nextAvailableDate: item.nextAvailableDate,
              nextAvailableWarehouseName: item.nextAvailableWarehouseName,
              canFulfillPartially: item.canFulfillPartially,
              partialQuantity: item.partialQuantity,
              backorderQuantity: item.backorderQuantity,
            })),
          },
        },
        { status: 400 }
      );
    }

    // Check for price mismatch
    if (orderValidation.priceMismatch) {
      securityLogger.logSuspiciousActivity(
        'payment_price_mismatch',
        ip,
        {
          userId: session.user.id,
          clientTotal: orderValidation.clientTotal,
          serverTotal: orderValidation.serverTotal,
        },
        session.user.id
      );
      
      return NextResponse.json(
        {
          error: 'Price mismatch detected',
          message: 'Product prices have changed. Please review your cart.',
          clientTotal: orderValidation.clientTotal,
          serverTotal: orderValidation.serverTotal,
        },
        { status: 400 }
      );
    }

    // Check if any ordered product is restricted-use; if so, verify the user has a valid license
    const productIds = orderItems.map((item) => item.productId);
    const restrictedProducts = await query<{ id: string }>(
      `SELECT id FROM products WHERE id = ANY($1) AND restricted_use = true AND deleted_at IS NULL`,
      [productIds]
    );

    if (restrictedProducts.length > 0) {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const recentLicense = await queryOne<{ id: string }>(
        `SELECT id FROM user_licenses
         WHERE user_id = $1 AND uploaded_at > $2
         ORDER BY uploaded_at DESC LIMIT 1`,
        [session.user.id, oneYearAgo.toISOString()]
      );

      if (!recentLicense) {
        securityLogger.logSuspiciousActivity(
          'payment_missing_restricted_use_license',
          ip,
          { userId: session.user.id, restrictedProductIds: restrictedProducts.map((p) => p.id) },
          session.user.id
        );
        return NextResponse.json(
          {
            error: 'Pesticide applicator license required',
            message:
              'Your order contains Restricted Use Pesticides. Please upload your current applicator license during checkout.',
          },
          { status: 400 }
        );
      }
    }

    // Calculate total with server-validated prices
    const subtotal = orderValidation.serverTotal;
    
    // Recalculate tax server-side for verification
    const serverTax = await calculateTax(subtotal, state);
    const taxRate = await getTaxRateForState(state);
    
    // Verify tax amount matches server calculation (allow 1 cent difference for rounding)
    if (Math.abs(serverTax - tax) > 0.01) {
      securityLogger.logSuspiciousActivity(
        'payment_tax_mismatch',
        ip,
        {
          userId: session.user.id,
          clientTax: tax,
          serverTax,
          state,
          subtotal,
        },
        session.user.id
      );

      return NextResponse.json(
        {
          error: 'Tax calculation mismatch',
          message: 'Tax amount verification failed. Please refresh and try again.',
          clientTax: tax,
          serverTax,
        },
        { status: 400 }
      );
    }

    // Calculate shipping fee server-side based on product types
    // Shipping is now calculated based on product types (totes, cases, etc.)
    // instead of configured shipping options
    // Fetch unit of measure from database for accurate calculation
    let serverCalculatedShipping = 0;
    let warehouseCount = 1;
    try {
      const itemsWithUnitOfMeasure = await Promise.all(
        orderItems.map(async (item) => {
          const product = await queryOne<{ unit_of_measure: string | null; name: string }>(
            'SELECT unit_of_measure, name FROM products WHERE id = $1',
            [item.productId]
          );
          
          if (!product) {
            console.error(`Product not found: ${item.productId}`);
            return {
              unitOfMeasure: null,
              name: item.name || '',
              quantity: item.quantity,
            };
          }
          
          return {
            unitOfMeasure: product.unit_of_measure || null,
            name: item.name || product.name || '',
            quantity: item.quantity,
          };
        })
      );
      
      const { calculateShippingFee } = await import('@/lib/shipping-calculation');
      const baseShippingFee = calculateShippingFee(itemsWithUnitOfMeasure);
      
      // Estimate warehouse count for this order
      try {
        const productIds = [...new Set(orderItems.map(item => item.productId))];
        const warehouseInventories = await query<{
          warehouse_id: string;
          product_id: string;
          inventory_count: number;
        }>(
          `SELECT 
            pw.warehouse_id,
            pw.product_id,
            pw.inventory_count
          FROM product_warehouses pw
          WHERE pw.product_id = ANY($1)
            AND pw.inventory_count > 0
          ORDER BY pw.product_id, pw.inventory_count DESC`,
          [productIds]
        );

        // Group by warehouse to see which warehouses have inventory
        const warehousesWithInventory = new Set<string>();
        
        for (const item of orderItems) {
          const productWarehouses = warehouseInventories.filter(
            wi => wi.product_id === item.productId && wi.inventory_count > 0
          );
          
          for (const pw of productWarehouses) {
            warehousesWithInventory.add(pw.warehouse_id);
          }
        }

        // Check if we can fulfill all items from a single warehouse
        let canFulfillFromSingleWarehouse = true;
        
        if (warehousesWithInventory.size > 1) {
          const productWarehouseMap = new Map<string, Set<string>>();
          
          for (const item of orderItems) {
            const productWarehouses = warehouseInventories
              .filter(wi => wi.product_id === item.productId && wi.inventory_count >= item.quantity)
              .map(wi => wi.warehouse_id);
            
            if (productWarehouses.length === 0) {
              canFulfillFromSingleWarehouse = false;
              break;
            }
            
            productWarehouseMap.set(item.productId, new Set(productWarehouses));
          }
          
          if (canFulfillFromSingleWarehouse && productWarehouseMap.size > 0) {
            const commonWarehouses = Array.from(productWarehouseMap.values())
              .reduce((common, warehouses) => {
                if (common.size === 0) return warehouses;
                return new Set([...common].filter(w => warehouses.has(w)));
              }, new Set<string>());
            
            canFulfillFromSingleWarehouse = commonWarehouses.size > 0;
          }
        }

        warehouseCount = canFulfillFromSingleWarehouse ? 1 : Math.max(1, warehousesWithInventory.size);
      } catch (warehouseError) {
        console.error('Error estimating warehouse count:', warehouseError);
        // Default to 1 if estimation fails
        warehouseCount = 1;
      }
      
      // Multiply shipping fee by warehouse count
      serverCalculatedShipping = Math.round(baseShippingFee * warehouseCount * 100) / 100;
    } catch (error) {
      console.error('Error calculating shipping fee:', error);
      securityLogger.logError('Shipping calculation failed', error, ip);
      // If calculation fails, reject the request
      return NextResponse.json(
        {
          error: 'Shipping calculation failed',
          message: 'Unable to calculate shipping cost. Please try again.',
        },
        { status: 500 }
      );
    }

    // Verify delivery fee matches server-calculated shipping (allow 1 cent difference for rounding)
    // Skip check when: (a) freightQuoteId provided (live ShipBoss rate), or
    //                  (b) deliveryMethod starts with "Truckload" (distance-calculated server-side rate)
    const priceMatches = (freightQuoteId || deliveryMethod?.startsWith('Truckload'))
      ? true
      : Math.abs(serverCalculatedShipping - deliveryFee) <= 0.01;
    
    if (!priceMatches) {
      securityLogger.logSuspiciousActivity(
        'payment_delivery_fee_mismatch',
        ip,
        {
          userId: session.user.id,
          clientDeliveryFee: deliveryFee,
          serverDeliveryFee: serverCalculatedShipping,
          deliveryMethod,
        },
        session.user.id
      );

      return NextResponse.json(
        {
          error: 'Delivery fee mismatch',
          message: 'Shipping cost has changed. Please refresh and try again.',
          clientDeliveryFee: deliveryFee,
          serverDeliveryFee: serverCalculatedShipping,
        },
        { status: 400 }
      );
    }

    const total = subtotal + deliveryFee + serverTax;

    // Validate against min/max order amounts
    if (total < paymentSettings.min_order_amount) {
      securityLogger.logValidationFailure(
        '/api/payment/create-intent',
        ip,
        `Order total $${total.toFixed(2)} below minimum $${paymentSettings.min_order_amount}`,
        'POST'
      );
      return NextResponse.json(
        {
          error: 'Order total too low',
          message: `Minimum order amount is $${paymentSettings.min_order_amount.toFixed(2)}`,
          minAmount: paymentSettings.min_order_amount,
          currentTotal: total,
        },
        { status: 400 }
      );
    }

    // Log the max order amount for debugging
    console.log('[Payment Intent] Max order amount:', paymentSettings.max_order_amount);
    console.log('[Payment Intent] Order total:', total);
    console.log('[Payment Intent] Payment settings:', JSON.stringify(paymentSettings, null, 2));
    
    // Only enforce max order amount if it's reasonable (not the old $10k limit)
    // Allow orders up to $1M for freight orders
    const effectiveMaxAmount = Math.max(paymentSettings.max_order_amount, 1000000);
    
    if (total > effectiveMaxAmount) {
      securityLogger.logSuspiciousActivity(
        'payment_exceeds_max_amount',
        ip,
        {
          userId: session.user.id,
          total,
          maxAmount: paymentSettings.max_order_amount,
        },
        session.user.id
      );
      return NextResponse.json(
        {
          error: 'Order total too high',
          message: `Maximum order amount is $${effectiveMaxAmount.toFixed(2)}. Please contact us for large orders.`,
          maxAmount: effectiveMaxAmount,
          currentTotal: total,
          configuredMax: paymentSettings.max_order_amount,
        },
        { status: 400 }
      );
    }

    // Create or get Stripe customer
    const customerId = await createOrGetStripeCustomer(
      session.user.id,
      session.user.email,
      session.user.name || undefined
    );

    // If the tenant has a live Connect account, route this as a destination charge.
    // The amount-in-cents used for application_fee_amount MUST match the cents value
    // createPaymentIntent will itself derive from `total`, so we compute it once here
    // and thread it through rather than letting each side round independently.
    const canRouteToConnect = !!(tenant?.stripeConnectAccountId && tenant.stripeConnectChargesEnabled);
    const amountCents = Math.round(total * 100);
    const connectOptions = canRouteToConnect
      ? {
          destinationAccountId: tenant!.stripeConnectAccountId!,
          ...(tenant!.paymentsMode === 'own_stripe'
            ? { onBehalfOf: tenant!.stripeConnectAccountId! }
            : { applicationFeeAmountCents: calculateApplicationFeeCents(amountCents, tenant!.commissionBps) }),
        }
      : undefined;

    // Create payment intent with metadata for later verification
    const { paymentIntent, clientSecret } = await createPaymentIntent(
      total,
      customerId,
      {
        userId: session.user.id,
        userEmail: session.user.email,
        itemCount: items.length.toString(),
        deliveryFee: deliveryFee.toFixed(2),
        tax: serverTax.toFixed(2),
        taxRate: taxRate.toString(),
        state,
        deliveryMethod,
        ...(freightQuoteId ? { freightQuoteId } : {}),
        ...(shippingCarrier ? { shippingCarrier } : {}),
        ...(liftgateFee > 0 ? { liftgateFee: liftgateFee.toFixed(2) } : {}),
        ...(tenant ? { tenantId: tenant.id } : {}),
      },
      // Always set setup_future_usage so the payment method remains attachable post-payment.
      // The "Save card" checkbox in the UI controls whether it's actually saved to the DB.
      {
        setupFutureUsage: true,
        ...(paymentSettings.send_receipt_emails ? { receipt_email: session.user.email } : {}),
        ...(connectOptions ? { connect: connectOptions } : {}),
      }
    );

    return NextResponse.json({
      clientSecret,
      paymentIntentId: paymentIntent.id,
      amount: total,
      warnings: orderValidation.warnings.filter(w => w.includes('Partial inventory')),
      validationDetails: orderValidation.inventoryIssues ? {
        items: orderValidation.items.map(item => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          availableInventory: item.inventory,
          inventoryAvailable: item.inventoryAvailable,
          nextAvailableQuantity: item.nextAvailableQuantity,
          nextAvailableDate: item.nextAvailableDate,
          canFulfillPartially: item.canFulfillPartially,
          partialQuantity: item.partialQuantity,
          backorderQuantity: item.backorderQuantity,
        })),
      } : undefined,
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    
    securityLogger.logError(
      'Payment intent creation failed',
      error,
      ip
    );
    
    return NextResponse.json(
      { error: 'Failed to create payment intent' },
      { status: 500 }
    );
  }
}

