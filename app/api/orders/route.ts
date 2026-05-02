import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { query, queryOne, pool } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { validateOrder, detectSuspiciousPatterns } from '@/lib/order-validation';
import { getPaymentIntent, savePaymentMethodFromIntent, getPaymentMethodFromIntent } from '@/lib/stripe';
import { orderWithPaymentSchema } from '@/lib/validation';
import { sendOrderConfirmation } from '@/lib/email';

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

interface Address {
  firstName?: string;
  lastName?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
  phone?: string;
  email?: string;
}

interface DbOrder {
  id: string;
  user_id: string;
  order_number: string;
  status: string;
  shipping_address: Address;
  billing_address: Address;
  delivery_method: string;
  delivery_fee: string;
  subtotal: string;
  tax: string;
  total: string;
  stripe_payment_intent_id: string | null;
  payment_status: string | null;
  metadata: Record<string, unknown> | null;
  has_restricted_products: boolean;
  created_at: string;
  updated_at: string;
}

interface DbOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  price: string;
  quantity: number;
  image: string;
  unit_of_measure: string | null;
}

// Generate a unique order number
function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

// GET: Fetch all orders for authenticated user
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  
  try {
    // Rate limiting - relaxed for authenticated users (60 req/min)
    const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, '/api/orders', 'GET');
      return createRateLimitResponse(rateLimitResult.reset);
    }

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orders = await query<DbOrder>(
      `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
      [session.user.id]
    );

    // Fetch items and payment details for all orders
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const items = await query<DbOrderItem>(
          `SELECT * FROM order_items WHERE order_id = $1`,
          [order.id]
        );

        // Fetch payment method details if available
        let paymentMethod = null;
        if (order.stripe_payment_intent_id) {
          paymentMethod = await getPaymentMethodFromIntent(order.stripe_payment_intent_id);
        }

        // Extract tracking information from metadata
        let trackingNumber: string | null = null;
        let trackingCarrier: string | null = null;
        let invoiceMetadata: Record<string, unknown> | null = null;

        if (order.metadata) {
          let metadata: Record<string, unknown>;
          if (typeof order.metadata === 'string') {
            try {
              metadata = JSON.parse(order.metadata);
            } catch {
              metadata = {};
            }
          } else {
            metadata = order.metadata as Record<string, unknown>;
          }

          trackingNumber = (metadata.tracking_number as string) || null;
          trackingCarrier = (metadata.tracking_carrier as string) || null;
          invoiceMetadata = metadata;
        }

        return {
          id: order.id,
          orderNumber: order.order_number,
          status: order.status,
          shippingAddress: order.shipping_address,
          billingAddress: order.billing_address,
          deliveryMethod: order.delivery_method,
          deliveryFee: parseFloat(order.delivery_fee),
          subtotal: parseFloat(order.subtotal),
          tax: parseFloat(order.tax),
          total: parseFloat(order.total),
          paymentIntentId: order.stripe_payment_intent_id,
          paymentStatus: order.payment_status,
          paymentMethod,
          invoiceMetadata,
          trackingNumber,
          trackingCarrier,
          createdAt: order.created_at,
          items: items.map((item) => ({
            id: item.id,
            productId: item.product_id,
            name: item.name,
            price: parseFloat(item.price),
            quantity: item.quantity,
            image: item.image,
            unitOfMeasure: item.unit_of_measure,
          })),
        };
      })
    );

    return NextResponse.json({ orders: ordersWithItems });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}

// POST: Create a new order
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  
  // Declare session outside try block for error handling
  let session: { user: { id: string } } | null = null;
  
  try {
    // Rate limiting - moderate (20 req/min)
    const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, '/api/orders', 'POST');
      return createRateLimitResponse(rateLimitResult.reset);
    }

    const requestHeaders = await headers();
    session = await auth.api.getSession({
      headers: requestHeaders,
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Tenant context from middleware headers (set by tenant resolution)
    const tenantId = requestHeaders.get('x-tenant-id') ?? null;

    const body = await request.json();
    
    // Validate with Zod schema
    const validation = orderWithPaymentSchema.safeParse(body);
    if (!validation.success) {
      securityLogger.logValidationFailure('/api/orders', ip, 'Invalid order data', 'POST');
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
        },
        { status: 400 }
      );
    }

    const { items, shippingAddress, billingAddress, paymentIntentId, savePaymentMethod, invoiceMetadata, email, phone } = validation.data;

    // Verify payment intent with Stripe
    let paymentIntent;
    try {
      paymentIntent = await getPaymentIntent(paymentIntentId);
      
      if (paymentIntent.status !== 'succeeded') {
        securityLogger.logSuspiciousActivity(
          'payment_not_succeeded',
          ip,
          {
            userId: session.user.id,
            paymentIntentId,
            status: paymentIntent.status,
          },
          session.user.id
        );
        
        return NextResponse.json(
          {
            error: 'Payment not completed',
            message: 'Payment verification failed. Please try again.',
          },
          { status: 400 }
        );
      }

      // Verify payment intent belongs to this user
      if (paymentIntent.metadata?.userId !== session.user.id) {
        securityLogger.logSuspiciousActivity(
          'payment_user_mismatch',
          ip,
          {
            userId: session.user.id,
            paymentIntentUserId: paymentIntent.metadata?.userId,
            paymentIntentId,
          },
          session.user.id
        );
        
        return NextResponse.json(
          { error: 'Payment verification failed' },
          { status: 400 }
        );
      }
    } catch (error) {
      securityLogger.logError('Payment intent verification failed', error, ip);
      return NextResponse.json(
        { error: 'Payment verification failed' },
        { status: 400 }
      );
    }

    // Calculate totals from payment intent (source of truth)
    const total = paymentIntent.amount / 100; // Convert from cents
    const deliveryFee = parseFloat(paymentIntent.metadata?.deliveryFee || '0');
    const tax = parseFloat(paymentIntent.metadata?.tax || '0');
    const taxRate = parseFloat(paymentIntent.metadata?.taxRate || '0');
    const subtotal = total - deliveryFee - tax;

    // Convert items to validation format
    const orderItems = items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      price: item.price,
      name: item.name,
      image: item.image,
    }));

    // Server-side order validation (verify items still match prices and state eligibility)
    // validateOrder only validates item prices (subtotal), not delivery/tax
    const orderValidation = await validateOrder(
      pool,
      orderItems,
      subtotal,
      shippingAddress.state
    );
    
    if (!orderValidation.valid) {
      securityLogger.logOrderCreated(
        'VALIDATION_FAILED',
        session.user.id,
        orderValidation.clientTotal,
        orderValidation.serverTotal,
        ip
      );
      
      return NextResponse.json(
        {
          error: 'Order validation failed',
          details: orderValidation.errors,
          warnings: orderValidation.warnings,
        },
        { status: 400 }
      );
    }

    // Check for price mismatch
    if (orderValidation.priceMismatch) {
      securityLogger.logOrderCreated(
        'PRICE_MISMATCH',
        session.user.id,
        orderValidation.clientTotal,
        orderValidation.serverTotal,
        ip
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

    // Get delivery method and freight quote info from payment intent metadata
    const deliveryMethod = paymentIntent.metadata?.deliveryMethod || 'standard';
    const freightQuoteId = paymentIntent.metadata?.freightQuoteId || null;
    const shippingCarrier = paymentIntent.metadata?.shippingCarrier || null;
    const liftgateFee = parseFloat(paymentIntent.metadata?.liftgateFee || '0');

    // Calculate shipping fee server-side based on product types
    // Shipping is now calculated based on product types (totes, cases, etc.)
    // instead of configured shipping options
    // Also multiply by warehouse count if inventory is split across multiple warehouses
    let serverCalculatedShipping = 0;
    let warehouseCount = 1;
    try {
      const itemsWithUnitOfMeasure = await Promise.all(
        orderItems.map(async (item) => {
          const product = await queryOne<{ unit_of_measure: string | null; name: string }>(
            'SELECT unit_of_measure, name FROM products WHERE id = $1 AND deleted_at IS NULL',
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
    if (!freightQuoteId && !deliveryMethod?.startsWith('Truckload') && Math.abs(serverCalculatedShipping - deliveryFee) > 0.01) {
      securityLogger.logSuspiciousActivity(
        'order_delivery_fee_mismatch',
        ip,
        {
          userId: session.user.id,
          clientDeliveryFee: deliveryFee,
          serverDeliveryFee: serverCalculatedShipping,
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

    // Detect suspicious patterns
    const suspiciousCheck = detectSuspiciousPatterns(
      orderItems,
      shippingAddress,
      session.user.id
    );
    
    if (suspiciousCheck.suspicious) {
      securityLogger.logSuspiciousActivity(
        'suspicious_order',
        ip,
        {
          userId: session.user.id,
          reasons: suspiciousCheck.reasons,
          orderTotal: total,
        },
        session.user.id
      );
      // Continue but flag for review
    }

    // NOTE: Inventory is NOT reserved at order creation
    // Inventory will be reserved when admin clicks "Start Processing" 
    // which changes order status to 'processing'

    const orderNumber = generateOrderNumber();

    // Enhance addresses with email and phone for completeness
    const enhancedShippingAddress = {
      ...shippingAddress,
      email,
      phone,
    };

    const enhancedBillingAddress = billingAddress 
      ? {
          ...billingAddress,
          email,
          phone,
        }
      : enhancedShippingAddress;

    // Prepare order metadata - include partial fulfillment flag and suspicious order flag if applicable
    const orderMetadata = {
      ...(invoiceMetadata || {}),
      ...(orderValidation.inventoryIssues && orderValidation.warnings.length > 0 ? {
        partially_fulfilled: true,
        partial_fulfillment_date: new Date().toISOString(),
        partial_fulfillment_warnings: orderValidation.warnings || [],
      } : {}),
      ...(suspiciousCheck.suspicious ? {
        requires_review: true,
        review_reasons: suspiciousCheck.reasons || [],
        flagged_at: new Date().toISOString(),
      } : {}),
      ...(liftgateFee > 0 ? {
        liftgate_required: true,
        liftgate_fee: liftgateFee,
      } : {}),
    };

    // Create the order with payment information
    // Log values before insertion for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('[Order Creation] Inserting order with values:', {
        userId: session.user.id,
        orderNumber,
        status: 'pending', // Suspicious orders are flagged in metadata, not status
        deliveryMethod,
        deliveryFee,
        subtotal,
        tax,
        total,
        paymentIntentId,
        taxRate,
        hasRestrictedProducts: orderValidation.hasRestrictedProducts,
      });
    }
    
    let order: DbOrder | null;
    try {
      order = await queryOne<DbOrder>(
        `INSERT INTO orders (
          user_id, order_number, status, shipping_address, billing_address,
          delivery_method, delivery_fee, subtotal, tax, total,
          stripe_payment_intent_id, payment_status, tax_rate, metadata,
          has_restricted_products, freight_quote_id, shipping_carrier, tenant_id
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING *`,
        [
          session.user.id,
          orderNumber,
          'pending', // Use 'pending' status (suspicious orders are flagged in metadata)
          JSON.stringify(enhancedShippingAddress),
          JSON.stringify(enhancedBillingAddress),
          deliveryMethod,
          deliveryFee,
          subtotal,
          tax,
          total,
          paymentIntentId,
          'succeeded',
          taxRate,
          JSON.stringify(orderMetadata),
          orderValidation.hasRestrictedProducts,
          freightQuoteId,
          shippingCarrier,
          tenantId,
        ]
      );

      if (!order) {
        throw new Error('Failed to create order - query returned null');
      }
      
      // Create order items with actual prices
      for (const item of orderValidation.items) {
        await query(
          `INSERT INTO order_items (order_id, product_id, name, price, quantity, image, unit_of_measure)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [order.id, item.productId, item.name, item.actualPrice, item.quantity, item.image || '', item.unitOfMeasure || null]
        );
      }

      // Deduct ICC available quantity for supplier products when order is created
      // This ensures suppliers see inventory reduction immediately when orders come in
      console.log(`[Order Creation] Deducting ICC quantity for supplier products in order ${order.id}`);
      console.log(`[Order Creation] Processing ${orderValidation.items.length} order items`);
      
      const supplierProductsDeducted: Array<{ product_id: string; quantity: number }> = [];
      
      try {
        for (const item of orderValidation.items) {
          console.log(`[Order Creation] Processing item: ${item.productId}, quantity: ${item.quantity}`);
          
          // Check if this product belongs to a supplier
          const product = await queryOne<{ supplier_id: string | null; icc_available_quantity: number | null; name: string }>(
            `SELECT supplier_id, icc_available_quantity, name FROM products WHERE id = $1 AND deleted_at IS NULL`,
            [item.productId]
          );

          if (!product) {
            console.warn(`[Order Creation] Product ${item.productId} not found, skipping ICC deduction`);
            continue;
          }

          console.log(`[Order Creation] Product ${item.productId} (${product.name}): supplier_id=${product.supplier_id}, icc_available_quantity=${product.icc_available_quantity}`);

          // Check if product has warehouses (indicates supplier product even if supplier_id is null)
          const hasWarehouses = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM product_warehouses WHERE product_id = $1`,
            [item.productId]
          );
          const isSupplierProduct = product.supplier_id || (hasWarehouses && parseInt(hasWarehouses.count || '0', 10) > 0);
          
          console.log(`[Order Creation] Product ${item.productId}: hasWarehouses=${hasWarehouses ? parseInt(hasWarehouses.count || '0', 10) : 0}, isSupplierProduct=${isSupplierProduct}`);

          if (isSupplierProduct) {
            // Get current ICC quantity before update
            const beforeUpdate = product.icc_available_quantity || 0;
            
            console.log(`[Order Creation] Deducting ${item.quantity} from ICC quantity for supplier product ${item.productId} (current: ${beforeUpdate})`);
            console.log(`[Order Creation] Product ID type: ${typeof item.productId}, value: ${item.productId}`);
            
            // Deduct ICC available quantity by the ordered quantity
            // Use pool directly to ensure the update executes
            const { pool: dbPool } = await import('@/lib/db');
            const client = await dbPool.connect();
            try {
              const updateResult = await client.query<{ icc_available_quantity: number | null }>(
                `UPDATE products 
                 SET icc_available_quantity = GREATEST(0, COALESCE(icc_available_quantity, 0) - $1),
                     in_stock = CASE WHEN inventory_count > 0 OR GREATEST(0, COALESCE(icc_available_quantity, 0) - $1) > 0 THEN true ELSE false END,
                     updated_at = NOW()
                 WHERE id = $2
                 RETURNING icc_available_quantity`,
                [item.quantity, item.productId]
              );
              
              console.log(`[Order Creation] UPDATE result: rowCount=${updateResult.rowCount}, rows=${updateResult.rows.length}`);

              if (updateResult.rowCount && updateResult.rowCount > 0 && updateResult.rows[0]) {
                const updatedICCQuantity = updateResult.rows[0].icc_available_quantity || 0;
                console.log(`✓ [Order Creation] Deducted ${item.quantity} units from ICC quantity for supplier product ${item.productId} (${product.name})`);
                console.log(`  - Before: ${beforeUpdate}`);
                console.log(`  - After: ${updatedICCQuantity}`);
                
                // Verify the update by querying the database again
                const verifyResult = await client.query<{ icc_available_quantity: number | null }>(
                  `SELECT icc_available_quantity FROM products WHERE id = $1 AND deleted_at IS NULL`,
                  [item.productId]
                );
                
                if (verifyResult.rows[0]) {
                  const verifiedICCQuantity = verifyResult.rows[0].icc_available_quantity || 0;
                  console.log(`  - Verified in DB: ${verifiedICCQuantity}`);
                  if (verifiedICCQuantity !== updatedICCQuantity) {
                    console.warn(`  ⚠️ WARNING: Verification query returned different value! Expected: ${updatedICCQuantity}, Got: ${verifiedICCQuantity}`);
                  }
                }
                
                supplierProductsDeducted.push({ product_id: item.productId, quantity: item.quantity });
              } else {
                console.error(`✗ [Order Creation] Failed to deduct ICC quantity for product ${item.productId}`);
                console.error(`  - UPDATE rowCount: ${updateResult.rowCount}`);
                console.error(`  - Product exists: ${!!product}`);
                console.error(`  - Supplier ID: ${product.supplier_id}`);
                console.error(`  - Current ICC Qty: ${product.icc_available_quantity}`);
                console.error(`  - Product ID used in UPDATE: ${item.productId}`);
                
                // Try to find the product with a different query to debug
                const debugResult = await client.query<{ id: string; supplier_id: string | null; icc_available_quantity: number | null }>(
                  `SELECT id, supplier_id, icc_available_quantity FROM products WHERE id = $1 AND deleted_at IS NULL`,
                  [item.productId]
                );
                const debugProduct = debugResult.rows[0];
                console.error(`  - Debug query result: ${debugProduct ? `Found product ${debugProduct.id}, supplier_id=${debugProduct.supplier_id}` : 'Product not found'}`);
              }
            } catch (updateError) {
              const errMsg = updateError instanceof Error ? updateError.message : String(updateError);
              const errStack = updateError instanceof Error ? updateError.stack : undefined;
              console.error(`✗ [Order Creation] Error updating ICC quantity for product ${item.productId}:`, errMsg);
              console.error(`  - Stack: ${errStack}`);
            } finally {
              client.release();
            }
          } else {
            console.log(`[Order Creation] Product ${item.productId} is not a supplier product (supplier_id is null), skipping ICC deduction`);
          }
        }

        // Mark in order metadata that ICC quantity has been deducted to prevent double deduction
        if (supplierProductsDeducted.length > 0) {
          const updatedMetadata = {
            ...orderMetadata,
            icc_quantity_deducted: true,
            icc_quantity_deducted_at: new Date().toISOString(),
            supplier_products_deducted: supplierProductsDeducted,
          };

          await queryOne(
            `UPDATE orders 
             SET metadata = $1, updated_at = NOW()
             WHERE id = $2`,
            [JSON.stringify(updatedMetadata), order.id]
          );
          
          console.log(`✓ Marked ICC quantity as deducted in order metadata for ${supplierProductsDeducted.length} product(s)`);
        } else {
          console.log(`[Order Creation] No supplier products found in order, skipping ICC quantity deduction`);
        }

        // Revalidate supplier products page to show updated ICC Qty
        const { revalidatePath } = await import('next/cache');
        revalidatePath('/supplier/products');
        revalidatePath('/api/supplier/products', 'page');
        console.log('✓ Revalidated /supplier/products page and API route after ICC quantity deduction');
      } catch (iccDeductionError) {
        // Log error but don't fail the order creation
        const errMsg = iccDeductionError instanceof Error ? iccDeductionError.message : String(iccDeductionError);
        const errStack = iccDeductionError instanceof Error ? iccDeductionError.stack : undefined;
        console.error('[Order Creation] Error deducting ICC quantity:', {
          message: errMsg,
          stack: errStack,
          orderId: order.id,
        });
        securityLogger.logError('Failed to deduct ICC quantity during order creation', iccDeductionError, ip);
      }
    } catch (dbError) {
      const err = dbError as { message?: string; code?: string; detail?: string; constraint?: string; stack?: string };
      console.error('[Order Creation] Database error:', {
        message: err.message,
        code: err.code,
        detail: err.detail,
        constraint: err.constraint,
        stack: err.stack,
      });
      throw new Error(`Database error: ${err.message || 'Failed to create order'}`);
    }

    // Save payment method if requested
    if (savePaymentMethod && paymentIntent.payment_method) {
      try {
        await savePaymentMethodFromIntent(
          paymentIntentId,
          session.user.id,
          false // Don't set as default automatically
        );
      } catch (error) {
        // Log error but don't fail the order
        securityLogger.logError('Failed to save payment method', error, ip);
      }
    }

    // Log successful order creation
    securityLogger.logOrderCreated(
      order.id,
      session.user.id,
      orderValidation.clientTotal,
      orderValidation.serverTotal,
      ip
    );

    // Send order confirmation email (non-blocking - log errors but don't fail order)
    try {
      const customerName = `${enhancedShippingAddress.firstName || ''} ${enhancedShippingAddress.lastName || ''}`.trim() || 'Customer';
      
      const emailResult = await sendOrderConfirmation({
        to: email,
        subject: `Order Confirmation - ${order.order_number}`,
        orderNumber: order.order_number,
        customerName,
        orderDate: new Date(order.created_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        items: orderValidation.items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.actualPrice,
          image: item.image,
        })),
        subtotal,
        deliveryFee,
        tax,
        total,
        shippingAddress: enhancedShippingAddress,
        deliveryMethod,
        ip,
      });

      // Log detailed results if email failed
      if (!emailResult.success) {
        securityLogger.logEvent({
          type: 'admin_action',
          ip,
          path: '/api/orders',
          method: 'POST',
          details: {
            orderId: order.id,
            orderNumber: order.order_number,
            recipient: email,
            emailError: emailResult.error,
            emailSuccess: false,
          },
          severity: 'high',
        });

        console.error('Order confirmation email failed:', {
          orderNumber: order.order_number,
          recipient: email,
          error: emailResult.error,
        });
      } else {
        // Log successful email send
        securityLogger.logEvent({
          type: 'admin_action',
          ip,
          path: '/api/orders',
          method: 'POST',
          details: {
            orderId: order.id,
            orderNumber: order.order_number,
            recipient: email,
            emailSuccess: true,
            messageId: emailResult.messageId,
          },
          severity: 'low',
        });
      }
    } catch (emailError) {
      // Log email error but don't fail the order
      securityLogger.logEvent({
        type: 'admin_action',
        ip,
        path: '/api/orders',
        method: 'POST',
        details: {
          orderId: order.id,
          orderNumber: order.order_number,
          recipient: email,
          emailError: emailError instanceof Error ? emailError.message : 'Unknown error',
          emailSuccess: false,
        },
        severity: 'high',
      });
      
      console.error('Failed to send order confirmation email (exception):', {
        orderNumber: order.order_number,
        recipient: email,
        error: emailError instanceof Error ? emailError.message : 'Unknown error',
      });
    }

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.order_number,
      },
    });
  } catch (error) {
    console.error('Error creating order:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip,
      path: '/api/orders',
      method: 'POST',
      details: { 
        error: errorMessage,
        stack: errorStack,
        userId: session?.user?.id,
      },
      severity: 'high',
    });
    
    // Provide more detailed error message in development
    const errorResponse: { error: string; message?: string; details?: string } = {
      error: 'Failed to create order',
    };
    
    if (process.env.NODE_ENV === 'development') {
      errorResponse.message = errorMessage;
      if (errorStack) {
        errorResponse.details = errorStack;
      }
    }
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

