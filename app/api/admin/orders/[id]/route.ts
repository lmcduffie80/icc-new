import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne, getPoolInstance } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { getPaymentMethodFromIntent } from '@/lib/stripe';
import { allocateItemsToWarehouses, allocateItemsToWarehousesFIFO, type WarehouseAllocation } from '@/lib/warehouse-allocation';
import { reserveInventory, reserveInventoryFIFO } from '@/lib/order-validation';
import { sendOrderStatusUpdate } from '@/lib/email';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { INVENTORY_CONFIG } from '@/lib/config';
import { logGoodsIssue } from '@/lib/inventory-transactions';

interface InvoiceMetadata {
  invoice_url?: string;
  invoice_state?: string;
  invoice_uploaded_at?: string;
  invoice_filename?: string;
  invoice_file_type?: string;
  warehouse_id?: string | null;
  warehouse_allocations?: WarehouseAllocation[] | null;
  manual_shipping?: boolean;
  partially_fulfilled?: boolean;
  partial_fulfillment_date?: string;
  partial_fulfillment_warnings?: string[];
  nmfcNumber?: string; // Legacy: single NMFC number
  nmfcInfo?: Array<{ number?: string; shippingType: 'TL' | 'LTL' }>; // New: array of NMFC info
  palletCount?: number;
  tracking_number?: string;
  tracking_carrier?: string;
  tracking_added_at?: string;
  [key: string]: unknown;
}

interface Order {
  id: string;
  user_id: string;
  order_number: string;
  status: string;
  shipping_address: object;
  billing_address: object;
  delivery_method: string;
  delivery_fee: string;
  subtotal: string;
  tax: string;
  total: string;
  stripe_payment_intent_id: string | null;
  payment_status: string | null;
  metadata: InvoiceMetadata | null;
  created_at: string;
  updated_at: string;
}

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  price: string;
  quantity: number;
  image: string | null;
}

// GET /api/admin/orders/[id] - Get a single order with items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('orders.view');
  if (auth.error) return auth.error;

  const { id } = await params;

  const order = await queryOne<Order & { user_email: string; user_name: string }>(
    `SELECT o.*, u.email as user_email, u.name as user_name
     FROM orders o
     JOIN "user" u ON u.id = o.user_id
     WHERE o.id = $1`,
    [id]
  );

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const items = await query<OrderItem>(
    'SELECT * FROM order_items WHERE order_id = $1',
    [id]
  );

  // Fetch payment method details if available
  let paymentMethod = null;
  if (order.stripe_payment_intent_id) {
    paymentMethod = await getPaymentMethodFromIntent(order.stripe_payment_intent_id);
  }

  return NextResponse.json({ 
    ...order, 
    items,
    paymentMethod,
  });
}

