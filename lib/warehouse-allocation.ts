import { query, queryOne } from '@/lib/db';

export interface OrderItem {
  product_id: string;
  quantity: number;
  name: string;
}

export interface WarehouseInventory {
  warehouse_id: string;
  warehouse_name: string;
  inventory_count: number;
  warehouse_location: string | null;
}

export interface AllocatedItem {
  product_id: string;
  quantity: number;
  name: string;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_location: string | null;
}

export interface WarehouseAllocation {
  warehouse_id: string;
  warehouse_name: string;
  warehouse_location: string | null;
  items: AllocatedItem[];
}

export interface FIFOAllocatedItem extends AllocatedItem {
  supplier_id: string | null;
  supplier_company: string | null;
  original_product_id: string;  // The product that was ordered
  allocated_product_id: string; // The actual product used (may be from different supplier)
  warehouse_entry_date: Date;
}

export interface FIFOWarehouseAllocation extends WarehouseAllocation {
  supplier_id: string | null;
  supplier_company: string | null;
  items: FIFOAllocatedItem[];
}

interface WarehouseInventoryFIFO {
  product_id: string;
  warehouse_id: string;
  warehouse_name: string;
  inventory_count: number;
  warehouse_location: string | null;
  warehouse_entry_date: Date;
  supplier_id: string | null;
  supplier_company: string | null;
  supplier_created_at: Date | null;
}

/**
 * Find warehouses with sufficient inventory for a product
 */
export async function findWarehousesWithInventory(
  productId: string,
  requiredQuantity: number
): Promise<WarehouseInventory[]> {
  const warehouses = await query<WarehouseInventory>(
    `SELECT 
      pw.warehouse_id,
      w.name as warehouse_name,
      pw.inventory_count,
      pw.warehouse_location
    FROM product_warehouses pw
    JOIN warehouses w ON w.id = pw.warehouse_id
    WHERE pw.product_id = $1 
      AND pw.inventory_count >= $2
      AND w.is_active = true
    ORDER BY pw.inventory_count DESC`,
    [productId, requiredQuantity]
  );

  return warehouses;
}

/**
 * Find warehouses with any inventory for a product (for partial fulfillment)
 */
export async function findWarehousesWithAnyInventory(
  productId: string
): Promise<WarehouseInventory[]> {
  const warehouses = await query<WarehouseInventory>(
    `SELECT 
      pw.warehouse_id,
      w.name as warehouse_name,
      pw.inventory_count,
      pw.warehouse_location
    FROM product_warehouses pw
    JOIN warehouses w ON w.id = pw.warehouse_id
    WHERE pw.product_id = $1 
      AND pw.inventory_count > 0
      AND w.is_active = true
    ORDER BY pw.inventory_count DESC`,
    [productId]
  );

  return warehouses;
}

/**
 * Allocate order items across warehouses based on inventory availability
 * Returns an array of warehouse allocations
 */
