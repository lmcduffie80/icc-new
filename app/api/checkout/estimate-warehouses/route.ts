import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit';

interface OrderItem {
  productId: string;
  quantity: number;
}

/**
 * Estimate how many warehouses will be needed for an order
 * This is a simplified version that checks if products have inventory in multiple warehouses
 */
export async function POST(request: NextRequest) {
  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  try {
    const body = await request.json();
    const { items }: { items: OrderItem[] } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Invalid items array' },
        { status: 400 }
      );
    }

    // Get unique product IDs (filter out any invalid IDs)
    const productIds = [...new Set(items.map(item => item.productId).filter(id => id && typeof id === 'string'))];

    if (productIds.length === 0) {
      return NextResponse.json({
        warehouseCount: 1,
        warehousesWithInventory: [],
      });
    }

    // Check which warehouses have inventory for these products
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
    
    for (const item of items) {
      const productWarehouses = warehouseInventories.filter(
        wi => wi.product_id === item.productId && wi.inventory_count > 0
      );
      
      // If product has inventory in multiple warehouses, we'll need multiple shipments
      for (const pw of productWarehouses) {
        warehousesWithInventory.add(pw.warehouse_id);
      }
    }

    // Estimate warehouse count
    // If any product has inventory in multiple warehouses, we'll need multiple shipments
    // For simplicity, we'll estimate based on unique warehouses that have inventory
    const estimatedWarehouseCount = warehousesWithInventory.size || 1;

    // However, we need to be smarter: if a single product needs multiple warehouses,
    // or if different products are in different warehouses, we need multiple shipments
    // Let's check if we can fulfill all items from a single warehouse
    let canFulfillFromSingleWarehouse = true;
    
    if (warehousesWithInventory.size > 1) {
      // Check if all products can be fulfilled from at least one common warehouse
      const productWarehouseMap = new Map<string, Set<string>>();
      
      for (const item of items) {
        const productWarehouses = warehouseInventories
          .filter(wi => wi.product_id === item.productId && wi.inventory_count >= item.quantity)
          .map(wi => wi.warehouse_id);
        
        if (productWarehouses.length === 0) {
          // Product doesn't have enough inventory in any warehouse
          canFulfillFromSingleWarehouse = false;
          break;
        }
        
        productWarehouseMap.set(item.productId, new Set(productWarehouses));
      }
      
      if (canFulfillFromSingleWarehouse && productWarehouseMap.size > 0) {
        // Find common warehouses that can fulfill all products
        const commonWarehouses = Array.from(productWarehouseMap.values())
          .reduce((common, warehouses) => {
            if (common.size === 0) return warehouses;
            return new Set([...common].filter(w => warehouses.has(w)));
          }, new Set<string>());
        
        canFulfillFromSingleWarehouse = commonWarehouses.size > 0;
      }
    }

    // If we can't fulfill from a single warehouse, we'll need multiple shipments
    const warehouseCount = canFulfillFromSingleWarehouse ? 1 : estimatedWarehouseCount;

    return NextResponse.json({
      warehouseCount: Math.max(1, warehouseCount), // At least 1
      warehousesWithInventory: Array.from(warehousesWithInventory),
    });
  } catch (error) {
    console.error('Error estimating warehouse count:', error);
    return NextResponse.json(
      { error: 'Failed to estimate warehouse count', warehouseCount: 1 },
      { status: 500 }
    );
  }
}

