import { Pool } from '@neondatabase/serverless';
import { addressSchema } from './validation';
import { formatPrice } from './utils';
import { isProductEligibleForState } from './state-eligibility';
import { allocateItemsToWarehousesFIFO, type FIFOWarehouseAllocation } from './warehouse-allocation';

interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
  name: string;
  image?: string;
  unitOfMeasure?: string | null;
}

interface ValidatedOrderItem extends OrderItem {
  actualPrice: number;
  priceMatch: boolean;
  inventory: number;
  inventoryAvailable: boolean;
  unitOfMeasure?: string | null;
  nextAvailableQuantity?: number | null;
  nextAvailableDate?: string | null;
  nextAvailableWarehouseName?: string | null;
  canFulfillPartially?: boolean;
  partialQuantity?: number;
  backorderQuantity?: number;
}

interface OrderValidationResult {
  valid: boolean;
  items: ValidatedOrderItem[];
  clientTotal: number;
  serverTotal: number;
  priceMismatch: boolean;
  inventoryIssues: boolean;
  hasRestrictedProducts: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate order items against database
 * - Recalculate prices from database
 * - Check inventory availability
 * - Detect price manipulation
 * - Validate state eligibility (if shippingState provided)
 */
export async function validateOrder(
  db: Pool,
  items: OrderItem[],
  clientTotal: number,
  shippingState?: string
): Promise<OrderValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const validatedItems: ValidatedOrderItem[] = [];

  let serverTotal = 0;
  let inventoryIssues = false;
  let hasRestrictedProducts = false;

  // Calculate total quantity for mixed tote order exception
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  
  // Check if all items are totes (for mixed order exception)
  // We'll determine this during validation to avoid duplicate queries
  let allItemsAreTotes = true;

  // Validate each item
  for (const item of items) {
    try {
      // Fetch product from database
      const result = await db.query(
        `SELECT id, name, price, unit_of_measure, inventory_count as inventory, in_stock as is_active, approved_states, restricted_use, next_available_quantity, next_available_date, minimum_order_qty, image, label_url, admin_label_url
         FROM products
         WHERE id = $1`,
        [item.productId]
      );

      if (result.rows.length === 0) {
        errors.push(`Product ${item.productId} not found`);
        continue;
      }

      const product = result.rows[0];

      // Check if product is active
      if (!product.is_active) {
        errors.push(`Product ${product.name} is not available for purchase`);
        continue;
      }

      // Check if product is a tote (for mixed order exception)
      if (product.unit_of_measure?.toLowerCase() !== 'tote') {
        allItemsAreTotes = false;
      }

      // Check state eligibility if shipping state is provided
      if (shippingState) {
        const isEligible = isProductEligibleForState(
          product.approved_states,
          shippingState
        );
        if (!isEligible) {
          errors.push(
            `Product ${product.name} is not approved for sale in ${shippingState}`
          );
        }
      }

      // Check if product is restricted use
      if (product.restricted_use) {
        hasRestrictedProducts = true;
      }

      // Check minimum order quantity
      // Exception: Allow if it's a mixed tote order with total quantity of 14
      if (product.minimum_order_qty !== null && item.quantity < product.minimum_order_qty) {
        // Check if this qualifies as a mixed tote order of 14
        // We need to check this after we've validated all items, so we'll defer the check
        // For now, we'll add the error, but we'll remove it later if it qualifies
        errors.push(
          `Product ${product.name} requires a minimum order quantity of ${product.minimum_order_qty}. You ordered ${item.quantity}.`
        );
      }

      // Check inventory - allow partial fulfillment
      const inventoryAvailable = product.inventory >= item.quantity;
      const fulfillableQuantity = Math.min(product.inventory, item.quantity);
      const backorderQuantity = Math.max(0, item.quantity - product.inventory);
      
      if (!inventoryAvailable) {
        inventoryIssues = true;
        // Add as warning instead of error to allow checkout to proceed
        const nextAvailableInfo = product.next_available_date 
          ? ` Additional quantity will be available on ${new Date(product.next_available_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`
          : '';
        warnings.push(
          `Partial inventory for ${product.name}. Available: ${product.inventory}, Requested: ${item.quantity}.${nextAvailableInfo}`
        );
      }

      // Check price match
      const actualPrice = parseFloat(product.price);
      const priceMatch = Math.abs(actualPrice - item.price) < 0.01; // Allow 1 cent difference for rounding
      
      if (!priceMatch) {
        warnings.push(
          `Price mismatch for ${product.name}. Client: ${formatPrice(item.price)}, Server: ${formatPrice(actualPrice)}`
        );
      }

      // Calculate item total using server price (charge for full quantity even if backordered)
      const itemTotal = actualPrice * item.quantity;
      serverTotal += itemTotal;

      // Use DB image as fallback when cart doesn't have an image
      const productImage = item.image?.trim() || product.image || product.admin_label_url || product.label_url || undefined;

      validatedItems.push({
        ...item,
        image: productImage,
        actualPrice,
        priceMatch,
        inventory: product.inventory,
        inventoryAvailable,
        unitOfMeasure: product.unit_of_measure,
        nextAvailableQuantity: product.next_available_quantity || null,
        nextAvailableDate: product.next_available_date ? new Date(product.next_available_date).toISOString() : null,
        canFulfillPartially: !inventoryAvailable && product.inventory > 0,
        partialQuantity: fulfillableQuantity,
        backorderQuantity: backorderQuantity > 0 ? backorderQuantity : undefined,
      });
    } catch (error) {
      errors.push(`Error validating product ${item.productId}: ${error}`);
    }
  }

