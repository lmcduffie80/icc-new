import { query } from '@/lib/db';

interface HistoricalShippingData {
  delivery_fee: number;
  delivery_method: string;
  subtotal: number;
  shipping_address: { state?: string } | null;
}

/**
 * Calculate estimated shipping fee based on historical order data
 * Looks at similar orders (same delivery method, similar subtotal, same state)
 */
export async function getEstimatedShippingFee(
  deliveryMethod: string,
  subtotal: number,
  shippingState?: string
): Promise<number | null> {
  try {
    // Build query to find similar historical orders
    let sql = `
      SELECT delivery_fee, subtotal, delivery_method
      FROM orders
      WHERE delivery_method = $1
        AND status IN ('shipped', 'delivered')
        AND delivery_fee > 0
    `;
    const params: unknown[] = [deliveryMethod];
    let paramIndex = 2;

    // If state is provided, filter by state
    if (shippingState) {
      sql += ` AND shipping_address->>'state' = $${paramIndex++}`;
      params.push(shippingState);
    }

    // Order by subtotal similarity (closest first) and recency
    sql += `
      ORDER BY 
        ABS(subtotal - $${paramIndex}) ASC,
        created_at DESC
      LIMIT 10
    `;
    params.push(subtotal);

    const historicalOrders = await query<HistoricalShippingData>(sql, params);

    if (historicalOrders.length === 0) {
      return null;
    }

    // Calculate average shipping fee from similar orders
    // Weight by subtotal similarity
    let totalWeightedFee = 0;
    let totalWeight = 0;

    for (const order of historicalOrders) {
      // Weight: closer subtotals get higher weight
      const subtotalDiff = Math.abs(order.subtotal - subtotal);
      const maxSubtotal = Math.max(order.subtotal, subtotal);
      const similarity = maxSubtotal > 0 ? 1 - (subtotalDiff / maxSubtotal) : 0.5;
      const weight = Math.max(0.1, similarity); // Minimum weight of 0.1

      totalWeightedFee += order.delivery_fee * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) {
      return null;
    }

    const estimatedFee = totalWeightedFee / totalWeight;
    
    // Round to 2 decimal places
    return Math.round(estimatedFee * 100) / 100;
  } catch (error) {
    console.error('Error calculating estimated shipping fee:', error);
    return null;
  }
}

