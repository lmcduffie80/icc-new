import { formatPrice, calculateCostPerGallon, getGallonsFromContainerSize } from '@/lib/utils';

interface PriceWithUnitProps {
  price: number | string;
  unitOfMeasure?: string | null;
  containerSize?: string | null;
  className?: string;
  priceClassName?: string;
  unitClassName?: string;
  showCostPerGallon?: boolean;
}

/**
 * Displays a price with an optional unit of measure suffix.
 * Example: "$3,280.00/unit" where "/unit" is smaller and lighter.
 * Optionally displays cost per gallon for container sizes with gallon pricing.
 */
export function PriceWithUnit({
  price,
  unitOfMeasure,
  containerSize,
  className = '',
  priceClassName = '',
  unitClassName = 'text-sm text-muted-foreground font-normal',
  showCostPerGallon = false,
}: PriceWithUnitProps) {
  const costPerGallon = showCostPerGallon 
    ? calculateCostPerGallon(price, unitOfMeasure, containerSize) 
    : null;

  // If showing cost per gallon, use div for vertical stacking
  // Otherwise use span for inline display (can be inside <p> tags)
  if (showCostPerGallon && costPerGallon) {
    // Get gallons from container size for display
    const gallons = getGallonsFromContainerSize(containerSize);
    
    return (
      <div className={className}>
        {/* Per-gallon price as primary */}
        <div>
          <span className={priceClassName}>{costPerGallon}</span>
        </div>
        
        {/* Total price as secondary */}
        <div className="text-xs text-muted-foreground mt-0.5">
          Total: {formatPrice(price)}{unitOfMeasure && `/${unitOfMeasure}`} {gallons && `(${gallons} gallons)`}
        </div>
      </div>
    );
  }

  // Default: inline span (backward compatible)
  return (
    <span className={className}>
      <span className={priceClassName}>{formatPrice(price)}</span>
      {unitOfMeasure && (
        <span className={unitClassName}>/{unitOfMeasure}</span>
      )}
    </span>
  );
}