  // Check if this qualifies as a mixed tote order of 14
  // If so, remove minimum order quantity errors
  const isMixedToteOrderOf14 = allItemsAreTotes && totalQuantity === 14 && items.length > 1;
  
  if (isMixedToteOrderOf14) {
    // Remove minimum order quantity errors for mixed tote orders of 14
    const filteredErrors = errors.filter(error => 
      !error.includes('requires a minimum order quantity')
    );
    // Clear and repopulate errors array
    errors.length = 0;
    errors.push(...filteredErrors);
  }

  // Round to 2 decimal places
  serverTotal = Math.round(serverTotal * 100) / 100;
  
  // Check total price mismatch
  const priceMismatch = Math.abs(serverTotal - clientTotal) > 0.01;
  
  if (priceMismatch) {
    errors.push(
      `Total price mismatch. Client total: ${formatPrice(clientTotal)}, Server total: ${formatPrice(serverTotal)}`
    );
  }

  return {
    valid: errors.length === 0,
    items: validatedItems,
    clientTotal,
    serverTotal,
    priceMismatch,
    inventoryIssues,
    hasRestrictedProducts,
    errors,
    warnings,
  };
}

/**
 * Validate shipping address
 */
export function validateShippingAddress(address: unknown): { valid: boolean; errors: string[] } {
  const result = addressSchema.safeParse(address);
  
  if (result.success) {
    return { valid: true, errors: [] };
  }
  
  return {
    valid: false,
    errors: result.error.issues.map((err) => `${err.path.join('.')}: ${err.message}`),
  };
}

/**
 * Detect suspicious order patterns
 */
export function detectSuspiciousPatterns(
  items: OrderItem[],
  shippingAddress: unknown,
  userId?: string
): { suspicious: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  // Check for unusually large quantities
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  if (totalQuantity > 100) {
    reasons.push(`Unusually large order quantity: ${totalQuantity}`);
  }
  
  // Check for unusually high order value
  const totalValue = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (totalValue > 50000) {
    reasons.push(`Unusually high order value: $${totalValue}`);
  }
  
  // Check for duplicate items (could be manipulation attempt)
  const productIds = items.map((item) => item.productId);
  const uniqueProductIds = new Set(productIds);
  if (productIds.length !== uniqueProductIds.size) {
    reasons.push('Duplicate items in order');
  }
  
  // Check for missing required fields
  const address = shippingAddress as { line1?: string; city?: string; state?: string } | null | undefined;
  if (!address?.line1 || !address?.city || !address?.state) {
    reasons.push('Incomplete shipping address');
  }
  
  // Check for guest checkout with high value
  if (!userId && totalValue > 1000) {
    reasons.push('High-value guest checkout');
  }
  
  return {
    suspicious: reasons.length > 0,
    reasons,
  };
}

