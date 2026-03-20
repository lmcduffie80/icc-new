import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as USD currency with commas and 2 decimal places
 * @param price - The price to format (can be number or string)
 * @returns Formatted price string like "$1,234.56"
 */
export function formatPrice(price: number | string): string {
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;

  if (isNaN(numPrice)) {
    return '$0.00';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numPrice);
}

/**
 * Get gallon amount from container size
 * @param containerSize - Container size string (e.g., "265 Gal", "2x2.5 Gal")
 * @returns Number of gallons or null if not a recognized container size
 */
export function getGallonsFromContainerSize(containerSize: string | null | undefined): number | null {
  if (!containerSize) return null;
  
  const size = containerSize.trim();
  
  switch (size) {
    case '265 Gal':
      return 265;
    case '135 Gal':
      return 135;
    case '2x2.5 Gal':
      return 5; // 2 × 2.5 = 5
    case '4x1 Gal':
      return 4; // 4 × 1 = 4
    default:
      return null;
  }
}

/**
 * Calculate cost per gallon based on container size or unit of measure
 * @param price - Product price (string or number)
 * @param unitOfMeasure - Unit type (e.g., "tote", "case") - for backward compatibility
 * @param containerSize - Container size (e.g., "265 Gal", "2x2.5 Gal") - preferred
 * @returns Formatted cost per gallon string or null if not applicable
 */
export function calculateCostPerGallon(
  price: string | number,
  unitOfMeasure?: string | null,
  containerSize?: string | null
): string | null {
  // Try container size first (preferred)
  const gallonsFromContainer = getGallonsFromContainerSize(containerSize);
  if (gallonsFromContainer) {
    const priceNum = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(priceNum)) return null;
    const costPerGallon = priceNum / gallonsFromContainer;
    return formatPrice(costPerGallon) + '/gal';
  }
  
  // Fall back to legacy unit of measure logic for backward compatibility
  if (!unitOfMeasure) return null;
  
  const priceNum = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(priceNum)) return null;
  
  const unit = unitOfMeasure.toLowerCase();
  let gallons: number;
  
  if (unit === 'tote') {
    gallons = 265;
  } else if (unit === 'case') {
    gallons = 5;
  } else {
    return null; // Not applicable for other units
  }
  
  const costPerGallon = priceNum / gallons;
  return formatPrice(costPerGallon) + '/gal';
}

/**
 * Format availability date from yyyy-mm-dd to mm-dd-yyyy
 * @param date - The date string to format (can be yyyy-mm-dd format or text like "Year-round")
 * @returns Formatted date string or original text if not a date
 */
export function formatAvailabilityDate(date?: string | null): string {
  if (!date) return '—';
  
  // Check if the date matches yyyy-mm-dd format (e.g., "2024-09-15")
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  
  if (datePattern.test(date)) {
    // Split the date and rearrange to mm-dd-yyyy
    const [year, month, day] = date.split('-');
    return `${month}-${day}-${year}`;
  }
  
  // If not a date format, return as-is (e.g., "Year-round")
  return date;
}