// PUT /api/admin/orders/[id] - Update order status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('orders.update_status');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json();
    const { status, tracking_number, tracking_carrier } = body;

    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate tracking information when marking as shipped
    if (status === 'shipped') {
      if (!tracking_number || typeof tracking_number !== 'string' || tracking_number.trim().length === 0) {
        return NextResponse.json(
          { error: 'Tracking number is required when marking order as shipped' },
          { status: 400 }
        );
      }
    }

    // Get existing order for audit log
    const existingOrder = await queryOne<Order>('SELECT * FROM orders WHERE id = $1', [id]);

    if (!existingOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Check if trying to cancel - requires cancel permission
    if (status === 'cancelled') {
      const cancelAuth = await requireAdmin('orders.cancel');
      if (cancelAuth.error) return cancelAuth.error;
    }

    // If status is changing to "pending", reserve inventory from products
    // Inventory is reserved when order status changes to 'pending' OR when order is already 'pending' but hasn't had inventory reserved yet
    // Check if inventory has already been reserved by looking for warehouse allocations or checking if inventory was already deducted
    let hasInventoryReserved = false;
    if (existingOrder.metadata) {
      if (typeof existingOrder.metadata === 'string') {
        const metadataString = existingOrder.metadata;
        try {
          const parsed = JSON.parse(metadataString);
          hasInventoryReserved = !!parsed.warehouse_allocations;
        } catch {
          // Not valid JSON, check if it contains the string
          hasInventoryReserved = (metadataString as string).includes('warehouse_allocations');
        }
      } else if (typeof existingOrder.metadata === 'object' && existingOrder.metadata !== null) {
        hasInventoryReserved = !!(existingOrder.metadata as Record<string, unknown>).warehouse_allocations;
      }
    }
    
    const shouldReserveInventory = 
      status === 'pending' && 
      !hasInventoryReserved &&
      existingOrder.status !== 'processing' && 
      existingOrder.status !== 'shipped' && 
      existingOrder.status !== 'delivered';
    
    console.log(`[Order Status Update] Order ${id}: status=${status}, existingStatus=${existingOrder.status}, hasInventoryReserved=${hasInventoryReserved}, shouldReserveInventory=${shouldReserveInventory}`);
    
    if (shouldReserveInventory) {
      try {
        // Get order items for inventory reservation
        const orderItems = await query<{
          product_id: string;
          quantity: number;
          name: string;
        }>(
          'SELECT product_id, quantity, name FROM order_items WHERE order_id = $1',
          [id]
        );

        // Reserve inventory from products table (inventory_count and icc_available_quantity)
        // This happens when order status changes to 'pending'
        const pool = getPoolInstance();

        console.log(`[Order Status Update] Reserving inventory for order ${id} with ${orderItems.length} items`);
        orderItems.forEach(item => {
          console.log(`  - Item: ${item.name} (${item.product_id}), Quantity: ${item.quantity}`);
        });

        // Check if ICC quantity was already deducted at order creation
        let skipICCQuantityDeduction = false;
        if (existingOrder.metadata) {
          if (typeof existingOrder.metadata === 'string') {
            try {
              const parsed = JSON.parse(existingOrder.metadata);
              skipICCQuantityDeduction = !!parsed.icc_quantity_deducted;
            } catch {
              // Not valid JSON, ignore
            }
          } else if (typeof existingOrder.metadata === 'object' && existingOrder.metadata !== null) {
            skipICCQuantityDeduction = !!(existingOrder.metadata as Record<string, unknown>).icc_quantity_deducted;
          }
        }
        
        if (skipICCQuantityDeduction) {
          console.log(`[Order Status Update] ICC quantity was already deducted at order creation, skipping ICC deduction in reserveInventory`);
        }

        // Check if FIFO allocation is enabled
        const useFIFO = INVENTORY_CONFIG.USE_FIFO_ALLOCATION;
        console.log(`[Order Status Update] Using ${useFIFO ? 'FIFO' : 'standard'} inventory allocation`);

        const inventoryResult = useFIFO
          ? await reserveInventoryFIFO(
              pool,
              orderItems.map(item => ({
                productId: item.product_id,
                quantity: item.quantity,
                name: item.name,
                price: 0, // Not needed for reservation
                image: undefined,
              })),
              skipICCQuantityDeduction
            )
          : await reserveInventory(
              pool,
              orderItems.map(item => ({
                productId: item.product_id,
                quantity: item.quantity,
                name: item.name,
                price: 0, // Not needed for reservation
                image: undefined,
              })),
              skipICCQuantityDeduction
            );
        
        console.log(`[Order Status Update] Inventory reservation result: success=${inventoryResult.success}, errors=${inventoryResult.errors.length}, warnings=${inventoryResult.warnings.length}`);
        if (inventoryResult.errors.length > 0) {
          console.error(`[Order Status Update] Inventory reservation errors:`, inventoryResult.errors);
        }

        // Store FIFO allocation data if FIFO was used
        if (useFIFO && inventoryResult.success && 'allocations' in inventoryResult) {
          const allocations = inventoryResult.allocations;
          const substitutions = 'substitutions' in inventoryResult ? inventoryResult.substitutions : undefined;
          
          if (Array.isArray(allocations) && allocations.length > 0) {
            console.log(`[Order Status Update] Storing FIFO allocation data for ${allocations.length} warehouses`);
            
            // Update order_items with FIFO tracking data
            if (Array.isArray(substitutions) && substitutions.length > 0) {
              console.log(`[Order Status Update] Recording ${substitutions.length} product substitutions`);
              
              for (const sub of substitutions) {
                console.log(`  - Substitution: ${sub.original_product_id} -> ${sub.allocated_product_id} (${sub.supplier_company || 'unknown'})`);
              }
            }

            // Update order_items with allocated product IDs and supplier info
            for (const allocation of allocations) {
              for (const item of allocation.items) {
                await query(
                  `UPDATE order_items 
                   SET original_product_id = COALESCE(original_product_id, product_id),
                       allocated_product_id = $1,
                       supplier_id = $2,
                       warehouse_entry_date = $3
                   WHERE order_id = $4 
                     AND product_id = $5
                     AND quantity = $6`,
                  [
                    item.allocated_product_id,
                    item.supplier_id,
                    item.warehouse_entry_date,
                    id,
                    item.original_product_id,
                    item.quantity,
                  ]
                );
              }
            }
          }
        }

        if (!inventoryResult.success) {
          // Log error but don't fail the status update
          // Admin can manually review inventory issues
          securityLogger.logError(
            `Inventory reservation failed for order ${id}`,
            new Error(inventoryResult.errors.join('; ')),
            getClientIp(request)
          );
          console.error(`Inventory reservation failed for order ${id}:`, inventoryResult.errors);
        } else {
          // Inventory was successfully reserved - wait a moment to ensure transaction is fully committed
          // Then verify ICC quantity was updated for supplier products
          await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to ensure commit is visible
          
          // Use the same pool instance to query (ensures we see committed changes)
          const pool = getPoolInstance();
          const supplierProducts = await pool.query<{
            product_id: string;
            supplier_id: string | null;
            icc_available_quantity: number;
            name: string;
          }>(
            `SELECT p.id as product_id, p.supplier_id, p.icc_available_quantity, p.name
             FROM products p
             WHERE p.id = ANY($1) AND p.supplier_id IS NOT NULL AND p.deleted_at IS NULL`,
            [orderItems.map(item => item.product_id)]
          );
          
          if (supplierProducts.rows.length > 0) {
            console.log(`[Inventory Reservation] Verified ICC quantity update for ${supplierProducts.rows.length} supplier product(s):`);
            supplierProducts.rows.forEach(sp => {
              const orderItem = orderItems.find(oi => oi.product_id === sp.product_id);
              console.log(`  - Product ${sp.product_id} (${sp.name}): ICC Qty = ${sp.icc_available_quantity} (should have been reduced by ${orderItem?.quantity || 0})`);
            });
          } else {
            console.log(`[Inventory Reservation] No supplier products found in order items to verify`);
          }
          
          // Revalidate supplier products page to show updated ICC Qty
          // Revalidate both the page and the API route to ensure fresh data
          revalidatePath('/supplier/products');
          revalidatePath('/api/supplier/products', 'page');
          console.log('✓ Revalidated /supplier/products page and API route to show updated ICC Qty after inventory reservation');
        }

        // Store partial fulfillment info in metadata if applicable
        if (inventoryResult.partiallyFulfilled) {
          const currentMetadata = existingOrder.metadata && typeof existingOrder.metadata === 'string'
            ? JSON.parse(existingOrder.metadata)
            : (existingOrder.metadata || {});

          currentMetadata.partially_fulfilled = true;
          currentMetadata.partial_fulfillment_date = new Date().toISOString();
          currentMetadata.partial_fulfillment_warnings = inventoryResult.warnings || [];

          await queryOne(
            `UPDATE orders 
             SET metadata = $1, updated_at = NOW()
             WHERE id = $2`,
            [JSON.stringify(currentMetadata), id]
          );
        }
      } catch (error) {
        // Log error but don't fail the status update
        securityLogger.logError(
          `Failed to reserve inventory for order ${id}`,
          error,
          getClientIp(request)
        );
        console.error(`Failed to reserve inventory for order ${id}:`, error);
      }
    }

    // If status is changing to "pending", "processing", or "shipped", deduct inventory from warehouses
    // Warehouse inventory is deducted when order status changes to 'pending' (or later statuses)
    // Also check if inventory has already been deducted by looking for warehouse allocations
    const shouldDeductWarehouseInventory = 
      (status === 'pending' && !hasInventoryReserved && existingOrder.status !== 'processing' && existingOrder.status !== 'shipped' && existingOrder.status !== 'delivered') ||
      (status === 'processing' && existingOrder.status !== 'processing' && existingOrder.status !== 'shipped' && existingOrder.status !== 'delivered') ||
      (status === 'shipped' && existingOrder.status !== 'shipped' && existingOrder.status !== 'delivered');
    
    if (shouldDeductWarehouseInventory) {
      try {
        // Get order items
        const orderItems = await query<{
          product_id: string;
          quantity: number;
          name: string;
        }>(
          'SELECT product_id, quantity, name FROM order_items WHERE order_id = $1',
          [id]
        );

        // Get warehouse_id from order metadata if it exists
        let warehouseId: string | null = null;
        let existingAllocations: WarehouseAllocation[] | null = null;
        
        if (existingOrder.metadata && typeof existingOrder.metadata === 'string') {
          try {
            const metadata = JSON.parse(existingOrder.metadata);
            warehouseId = metadata.warehouse_id || null;
            existingAllocations = metadata.warehouse_allocations || null;
          } catch {
            // Metadata is not valid JSON, ignore
          }
        } else if (existingOrder.metadata && typeof existingOrder.metadata === 'object') {
          warehouseId = existingOrder.metadata.warehouse_id || null;
          existingAllocations = existingOrder.metadata.warehouse_allocations || null;
        }

        // Check if we already have allocations stored (from previous attempt)
        let allocations: WarehouseAllocation[] = [];
        
        if (existingAllocations && Array.isArray(existingAllocations)) {
          // Use existing allocations
          allocations = existingAllocations;
          console.log(`Using existing warehouse allocations for order ${id}`);
        } else {
          // Check if FIFO allocation is enabled
          const useFIFO = INVENTORY_CONFIG.USE_FIFO_ALLOCATION;
          console.log(`[Warehouse Allocation] Using ${useFIFO ? 'FIFO' : 'standard'} allocation`);
          
          // Allocate items to warehouses automatically
          const allocationResult = useFIFO
            ? await allocateItemsToWarehousesFIFO(
                orderItems.map(item => ({
                  product_id: item.product_id,
                  quantity: item.quantity,
                  name: item.name,
                })),
                warehouseId
              )
            : await allocateItemsToWarehouses(
                orderItems.map(item => ({
                  product_id: item.product_id,
                  quantity: item.quantity,
                  name: item.name,
                })),
                warehouseId
              );

          allocations = allocationResult.allocations;

          // Store allocations in order metadata
          const currentMetadata = existingOrder.metadata && typeof existingOrder.metadata === 'string'
            ? JSON.parse(existingOrder.metadata)
            : (existingOrder.metadata || {});

          currentMetadata.warehouse_allocations = allocations;
          currentMetadata.allocation_warnings = allocationResult.warnings;
          currentMetadata.unfulfilled_items = allocationResult.unfulfilledItems;

          // Update order metadata
          await queryOne(
            `UPDATE orders 
             SET metadata = $1, updated_at = NOW()
             WHERE id = $2`,
            [JSON.stringify(currentMetadata), id]
          );

          if (allocationResult.warnings.length > 0) {
            console.warn(`Warehouse allocation warnings for order ${id}:`, allocationResult.warnings);
          }

          if (allocationResult.unfulfilledItems.length > 0) {
            console.error(`Unfulfilled items for order ${id}:`, allocationResult.unfulfilledItems);
            // Don't fail, but log for manual review
          }
        }

        // Deduct inventory based on allocations
        // IMPORTANT: Only deduct what was actually allocated (which respects available inventory)
        console.log(`[Inventory Deduction] Starting deduction for order ${id}. Allocations count: ${allocations.length}`);
        
        if (allocations.length === 0) {
          console.warn(`[Inventory Deduction] No warehouse allocations found for order ${id}. Attempting to allocate items to warehouses...`);
          
          // Check if FIFO allocation is enabled
          const useFIFO = INVENTORY_CONFIG.USE_FIFO_ALLOCATION;
          
          // Try to allocate items if no allocations exist
          const allocationResult = useFIFO
            ? await allocateItemsToWarehousesFIFO(
                orderItems.map(item => ({
                  product_id: item.product_id,
                  quantity: item.quantity,
                  name: item.name,
                })),
                warehouseId
              )
            : await allocateItemsToWarehouses(
                orderItems.map(item => ({
                  product_id: item.product_id,
                  quantity: item.quantity,
                  name: item.name,
                })),
                warehouseId
              );

          allocations = allocationResult.allocations;
          
          if (allocations.length === 0) {
            console.error(`[Inventory Deduction] Failed to allocate items to warehouses. Cannot proceed with deduction.`);
            console.error(`  - Order items: ${orderItems.length}`);
            console.error(`  - Allocation warnings: ${allocationResult.warnings.join(', ')}`);
            console.error(`  - Unfulfilled items: ${allocationResult.unfulfilledItems.length}`);
          } else {
            console.log(`[Inventory Deduction] Successfully allocated items to ${allocations.length} warehouse(s)`);
            
            // Store allocations in order metadata
            const currentMetadata = existingOrder.metadata && typeof existingOrder.metadata === 'string'
              ? JSON.parse(existingOrder.metadata)
              : (existingOrder.metadata || {});

            currentMetadata.warehouse_allocations = allocations;
            currentMetadata.allocation_warnings = allocationResult.warnings;
            currentMetadata.unfulfilled_items = allocationResult.unfulfilledItems;

            // Update order metadata
            await queryOne(
              `UPDATE orders 
               SET metadata = $1, updated_at = NOW()
               WHERE id = $2`,
              [JSON.stringify(currentMetadata), id]
            );
          }
        }
        
        for (const allocation of allocations) {
          console.log(`[Inventory Deduction] Processing allocation for warehouse: ${allocation.warehouse_name} (${allocation.warehouse_id}), items: ${allocation.items.length}`);
          
          for (const item of allocation.items) {
            console.log(`[Inventory Deduction] Processing item: ${item.name} (product_id: ${item.product_id}), quantity: ${item.quantity}`);
            // Verify inventory is still available before deducting
            const currentWarehouseInventory = await queryOne<{ inventory_count: number }>(
              `SELECT inventory_count 
               FROM product_warehouses 
               WHERE product_id = $1 AND warehouse_id = $2`,
              [item.product_id, allocation.warehouse_id]
            );

            if (!currentWarehouseInventory) {
              console.warn(`No warehouse inventory record found for product ${item.product_id} at warehouse ${allocation.warehouse_id}`);
              continue;
            }

            // Ensure we don't deduct more than what's available
            const quantityToDeduct = Math.min(item.quantity, currentWarehouseInventory.inventory_count);
            
            if (quantityToDeduct <= 0) {
              console.warn(`Cannot deduct ${item.quantity} units - only ${currentWarehouseInventory.inventory_count} available at warehouse ${allocation.warehouse_id}`);
              continue;
            }

            // Deduct from warehouse-specific inventory
            console.log(`[Inventory Deduction] Attempting to deduct ${quantityToDeduct} units from warehouse ${allocation.warehouse_id} for product ${item.product_id}`);
            console.log(`[Inventory Deduction] Current warehouse inventory before deduction: ${currentWarehouseInventory.inventory_count}`);
            
            const warehouseResult = await queryOne<{ inventory_count: number }>(
              `UPDATE product_warehouses 
               SET inventory_count = GREATEST(0, inventory_count - $1),
                   updated_at = NOW()
               WHERE product_id = $2 AND warehouse_id = $3
               RETURNING inventory_count`,
              [quantityToDeduct, item.product_id, allocation.warehouse_id]
            );

            if (warehouseResult) {
              console.log(`✓ [Inventory Deduction] Successfully deducted ${quantityToDeduct} units of ${item.name} from warehouse ${allocation.warehouse_name} (${allocation.warehouse_id}). New warehouse inventory: ${warehouseResult.inventory_count}`);
              
              // Log goods issue transaction
              try {
                // Get product details for transaction logging
                const product = await queryOne<{ sku: string; unit_of_measure: string; price: string }>(
                  'SELECT sku, unit_of_measure, price FROM products WHERE id = $1 AND deleted_at IS NULL',
                  [item.product_id]
                );
                
                if (product) {
                  await logGoodsIssue({
                    product_id: item.product_id,
                    product_sku: product.sku,
                    product_name: item.name,
                    quantity: quantityToDeduct,
                    unit_of_measure: product.unit_of_measure || 'EA',
                    warehouse_id: allocation.warehouse_id,
                    warehouse_name: allocation.warehouse_name,
                    order_id: id,
                    order_number: existingOrder.order_number,
                    unit_cost: parseFloat(product.price),
                    created_by_id: auth.session.adminUser.id,
                    created_by_username: auth.session.adminUser.email,
                    notes: `Goods issue for order fulfillment`,
                  });
                  console.log(`✓ Logged goods issue transaction for ${quantityToDeduct} units of ${item.name}`);
                }
              } catch (logError) {
                // Don't fail the order fulfillment if transaction logging fails
                console.error('Failed to log goods issue transaction:', logError);
              }
              
              // If quantity was adjusted, log a warning
              if (quantityToDeduct < item.quantity) {
                console.warn(`⚠️ [Inventory Deduction] Adjusted deduction: requested ${item.quantity} but only ${quantityToDeduct} available at warehouse ${allocation.warehouse_name}. This should not happen if allocation logic is correct.`);
              }
            } else {
              console.error(`✗ [Inventory Deduction] FAILED to deduct inventory from warehouse ${allocation.warehouse_id} for product ${item.product_id}. Query returned no rows - insufficient inventory or record not found.`);
              console.error(`  - Product ID: ${item.product_id}`);
              console.error(`  - Warehouse ID: ${allocation.warehouse_id}`);
              console.error(`  - Quantity to deduct: ${quantityToDeduct}`);
              console.error(`  - Current warehouse inventory: ${currentWarehouseInventory?.inventory_count || 'unknown'}`);
              // Don't continue with main inventory deduction if warehouse deduction failed
              continue;
            }

            // DO NOT manually deduct from main product inventory if warehouses exist
            // The main inventory_count will be synced from warehouse totals below
            // This prevents double-deduction
          }
        }

        // After all deductions, sync main product inventory_count from warehouse totals
        // This ensures the products table shows correct inventory (sum of all warehouses)
        // Get unique product IDs from allocations to avoid duplicate updates
        const uniqueProductIds = new Set<string>();
        for (const allocation of allocations) {
          for (const item of allocation.items) {
            uniqueProductIds.add(item.product_id);
          }
        }

        // Sync inventory_count and in_stock flag for each unique product based on total warehouse inventory
        for (const productId of uniqueProductIds) {
          // Check total warehouse inventory for this product
          const totalWarehouseInventory = await queryOne<{ total: number }>(
            `SELECT COALESCE(SUM(inventory_count), 0) as total
             FROM product_warehouses
             WHERE product_id = $1`,
            [productId]
          );

          const totalInventory = totalWarehouseInventory?.total || 0;

          // Sync main product inventory_count from warehouse totals
          // This replaces any manual deduction and ensures accuracy
          await queryOne(
            `UPDATE products 
             SET inventory_count = $1,
                 in_stock = CASE WHEN $1 > 0 OR COALESCE(icc_available_quantity, 0) > 0 THEN true ELSE false END,
                 updated_at = NOW()
             WHERE id = $2`,
            [totalInventory, productId]
          );

          console.log(`✓ Synced inventory_count for product ${productId} from warehouse totals: ${totalInventory}`);
        }

        // Revalidate both admin and supplier products pages to ensure they show updated inventory
        revalidatePath('/admin/products');
        revalidatePath('/supplier/products');
        console.log('✓ Revalidated /admin/products and /supplier/products pages to show updated inventory');
      } catch (error) {
        console.error('Error deducting inventory:', error);
        // Don't fail the status update if inventory deduction fails
        // Log it for manual review
      }
    }

    // If status is changing from "pending", "processing", or "shipped" to something else (like cancelled), restore inventory
    // IMPORTANT: Only restore if order was NOT already cancelled (to prevent double restoration)
    // Also check if inventory was already restored by looking at metadata
    let hasInventoryBeenRestored = false;
    if (existingOrder.metadata) {
      if (typeof existingOrder.metadata === 'string') {
        try {
          const parsed = JSON.parse(existingOrder.metadata);
          hasInventoryBeenRestored = !!parsed.inventory_restored;
        } catch {
          // Not valid JSON, ignore
        }
      } else if (typeof existingOrder.metadata === 'object' && existingOrder.metadata !== null) {
        hasInventoryBeenRestored = !!(existingOrder.metadata as Record<string, unknown>).inventory_restored;
      }
    }
    
    const shouldRestoreInventory = 
      !hasInventoryBeenRestored && // Prevent double restoration
      existingOrder.status !== 'cancelled' && // Prevent double restoration
      (existingOrder.status === 'pending' || existingOrder.status === 'processing' || existingOrder.status === 'shipped') &&
      status !== 'pending' && 
      status !== 'processing' && 
      status !== 'shipped' && 
      status !== 'delivered';
    
    console.log(`[Inventory Restoration] Checking if inventory should be restored:`);
    console.log(`  - Current order status: ${existingOrder.status}`);
    console.log(`  - New status: ${status}`);
    console.log(`  - Order already cancelled: ${existingOrder.status === 'cancelled'}`);
    console.log(`  - Inventory already restored: ${hasInventoryBeenRestored}`);
    console.log(`  - Should restore: ${shouldRestoreInventory}`);
    
    if (shouldRestoreInventory) {
      try {
        console.log(`[Inventory Restoration] Starting inventory restoration for order ${id}`);
        
        // Get order items (ensure no duplicates)
        const orderItemsRaw = await query<{
          product_id: string;
          quantity: number;
          name: string;
        }>(
          'SELECT product_id, quantity, name FROM order_items WHERE order_id = $1',
          [id]
        );
        
        // Deduplicate by product_id and sum quantities if there are duplicates
        const orderItemsMap = new Map<string, { product_id: string; quantity: number; name: string }>();
        for (const item of orderItemsRaw) {
          const existing = orderItemsMap.get(item.product_id);
          if (existing) {
            // Sum quantities if duplicate product_id found
            existing.quantity += item.quantity;
            console.warn(`[Inventory Restoration] Found duplicate product_id ${item.product_id} in order items. Summing quantities: ${existing.quantity - item.quantity} + ${item.quantity} = ${existing.quantity}`);
          } else {
            orderItemsMap.set(item.product_id, { ...item });
          }
        }
        
        const orderItems = Array.from(orderItemsMap.values());
        console.log(`[Inventory Restoration] Found ${orderItems.length} unique order items to restore (${orderItemsRaw.length} total rows)`);

        // Get warehouse allocations from order metadata if they exist
        let warehouseAllocations: WarehouseAllocation[] | null = null;
        let warehouseId: string | null = null;
        
        if (existingOrder.metadata && typeof existingOrder.metadata === 'string') {
          try {
            const metadata = JSON.parse(existingOrder.metadata);
            warehouseAllocations = metadata.warehouse_allocations || null;
            warehouseId = metadata.warehouse_id || null;
          } catch {
            // Metadata is not valid JSON, ignore
          }
        } else if (existingOrder.metadata && typeof existingOrder.metadata === 'object') {
          warehouseAllocations = existingOrder.metadata.warehouse_allocations || null;
          warehouseId = existingOrder.metadata.warehouse_id || null;
        }

        // Track unique product IDs to sync at the end
        const productsToSync = new Set<string>();
        
        // Helper function to sync product inventory (same logic as in warehouses route)
        const syncProductInventoryCount = async (productId: string): Promise<void> => {
          const { queryOne } = await import('@/lib/db');
          const totalWarehouseInventory = await queryOne<{ total: string }>(
            `SELECT COALESCE(SUM(inventory_count), 0) as total
             FROM product_warehouses
             WHERE product_id = $1`,
            [productId]
          );
          
          if (totalWarehouseInventory) {
            const totalInventory = parseInt(totalWarehouseInventory.total || '0', 10);
            await queryOne(
              `UPDATE products
               SET inventory_count = $1,
                   in_stock = ($1 > 0) OR (COALESCE(icc_available_quantity, 0) > 0),
                   updated_at = NOW()
               WHERE id = $2`,
              [totalInventory, productId]
            );
          }
        };

        // Restore inventory based on allocations if they exist, otherwise use simple restoration
        if (warehouseAllocations && Array.isArray(warehouseAllocations) && warehouseAllocations.length > 0) {
          // Restore from multiple warehouse allocations
          for (const allocation of warehouseAllocations) {
            for (const item of allocation.items) {
              // Restore warehouse-specific inventory
              await queryOne(
                `UPDATE product_warehouses 
                 SET inventory_count = inventory_count + $1,
                     updated_at = NOW()
                 WHERE product_id = $2 AND warehouse_id = $3`,
                [item.quantity, item.product_id, allocation.warehouse_id]
              );
              console.log(`Restored ${item.quantity} units of ${item.name} to warehouse ${allocation.warehouse_name} (${allocation.warehouse_id})`);
              
              // Track product for syncing
              productsToSync.add(item.product_id);
            }
          }
        } else {
          // Simple restoration for single warehouse or no warehouse
          for (const item of orderItems) {
            // If order has a warehouse, restore warehouse-specific inventory
            if (warehouseId) {
              await queryOne(
                `UPDATE product_warehouses 
                 SET inventory_count = inventory_count + $1,
                     updated_at = NOW()
                 WHERE product_id = $2 AND warehouse_id = $3`,
                [item.quantity, item.product_id, warehouseId]
              );
              console.log(`Restored ${item.quantity} units of ${item.name} to warehouse ${warehouseId}`);
            }

            // Track product for syncing
            productsToSync.add(item.product_id);
          }
        }

        // Restore ICC available quantity for supplier products
        // IMPORTANT: ICC quantity was reduced by the ORDER quantity (not allocated quantity)
        // So we must restore using the original order quantities, not allocated quantities
        const iccQuantitiesToRestore = new Map<string, number>();
        
        // Always use original order quantities for ICC restoration
        // This matches how ICC quantity was reduced during reservation (by order quantity)
        for (const item of orderItems) {
          const current = iccQuantitiesToRestore.get(item.product_id) || 0;
          iccQuantitiesToRestore.set(item.product_id, current + item.quantity);
          console.log(`[Inventory Restoration] Will restore ${item.quantity} units of ICC quantity for product ${item.product_id} (${item.name})`);
        }

        // Restore ICC available quantity for each supplier product
        console.log(`[Inventory Restoration] Restoring ICC quantities for ${iccQuantitiesToRestore.size} products`);
        
        for (const [productId, quantityToRestore] of iccQuantitiesToRestore.entries()) {
          console.log(`[Inventory Restoration] Processing product ${productId}, quantity to restore: ${quantityToRestore}`);
          
          // Check if this is a supplier product
          const product = await queryOne<{ supplier_id: string | null; icc_available_quantity: number | null }>(
            'SELECT supplier_id, icc_available_quantity FROM products WHERE id = $1 AND deleted_at IS NULL',
            [productId]
          );

          if (!product) {
            console.warn(`[Inventory Restoration] Product ${productId} not found, skipping ICC restoration`);
            continue;
          }

          console.log(`[Inventory Restoration] Product ${productId}: supplier_id=${product.supplier_id}, current icc_available_quantity=${product.icc_available_quantity}`);

          if (product.supplier_id) {
            // Get current ICC quantity before update
            const beforeUpdate = await queryOne<{ icc_available_quantity: number | null }>(
              'SELECT icc_available_quantity FROM products WHERE id = $1 AND deleted_at IS NULL',
              [productId]
            );
            
            // Restore ICC available quantity
            const updateResult = await queryOne<{ icc_available_quantity: number | null }>(
              `UPDATE products 
               SET icc_available_quantity = COALESCE(icc_available_quantity, 0) + $1,
                   updated_at = NOW()
               WHERE id = $2
               RETURNING icc_available_quantity`,
              [quantityToRestore, productId]
            );
            
            if (updateResult) {
              console.log(`✓ [Inventory Restoration] Successfully restored ${quantityToRestore} units to ICC available quantity for supplier product ${productId}`);
              console.log(`  - Before: ${beforeUpdate?.icc_available_quantity || 0}`);
              console.log(`  - After: ${updateResult.icc_available_quantity || 0}`);
            } else {
              console.error(`✗ [Inventory Restoration] Failed to restore ICC quantity for product ${productId} - UPDATE returned no rows`);
            }
          } else {
            console.log(`[Inventory Restoration] Product ${productId} is not a supplier product (supplier_id is null), skipping ICC restoration`);
          }
        }

        // Sync main product inventory_count with sum of warehouse inventories for all affected products
        for (const productId of productsToSync) {
          await syncProductInventoryCount(productId);
          console.log(`Synced main product inventory for product ${productId}`);
        }

        // Update in_stock flag based on warehouse inventory totals
        for (const productId of productsToSync) {
          // Check total warehouse inventory for this product
          const totalWarehouseInventory = await queryOne<{ total: number }>(
            `SELECT COALESCE(SUM(inventory_count), 0) as total
             FROM product_warehouses
             WHERE product_id = $1`,
            [productId]
          );

          const totalInventory = totalWarehouseInventory?.total || 0;

          // Update in_stock flag based on warehouse inventory total AND ICC quantity
          await queryOne(
            `UPDATE products 
             SET in_stock = CASE WHEN $1 > 0 OR COALESCE(icc_available_quantity, 0) > 0 THEN true ELSE false END,
                 updated_at = NOW()
             WHERE id = $2`,
            [totalInventory, productId]
          );

          console.log(`✓ Updated in_stock flag for product ${productId} (total warehouse inventory: ${totalInventory})`);
        }

        // Mark inventory as restored in order metadata to prevent double restoration
        const currentMetadata = existingOrder.metadata && typeof existingOrder.metadata === 'string'
          ? JSON.parse(existingOrder.metadata)
          : (existingOrder.metadata || {});
        
        currentMetadata.inventory_restored = true;
        currentMetadata.inventory_restored_at = new Date().toISOString();
        
        await queryOne(
          `UPDATE orders 
           SET metadata = $1, updated_at = NOW()
           WHERE id = $2`,
          [JSON.stringify(currentMetadata), id]
        );
        
        console.log(`✓ Marked inventory as restored in order metadata to prevent double restoration`);

        // Revalidate both admin and supplier products pages to ensure they show updated inventory
        revalidatePath('/admin/products');
        revalidatePath('/supplier/products');
        revalidatePath('/api/admin/products', 'page');
        revalidatePath('/api/supplier/products', 'page');
        console.log('✓ Revalidated /admin/products and /supplier/products pages to show restored inventory');
      } catch (error) {
        console.error('Error restoring inventory:', error);
        // Don't fail the status update if inventory restoration fails
      }
    }

    // Update order status and metadata (if tracking info provided)
    let order: Order | null;
    if (status === 'shipped' && tracking_number) {
      // Get existing metadata
      let currentMetadata: InvoiceMetadata = {};
      if (existingOrder.metadata && typeof existingOrder.metadata === 'string') {
        try {
          currentMetadata = JSON.parse(existingOrder.metadata) as InvoiceMetadata;
        } catch {
          // Invalid JSON, start fresh
        }
      } else if (existingOrder.metadata && typeof existingOrder.metadata === 'object') {
        currentMetadata = existingOrder.metadata;
      }

      // Add tracking information
      currentMetadata.tracking_number = tracking_number.trim();
      if (tracking_carrier && typeof tracking_carrier === 'string' && tracking_carrier.trim().length > 0) {
        currentMetadata.tracking_carrier = tracking_carrier.trim();
      }
      currentMetadata.tracking_added_at = new Date().toISOString();

      order = await queryOne<Order>(
        `UPDATE orders SET status = $2, metadata = $3, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id, status, JSON.stringify(currentMetadata)]
      );
    } else {
      order = await queryOne<Order>(
        `UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id, status]
      );
    }

    if (!order) {
      return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
    }

    // Log the action
    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'status_change',
      resourceType: 'order',
      resourceId: id,
      before: { status: existingOrder.status },
      after: { status: order!.status },
    });

    // Send email to customer if status changed
    if (existingOrder.status !== status) {
      try {
        // Get customer email and name
        const customerInfo = await queryOne<{ email: string; name: string }>(
          `SELECT u.email, u.name
           FROM "user" u
           WHERE u.id = $1`,
          [existingOrder.user_id]
        );

        if (customerInfo) {
          const orderUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/account/orders`;
          const statusLabels: Record<string, string> = {
            processing: 'Order Processing',
            shipped: 'Order Shipped',
            delivered: 'Order Delivered',
            cancelled: 'Order Cancelled',
            pending: 'Order Status Updated',
          };

          // Get tracking information from metadata if status is shipped
          let trackingNumber: string | undefined;
          let trackingCarrier: string | undefined;
          if (status === 'shipped' && order && order.metadata) {
            let metadata: InvoiceMetadata = {};
            if (typeof order.metadata === 'string') {
              try {
                metadata = JSON.parse(order.metadata) as InvoiceMetadata;
              } catch {
                // Invalid JSON, ignore
              }
            } else if (typeof order.metadata === 'object') {
              metadata = order.metadata;
            }
            trackingNumber = metadata.tracking_number;
            trackingCarrier = metadata.tracking_carrier;
          }

          await sendOrderStatusUpdate({
            to: customerInfo.email,
            subject: `${statusLabels[status] || 'Order Status Updated'}: ${existingOrder.order_number}`,
            orderNumber: existingOrder.order_number,
            customerName: customerInfo.name || 'Customer',
            oldStatus: existingOrder.status,
            newStatus: status,
            orderUrl,
            trackingNumber,
            trackingCarrier,
            ip: getClientIp(request),
          });
        }
      } catch (error) {
        // Don't fail the status update if email fails
        console.error('Failed to send order status update email:', error);
        securityLogger.logError('Failed to send order status update email', error, getClientIp(request));
      }
    }

    // Get warehouse allocations from updated order metadata to return in response
    let warehouseAllocations: WarehouseAllocation[] | null = null;
    if (order!.metadata && typeof order!.metadata === 'string') {
      try {
        const metadata = JSON.parse(order!.metadata);
        warehouseAllocations = metadata.warehouse_allocations || null;
      } catch {
        // Metadata is not valid JSON, ignore
      }
    } else if (order!.metadata && typeof order!.metadata === 'object') {
      warehouseAllocations = order!.metadata.warehouse_allocations || null;
    }

    // Return order with warehouse allocation info
    return NextResponse.json({
      ...order,
      warehouseAllocations: warehouseAllocations || null,
      multipleWarehouses: warehouseAllocations ? warehouseAllocations.length > 1 : false,
    });
  } catch (error) {
    console.error('Error updating order:', error);
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}

// POST /api/admin/orders/[id]/refund - Process a refund
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('orders.refund');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json();
    const { reason, amount } = body;

    const order = await queryOne<Order>('SELECT * FROM orders WHERE id = $1', [id]);

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // In a real app, you would process the refund through your payment provider here
    // For now, we'll just mark the order as cancelled and log the refund

    const updatedOrder = await queryOne<Order>(
      `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    // Log the refund action
    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'refund',
      resourceType: 'order',
      resourceId: id,
      before: { status: order.status, total: order.total },
      after: { 
        status: 'cancelled', 
        refund_amount: amount || order.total,
        refund_reason: reason || 'Customer request',
      },
    });

    return NextResponse.json({
      ...updatedOrder,
      refund: {
        amount: amount || order.total,
        reason: reason || 'Customer request',
        processed_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    return NextResponse.json({ error: 'Failed to process refund' }, { status: 500 });
  }
}