export async function allocateItemsToWarehouses(
  items: OrderItem[],
  preferredWarehouseId?: string | null
): Promise<{
  allocations: WarehouseAllocation[];
  unfulfilledItems: OrderItem[];
  warnings: string[];
}> {
  const allocations: Map<string, WarehouseAllocation> = new Map();
  const unfulfilledItems: OrderItem[] = [];
  const warnings: string[] = [];

  // Process each item
  for (const item of items) {
    let remainingQuantity = item.quantity;
    let allocated = false;

    // First, try preferred warehouse if specified
    if (preferredWarehouseId && remainingQuantity > 0) {
      const preferredWarehouse = await queryOne<WarehouseInventory>(
        `SELECT 
          pw.warehouse_id,
          w.name as warehouse_name,
          pw.inventory_count,
          pw.warehouse_location
        FROM product_warehouses pw
        JOIN warehouses w ON w.id = pw.warehouse_id
        WHERE pw.product_id = $1 
          AND pw.warehouse_id = $2
          AND w.is_active = true`,
        [item.product_id, preferredWarehouseId]
      );

      if (preferredWarehouse && preferredWarehouse.inventory_count >= remainingQuantity) {
        // Preferred warehouse has enough
        const allocationKey = preferredWarehouse.warehouse_id;
        if (!allocations.has(allocationKey)) {
          allocations.set(allocationKey, {
            warehouse_id: preferredWarehouse.warehouse_id,
            warehouse_name: preferredWarehouse.warehouse_name,
            warehouse_location: preferredWarehouse.warehouse_location,
            items: [],
          });
        }

        allocations.get(allocationKey)!.items.push({
          product_id: item.product_id,
          quantity: remainingQuantity,
          name: item.name,
          warehouse_id: preferredWarehouse.warehouse_id,
          warehouse_name: preferredWarehouse.warehouse_name,
          warehouse_location: preferredWarehouse.warehouse_location,
        });

        remainingQuantity = 0;
        allocated = true;
      } else if (preferredWarehouse && preferredWarehouse.inventory_count > 0) {
        // Preferred warehouse has partial inventory
        const partialQuantity = preferredWarehouse.inventory_count;
        const allocationKey = preferredWarehouse.warehouse_id;
        
        if (!allocations.has(allocationKey)) {
          allocations.set(allocationKey, {
            warehouse_id: preferredWarehouse.warehouse_id,
            warehouse_name: preferredWarehouse.warehouse_name,
            warehouse_location: preferredWarehouse.warehouse_location,
            items: [],
          });
        }

        allocations.get(allocationKey)!.items.push({
          product_id: item.product_id,
          quantity: partialQuantity,
          name: item.name,
          warehouse_id: preferredWarehouse.warehouse_id,
          warehouse_name: preferredWarehouse.warehouse_name,
          warehouse_location: preferredWarehouse.warehouse_location,
        });

        remainingQuantity -= partialQuantity;
        warnings.push(
          `Only ${partialQuantity} of ${item.quantity} units of ${item.name} available at preferred warehouse. Remaining will be allocated to other warehouses.`
        );
      }
    }

    // If still need more, find other warehouses
    // IMPORTANT: Only allocate what's actually available at each warehouse
    while (remainingQuantity > 0) {
      // Re-fetch available warehouses to get current inventory counts
      // This ensures we have the latest inventory data
      const availableWarehouses = await findWarehousesWithAnyInventory(item.product_id);

      if (availableWarehouses.length === 0) {
        // No warehouses have inventory for this item
        unfulfilledItems.push({
          product_id: item.product_id,
          quantity: remainingQuantity,
          name: item.name,
        });
        warnings.push(
          `Insufficient inventory for ${item.name}. Need ${remainingQuantity} more units.`
        );
        break;
      }

      // Filter out warehouses we've already allocated from (to avoid double allocation)
      const alreadyUsedWarehouses = new Set(
        Array.from(allocations.values()).map(a => a.warehouse_id)
      );

      // Find warehouse with available inventory (prefer warehouses not already used)
      let foundWarehouse: WarehouseInventory | null = null;

      // First, try to find a warehouse with enough for the full remaining quantity
      // Exclude preferred warehouse (already tried) and already used warehouses
      for (const warehouse of availableWarehouses) {
        if (warehouse.warehouse_id === preferredWarehouseId) continue; // Already tried
        if (alreadyUsedWarehouses.has(warehouse.warehouse_id)) continue; // Already allocated from this warehouse
        
        // Re-check current inventory to ensure it's still available
        const currentInventory = await queryOne<{ inventory_count: number }>(
          `SELECT inventory_count 
           FROM product_warehouses 
           WHERE product_id = $1 AND warehouse_id = $2`,
          [item.product_id, warehouse.warehouse_id]
        );

        if (currentInventory && currentInventory.inventory_count >= remainingQuantity) {
          foundWarehouse = {
            ...warehouse,
            inventory_count: currentInventory.inventory_count, // Use current inventory
          };
          break;
        }
      }

      // If no warehouse has enough, use the one with the most available inventory
      if (!foundWarehouse) {
        for (const warehouse of availableWarehouses) {
          if (warehouse.warehouse_id === preferredWarehouseId) continue;
          if (alreadyUsedWarehouses.has(warehouse.warehouse_id)) continue;

          // Re-check current inventory
          const currentInventory = await queryOne<{ inventory_count: number }>(
            `SELECT inventory_count 
             FROM product_warehouses 
             WHERE product_id = $1 AND warehouse_id = $2`,
            [item.product_id, warehouse.warehouse_id]
          );

          if (currentInventory && currentInventory.inventory_count > 0) {
            if (!foundWarehouse || currentInventory.inventory_count > foundWarehouse.inventory_count) {
              foundWarehouse = {
                ...warehouse,
                inventory_count: currentInventory.inventory_count,
              };
            }
          }
        }
      }

      if (foundWarehouse && foundWarehouse.inventory_count > 0) {
        const allocationKey = foundWarehouse.warehouse_id;
        // CRITICAL: Only allocate what's actually available at this warehouse
        // Never exceed the available inventory
        const quantityToAllocate = Math.min(remainingQuantity, foundWarehouse.inventory_count);

        if (quantityToAllocate <= 0) {
          // No inventory available at this warehouse, try next one
          continue;
        }

        if (!allocations.has(allocationKey)) {
          allocations.set(allocationKey, {
            warehouse_id: foundWarehouse.warehouse_id,
            warehouse_name: foundWarehouse.warehouse_name,
            warehouse_location: foundWarehouse.warehouse_location,
            items: [],
          });
        }

        allocations.get(allocationKey)!.items.push({
          product_id: item.product_id,
          quantity: quantityToAllocate,
          name: item.name,
          warehouse_id: foundWarehouse.warehouse_id,
          warehouse_name: foundWarehouse.warehouse_name,
          warehouse_location: foundWarehouse.warehouse_location,
        });

        remainingQuantity -= quantityToAllocate;
        allocated = true;

        // Fix: Check if we allocated less than the original requested quantity
        if (quantityToAllocate < item.quantity) {
          warnings.push(
            `Partial allocation: ${quantityToAllocate} of ${item.quantity} units of ${item.name} from ${foundWarehouse.warehouse_name}.`
          );
        }
      } else {
        // No more warehouses available with inventory
        unfulfilledItems.push({
          product_id: item.product_id,
          quantity: remainingQuantity,
          name: item.name,
        });
        warnings.push(
          `Insufficient inventory for ${item.name}. Need ${remainingQuantity} more units.`
        );
        break;
      }
    }

    if (allocated && remainingQuantity === 0) {
      // Successfully allocated all of this item
    }
  }

  return {
    allocations: Array.from(allocations.values()),
    unfulfilledItems,
    warnings,
  };
}

