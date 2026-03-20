/**
 * Calculate shipping cost based on product types
 * Totes: 265 gallons × $0.50 = $132.50 per tote
 * Cases (2x2.5 gal = 5 gallons): 5 gallons × $10.25 = $51.25 per case
 * Other gallon products: $0.50 per gallon
 */

interface ShippingItem {
  unitOfMeasure?: string | null;
  name?: string;
  quantity: number;
}

export function calculateShippingFee(items: ShippingItem[]): number {
  let totalShipping = 0;
  
  items.forEach(item => {
    const unitOfMeasure = item.unitOfMeasure?.toLowerCase() || '';
    const productName = item.name?.toLowerCase() || '';
    const quantity = item.quantity;
    
    // Check if product is a tote (by unit of measure or product name)
    const isTote = unitOfMeasure.includes('tote') || 
                   productName.includes('tote') ||
                   unitOfMeasure.includes('tank');
    
    // Check if product is a case (2x2.5 gal cases)
    const isCase = unitOfMeasure.includes('case') ||
                   productName.includes('2x2.5') ||
                   (unitOfMeasure.includes('case') && productName.includes('2.5'));
    
    if (isTote) {
      // Totes: 265 gallons × $0.50 = $132.50 per tote
      totalShipping += quantity * 132.50;
    } else if (isCase) {
      // Cases (2x2.5 gal = 5 gallons): $10.25 per gallon
      // Calculation: 5 gallons × $10.25 = $51.25 per case
      const gallonsPerCase = 5; // 2x2.5 gal cases = 5 gallons
      totalShipping += quantity * gallonsPerCase * 10.25;
    } else {
      // For other products, calculate based on gallons if unit of measure indicates gallons
      if (unitOfMeasure.includes('gallon') || unitOfMeasure === 'gal') {
        totalShipping += quantity * 0.50; // $0.50 per gallon for other gallon products
      } else if (unitOfMeasure.includes('quart') || unitOfMeasure === 'qt') {
        totalShipping += quantity * 0.125; // 4 quarts = 1 gallon, so $0.50/4 = $0.125 per quart
      } else if (unitOfMeasure.includes('pint') || unitOfMeasure === 'pt') {
        totalShipping += quantity * 0.0625; // 8 pints = 1 gallon, so $0.50/8 = $0.0625 per pint
      } else if (unitOfMeasure.includes('ounce') || unitOfMeasure === 'oz') {
        totalShipping += quantity * 0.00390625; // 128 oz = 1 gallon, so $0.50/128 per oz
      }
      // For other units (lb, unit, bag, etc.), no shipping charge
    }
  });
  
  return Math.round(totalShipping * 100) / 100;
}