/**
 * Calculate order totals with tax and shipping
 */
export function calculateOrderTotals(
  items: ValidatedOrderItem[],
  shippingCost: number = 0,
  taxRate: number = 0
): {
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
} {
  const subtotal = items.reduce(
    (sum, item) => sum + item.actualPrice * item.quantity,
    0
  );
  
  const tax = subtotal * taxRate;
  const total = subtotal + tax + shippingCost;
  
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    shipping: Math.round(shippingCost * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

/**
 * Reserve inventory for order
 * Allows partial fulfillment - reserves up to available inventory
 * This should be called within a transaction
 */
export async function reserveInventory(
  db: Pool,
  items: OrderItem[],
  skipICCQuantityDeduction: boolean = false
): Promise<{ success: boolean; errors: string[]; partiallyFulfilled: boolean; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let partiallyFulfilled = false;
  
  // Get a single client connection for the transaction
  const client = await db.connect();
  
  try {
    await client.query('BEGIN');
    
    for (const item of items) {
      // First, check current inventory to see how much we can reserve
      const productResult = await client.query(
        `SELECT inventory_count, icc_available_quantity, in_stock FROM products WHERE id = $1 FOR UPDATE`,
        [item.productId]
      );
      
      if (productResult.rowCount === 0) {
        // Product not found - this is a critical error but we'll log it and continue
        // The order validation should have caught this, so this is unexpected
        console.warn(`Product ${item.productId} not found during inventory reservation`);
        continue;
      }
      
      const product = productResult.rows[0];
      
      if (!product.in_stock) {
        // Product not in stock - allow order to proceed (partial fulfillment scenario)
        warnings.push(`Product ${item.productId} is not in stock. Order will be partially fulfilled.`);
        partiallyFulfilled = true;
        continue;
      }
      
      const availableInventory = product.inventory_count || 0;
      const availableICCQuantity = product.icc_available_quantity || 0;
      const quantityToReserve = Math.min(item.quantity, availableInventory);

      if (quantityToReserve < item.quantity) {
        // Partial fulfillment detected
        partiallyFulfilled = true;
        warnings.push(
          `Partial inventory reserved for product ${item.productId}. Requested: ${item.quantity}, Reserved: ${quantityToReserve}, Available: ${availableInventory}`
        );
      }
      
      // Check if this product has warehouse entries
      // If it does, we should NOT deduct from products.inventory_count here
      // Warehouse inventory will be deducted separately and then synced to products.inventory_count
      const warehouseCheck = await client.query(
        `SELECT COUNT(*) as count FROM product_warehouses WHERE product_id = $1`,
        [item.productId]
      );
      const hasWarehouses = warehouseCheck.rows[0]?.count > 0;

      if (quantityToReserve > 0) {
        // Reserve what we can (up to requested quantity)
        // Also reduce icc_available_quantity by the order quantity
        console.log(`[Inventory Reservation] Product ${item.productId}: Before update - inventory_count: ${availableInventory}, icc_available_quantity: ${availableICCQuantity}, order quantity: ${item.quantity}, hasWarehouses: ${hasWarehouses}`);
        
        if (hasWarehouses) {
          // Product has warehouses - only reduce ICC quantity, don't touch inventory_count
          // Warehouse inventory will be deducted separately and synced to products.inventory_count
          // Skip ICC quantity deduction if it was already deducted at order creation
          if (skipICCQuantityDeduction) {
            console.log(`[Inventory Reservation] Product ${item.productId} (has warehouses): Skipping ICC quantity deduction (already deducted at order creation)`);
          } else {
            console.log(`[Inventory Reservation] Product ${item.productId} (has warehouses): Reducing ICC quantity by ${item.quantity} (current: ${availableICCQuantity})`);
            const result = await client.query(
              `UPDATE products 
               SET icc_available_quantity = GREATEST(0, icc_available_quantity - $1),
                   updated_at = NOW()
               WHERE id = $2
               RETURNING icc_available_quantity`,
              [item.quantity, item.productId]
            );
            
            if (result.rowCount === 0) {
              console.error(`[Inventory Reservation] FAILED to update ICC quantity for product ${item.productId} - UPDATE returned no rows!`);
            } else {
              const updatedICCQuantity = result.rows[0].icc_available_quantity;
              console.log(`[Inventory Reservation] ✓ Product ${item.productId} (has warehouses): ICC quantity reduced from ${availableICCQuantity} to ${updatedICCQuantity} (reduced by ${item.quantity}). inventory_count will be synced from warehouses.`);
            }
          }
        } else {
          // Product has no warehouses - deduct from inventory_count normally
          // Skip ICC quantity deduction if it was already deducted at order creation
          if (skipICCQuantityDeduction) {
            console.log(`[Inventory Reservation] Product ${item.productId} (no warehouses): Reducing inventory_count by ${quantityToReserve}, skipping ICC quantity (already deducted at order creation)`);
            const result = await client.query(
              `UPDATE products 
               SET inventory_count = inventory_count - $1,
                   in_stock = CASE WHEN (inventory_count - $1) > 0 OR COALESCE(icc_available_quantity, 0) > 0 THEN true ELSE false END,
                   updated_at = NOW()
               WHERE id = $2
               RETURNING inventory_count as inventory`,
              [quantityToReserve, item.productId]
            );
            
            if (result.rowCount === 0) {
              console.warn(`[Inventory Reservation] Failed to update inventory for product ${item.productId}`);
            } else {
              const updatedInventory = result.rows[0].inventory;
              console.log(`[Inventory Reservation] ✓ Product ${item.productId} (no warehouses): After update - inventory_count: ${updatedInventory} (ICC quantity already deducted)`);
            }
          } else {
            const result = await client.query(
              `UPDATE products 
               SET inventory_count = inventory_count - $1,
                   icc_available_quantity = GREATEST(0, icc_available_quantity - $2),
                   in_stock = CASE WHEN (inventory_count - $1) > 0 OR GREATEST(0, COALESCE(icc_available_quantity, 0) - $2) > 0 THEN true ELSE false END,
                   updated_at = NOW()
               WHERE id = $3
               RETURNING inventory_count as inventory, icc_available_quantity`,
              [quantityToReserve, item.quantity, item.productId]
            );
            
            if (result.rowCount === 0) {
              console.warn(`[Inventory Reservation] Failed to update inventory for product ${item.productId}`);
            } else {
              const updatedInventory = result.rows[0].inventory;
              const updatedICCQuantity = result.rows[0].icc_available_quantity;
              console.log(`[Inventory Reservation] ✓ Product ${item.productId} (no warehouses): After update - inventory_count: ${updatedInventory}, icc_available_quantity: ${updatedICCQuantity} (reduced from ${availableICCQuantity} by ${item.quantity})`);
            }
          }
        }
      } else {
        // Even if we can't reserve inventory, we should still reduce ICC quantity
        // This handles the case where inventory_count is 0 but ICC quantity still needs to be reduced
        // Skip ICC quantity deduction if it was already deducted at order creation
        if (skipICCQuantityDeduction) {
          console.log(`[Inventory Reservation] Product ${item.productId}: Cannot reserve inventory (available: ${availableInventory}), skipping ICC quantity (already deducted at order creation)`);
        } else {
          console.log(`[Inventory Reservation] Product ${item.productId}: Cannot reserve inventory (available: ${availableInventory}), but reducing ICC quantity by ${item.quantity} (current: ${availableICCQuantity})`);
          
          const result = await client.query(
            `UPDATE products 
             SET icc_available_quantity = GREATEST(0, icc_available_quantity - $1),
                 updated_at = NOW()
             WHERE id = $2
             RETURNING icc_available_quantity`,
            [item.quantity, item.productId]
          );
          
          if (result.rowCount && result.rowCount > 0) {
            const updatedICCQuantity = result.rows[0].icc_available_quantity;
            console.log(`[Inventory Reservation] ✓ Product ${item.productId}: ICC quantity reduced from ${availableICCQuantity} to ${updatedICCQuantity} (reduced by ${item.quantity})`);
          } else {
            console.error(`[Inventory Reservation] FAILED to update ICC quantity for product ${item.productId} - UPDATE returned no rows!`);
          }
        }
      }
      
      // If we can't reserve the full quantity, that's okay - partial fulfillment is allowed
      // The order will proceed and we'll handle the rest when shipping
    }
    
    // Always commit - partial fulfillment is allowed
    // We reserve what's available and allow the order to proceed
    await client.query('COMMIT');
    console.log(`[Inventory Reservation] ✓ Transaction committed successfully for ${items.length} item(s)`);
    return { success: true, errors: [], partiallyFulfilled, warnings };
  } catch (error) {
    await client.query('ROLLBACK');
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`Inventory reservation failed: ${errorMsg}`);
    console.error(`[Inventory Reservation] ✗ Transaction rolled back due to error: ${errorMsg}`);
    return { success: false, errors, partiallyFulfilled: false, warnings: [] };
  } finally {
    // Always release the client back to the pool
    client.release();
  }
}

/**
 * Reserve inventory using FIFO (First-In-First-Out) logic
 * Exhausts inventory from oldest supplier warehouses first
 * Supports product substitution (like products with same name)
 * This should be called within a transaction
 */
export async function reserveInventoryFIFO(
  db: Pool,
  items: OrderItem[],
  skipICCQuantityDeduction: boolean = false
): Promise<{ 
  success: boolean; 
  errors: string[]; 
  partiallyFulfilled: boolean; 
  warnings: string[];
  allocations?: FIFOWarehouseAllocation[];
  substitutions?: Array<{ original_product_id: string; allocated_product_id: string; supplier_company: string | null }>;
}> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let partiallyFulfilled = false;

  // Get a single client connection for the transaction
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    console.log(`[FIFO Inventory Reservation] Starting FIFO allocation for ${items.length} items`);

    // Convert items to format expected by allocateItemsToWarehousesFIFO
    const orderItems = items.map(item => ({
      product_id: item.productId,
      quantity: item.quantity,
      name: item.name,
    }));

    // Use FIFO allocation to determine which warehouses to pull from
    const fifoResult = await allocateItemsToWarehousesFIFO(orderItems);

    // Add FIFO warnings to our warnings array
    warnings.push(...fifoResult.warnings);

    if (fifoResult.unfulfilledItems.length > 0) {
      partiallyFulfilled = true;
      for (const unfulfilled of fifoResult.unfulfilledItems) {
        warnings.push(`Unfulfilled: ${unfulfilled.quantity} units of ${unfulfilled.name}`);
      }
    }

    if (fifoResult.allocations.length === 0) {
      console.log(`[FIFO Inventory Reservation] No allocations possible - no inventory available`);
      await client.query('COMMIT');
      return {
        success: true,
        errors: [],
        partiallyFulfilled: true,
        warnings,
        allocations: [],
        substitutions: fifoResult.substitutions,
      };
    }

    console.log(`[FIFO Inventory Reservation] FIFO allocated ${fifoResult.allocations.length} warehouse groups`);

    // Now reserve inventory based on FIFO allocations
    for (const allocation of fifoResult.allocations) {
      for (const item of allocation.items) {
        const allocatedProductId = item.allocated_product_id;
        const quantityToReserve = item.quantity;

        console.log(`[FIFO Inventory Reservation] Reserving ${quantityToReserve} units of product ${allocatedProductId} from warehouse ${allocation.warehouse_name}`);

        // Lock the product for update
        const productResult = await client.query(
          `SELECT inventory_count, icc_available_quantity, in_stock FROM products WHERE id = $1 FOR UPDATE`,
          [allocatedProductId]
        );

        if (productResult.rowCount === 0) {
          console.warn(`[FIFO Inventory Reservation] Product ${allocatedProductId} not found`);
          warnings.push(`Product ${item.name} not found during reservation`);
          continue;
        }

        const product = productResult.rows[0];
        const availableICCQuantity = product.icc_available_quantity || 0;

        // Check if this product has warehouses
        const warehouseCheck = await client.query(
          `SELECT COUNT(*) as count FROM product_warehouses WHERE product_id = $1`,
          [allocatedProductId]
        );
        const hasWarehouses = warehouseCheck.rows[0]?.count > 0;

        if (hasWarehouses) {
          // Product has warehouses - only reduce ICC quantity
          if (!skipICCQuantityDeduction) {
            console.log(`[FIFO Inventory Reservation] Reducing ICC quantity for product ${allocatedProductId} by ${quantityToReserve}`);
            const result = await client.query(
              `UPDATE products 
               SET icc_available_quantity = GREATEST(0, icc_available_quantity - $1),
                   updated_at = NOW()
               WHERE id = $2
               RETURNING icc_available_quantity`,
              [quantityToReserve, allocatedProductId]
            );

            if (result.rowCount === 0) {
              console.error(`[FIFO Inventory Reservation] Failed to update ICC quantity for product ${allocatedProductId}`);
            } else {
              const updatedICCQuantity = result.rows[0].icc_available_quantity;
              console.log(`[FIFO Inventory Reservation] ✓ ICC quantity reduced from ${availableICCQuantity} to ${updatedICCQuantity}`);
            }
          }
        } else {
          // Product has no warehouses - deduct from inventory_count
          if (skipICCQuantityDeduction) {
            const result = await client.query(
              `UPDATE products 
               SET inventory_count = inventory_count - $1,
                   in_stock = CASE WHEN (inventory_count - $1) > 0 OR COALESCE(icc_available_quantity, 0) > 0 THEN true ELSE false END,
                   updated_at = NOW()
               WHERE id = $2
               RETURNING inventory_count`,
              [quantityToReserve, allocatedProductId]
            );

            if (result.rowCount && result.rowCount > 0) {
              console.log(`[FIFO Inventory Reservation] ✓ Inventory reduced to ${result.rows[0].inventory_count}`);
            }
          } else {
            const result = await client.query(
              `UPDATE products 
               SET inventory_count = inventory_count - $1,
                   icc_available_quantity = GREATEST(0, icc_available_quantity - $2),
                   in_stock = CASE WHEN (inventory_count - $1) > 0 OR GREATEST(0, COALESCE(icc_available_quantity, 0) - $2) > 0 THEN true ELSE false END,
                   updated_at = NOW()
               WHERE id = $3
               RETURNING inventory_count, icc_available_quantity`,
              [quantityToReserve, quantityToReserve, allocatedProductId]
            );

            if (result.rowCount && result.rowCount > 0) {
              console.log(`[FIFO Inventory Reservation] ✓ Inventory and ICC quantity reduced`);
            }
          }
        }
      }
    }

    await client.query('COMMIT');
    console.log(`[FIFO Inventory Reservation] ✓ Transaction committed successfully`);

    return {
      success: true,
      errors: [],
      partiallyFulfilled,
      warnings,
      allocations: fifoResult.allocations,
      substitutions: fifoResult.substitutions,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`FIFO inventory reservation failed: ${errorMsg}`);
    console.error(`[FIFO Inventory Reservation] ✗ Transaction rolled back due to error: ${errorMsg}`);
    return { 
      success: false, 
      errors, 
      partiallyFulfilled: false, 
      warnings: [],
    };
  } finally {
    client.release();
  }
}