/**
 * Deduct inventory from product_warehouses based on warehouse allocations
 * This should be called when shipping the order (e.g., when sending BOL)
 * @param allocations - Array of warehouse allocations from allocateItemsToWarehouses
 * @returns Object with success status and any errors
 */
export async function deductWarehouseInventory(
  allocations: WarehouseAllocation[]
): Promise<{ success: boolean; errors: string[]; warnings: string[] }> {
  const warnings: string[] = [];

  try {
    // Process each warehouse allocation
    for (const allocation of allocations) {
      // Process each item allocated to this warehouse
      for (const item of allocation.items) {
        try {
          // First, check current inventory to see what's available
          const currentInventory = await queryOne<{ inventory_count: number }>(
            `SELECT inventory_count 
             FROM product_warehouses
             WHERE product_id = $1 AND warehouse_id = $2`,
            [item.product_id, allocation.warehouse_id]
          );

          if (!currentInventory) {
            warnings.push(
              `Product-warehouse entry not found: ${item.name} at ${allocation.warehouse_name}. Inventory not deducted.`
            );
            continue;
          }

          const availableInventory = currentInventory.inventory_count || 0;
          const quantityToDeduct = Math.min(item.quantity, availableInventory);

          if (quantityToDeduct === 0) {
            warnings.push(
              `No inventory available to deduct for ${item.name} at warehouse ${allocation.warehouse_name}. Requested: ${item.quantity}, Available: 0.`
            );
            continue;
          }

          if (quantityToDeduct < item.quantity) {
            warnings.push(
              `Partial inventory deduction for ${item.name} at warehouse ${allocation.warehouse_name}. Requested: ${item.quantity}, Deducted: ${quantityToDeduct}, Available: ${availableInventory}.`
            );
          }

          // Deduct what's available (up to requested quantity)
          const result = await queryOne<{ inventory_count: number }>(
            `UPDATE product_warehouses
             SET inventory_count = inventory_count - $1,
                 updated_at = NOW()
             WHERE product_id = $2 
               AND warehouse_id = $3
             RETURNING inventory_count`,
            [quantityToDeduct, item.product_id, allocation.warehouse_id]
          );

          if (!result) {
            warnings.push(
              `Failed to deduct ${quantityToDeduct} units of ${item.name} from warehouse ${allocation.warehouse_name}.`
            );
            continue;
          }

          // Sync the main product inventory_count (sum of all warehouse inventories)
          const totalWarehouseInventory = await queryOne<{ total: string }>(
            `SELECT COALESCE(SUM(inventory_count), 0) as total
             FROM product_warehouses
             WHERE product_id = $1`,
            [item.product_id]
          );

          if (totalWarehouseInventory) {
            const totalInventory = parseInt(totalWarehouseInventory.total || '0', 10);
            await queryOne(
              `UPDATE products
               SET inventory_count = $1,
                   in_stock = ($1 > 0) OR (COALESCE(icc_available_quantity, 0) > 0),
                   updated_at = NOW()
               WHERE id = $2`,
              [totalInventory, item.product_id]
            );
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          warnings.push(
            `Error deducting inventory for ${item.name} from warehouse ${allocation.warehouse_name}: ${errorMsg}`
          );
        }
      }
    }

    // Always return success - warnings indicate partial or failed deductions, but don't block the operation
    return {
      success: true,
      errors: [],
      warnings,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      errors: [`Failed to deduct warehouse inventory: ${errorMsg}`],
      warnings: [],
    };
  }
}

/**
 * Allocate order items using FIFO (First-In-First-Out) logic
 * Exhausts inventory from one supplier's warehouses before moving to another
 * Orders by: 1) Supplier age (oldest first), 2) Warehouse entry date (oldest first)
 * Supports "like products" - products with the same name from different suppliers
 */
export async function allocateItemsToWarehousesFIFO(
  items: OrderItem[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _preferredWarehouseId?: string | null
): Promise<{
  allocations: FIFOWarehouseAllocation[];
  unfulfilledItems: OrderItem[];
  warnings: string[];
  substitutions: Array<{ original_product_id: string; allocated_product_id: string; supplier_company: string | null }>;
}> {
  const allocations: Map<string, FIFOWarehouseAllocation> = new Map();
  const unfulfilledItems: OrderItem[] = [];
  const warnings: string[] = [];
  const substitutions: Array<{ original_product_id: string; allocated_product_id: string; supplier_company: string | null }> = [];

  // Process each item
  for (const item of items) {
    let remainingQuantity = item.quantity;
    const originalProductId = item.product_id;

    console.log(`[FIFO Allocation] Processing item: ${item.name} (${item.product_id}), quantity: ${item.quantity}`);

    // Step 1: Find all "like products" (same name)
    const likeProducts = await query<{
      id: string;
      name: string;
      supplier_id: string | null;
      company_name: string | null;
    }>(
      `SELECT p.id, p.name, p.supplier_id, su.company_name
       FROM products p
       LEFT JOIN supplier_users su ON su.id = p.supplier_id
       WHERE p.name = $1 AND p.deleted_at IS NULL
       ORDER BY p.id`,
      [item.name]
    );

    if (likeProducts.length === 0) {
      console.log(`[FIFO Allocation] No in-stock products found with name: ${item.name}`);
      unfulfilledItems.push({
        product_id: item.product_id,
        quantity: remainingQuantity,
        name: item.name,
      });
      warnings.push(`No inventory available for ${item.name}`);
      continue;
    }

    const productIds = likeProducts.map(p => p.id);
    console.log(`[FIFO Allocation] Found ${likeProducts.length} like products: ${productIds.join(', ')}`);

    // Step 2: Get warehouse inventory with FIFO ordering
    const warehouseInventories = await query<WarehouseInventoryFIFO>(
      `SELECT 
        pw.product_id,
        pw.warehouse_id,
        pw.inventory_count,
        pw.warehouse_location,
        pw.created_at as warehouse_entry_date,
        w.name as warehouse_name,
        p.supplier_id,
        su.company_name as supplier_company,
        su.created_at as supplier_created_at
      FROM product_warehouses pw
      JOIN warehouses w ON w.id = pw.warehouse_id
      JOIN products p ON p.id = pw.product_id
      LEFT JOIN supplier_users su ON su.id = p.supplier_id
      WHERE pw.product_id = ANY($1)
        AND p.deleted_at IS NULL
        AND pw.inventory_count > 0
        AND w.is_active = true
      ORDER BY 
        su.created_at ASC NULLS LAST,  -- Oldest supplier first
        pw.created_at ASC               -- Oldest warehouse entry first`,
      [productIds]
    );

    if (warehouseInventories.length === 0) {
      console.log(`[FIFO Allocation] No warehouse inventory found for like products`);
      unfulfilledItems.push({
        product_id: item.product_id,
        quantity: remainingQuantity,
        name: item.name,
      });
      warnings.push(`No warehouse inventory available for ${item.name}`);
      continue;
    }

    console.log(`[FIFO Allocation] Found ${warehouseInventories.length} warehouse entries (FIFO ordered)`);

    // Step 3: Allocate using FIFO logic
    let currentSupplier: string | null = null;
    
    for (const whInventory of warehouseInventories) {
      if (remainingQuantity <= 0) break;

      // Track supplier transition
      if (currentSupplier !== whInventory.supplier_id) {
        if (currentSupplier !== null) {
          console.log(`[FIFO Allocation] Exhausted supplier ${currentSupplier}, moving to supplier ${whInventory.supplier_id}`);
        }
        currentSupplier = whInventory.supplier_id;
      }

      // Check if we're using a different product (substitution)
      if (whInventory.product_id !== originalProductId) {
        const alreadyLogged = substitutions.some(
          s => s.original_product_id === originalProductId && s.allocated_product_id === whInventory.product_id
        );
        if (!alreadyLogged) {
          substitutions.push({
            original_product_id: originalProductId,
            allocated_product_id: whInventory.product_id,
            supplier_company: whInventory.supplier_company,
          });
          warnings.push(
            `Product substitution: Using ${item.name} from ${whInventory.supplier_company || 'unknown supplier'} (product ${whInventory.product_id})`
          );
          console.log(`[FIFO Allocation] Product substitution: ${originalProductId} -> ${whInventory.product_id} (${whInventory.supplier_company})`);
        }
      }

      // Allocate what's available from this warehouse
      const quantityToAllocate = Math.min(remainingQuantity, whInventory.inventory_count);

      console.log(`[FIFO Allocation] Allocating ${quantityToAllocate} units from warehouse ${whInventory.warehouse_name} (entry date: ${whInventory.warehouse_entry_date})`);

      // Create or update allocation for this warehouse
      const allocationKey = `${whInventory.warehouse_id}_${whInventory.supplier_id || 'no_supplier'}`;
      
      if (!allocations.has(allocationKey)) {
        allocations.set(allocationKey, {
          warehouse_id: whInventory.warehouse_id,
          warehouse_name: whInventory.warehouse_name,
          warehouse_location: whInventory.warehouse_location,
          supplier_id: whInventory.supplier_id,
          supplier_company: whInventory.supplier_company,
          items: [],
        });
      }

      allocations.get(allocationKey)!.items.push({
        product_id: whInventory.product_id, // Use the actual product being allocated
        quantity: quantityToAllocate,
        name: item.name,
        warehouse_id: whInventory.warehouse_id,
        warehouse_name: whInventory.warehouse_name,
        warehouse_location: whInventory.warehouse_location,
        supplier_id: whInventory.supplier_id,
        supplier_company: whInventory.supplier_company,
        original_product_id: originalProductId,
        allocated_product_id: whInventory.product_id,
        warehouse_entry_date: whInventory.warehouse_entry_date,
      });

      remainingQuantity -= quantityToAllocate;
    }

    // If we couldn't fulfill the entire order
    if (remainingQuantity > 0) {
      unfulfilledItems.push({
        product_id: item.product_id,
        quantity: remainingQuantity,
        name: item.name,
      });
      warnings.push(
        `Partial fulfillment for ${item.name}: ${remainingQuantity} units still needed (allocated ${item.quantity - remainingQuantity})`
      );
      console.log(`[FIFO Allocation] Partial fulfillment: ${remainingQuantity} units of ${item.name} could not be allocated`);
    }
  }

  console.log(`[FIFO Allocation] Complete: ${allocations.size} warehouse allocations, ${unfulfilledItems.length} unfulfilled items, ${substitutions.length} substitutions`);

  return {
    allocations: Array.from(allocations.values()),
    unfulfilledItems,
    warnings,
    substitutions,
  };
}

