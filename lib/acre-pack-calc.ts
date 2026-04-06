/**
 * Convert a value from one unit to another.
 * Returns the value in the target unit, or null if the conversion is not supported.
 *
 * Supported conversions (liquid volume):
 *   fl oz → gal, qt, pt
 *   qt    → gal, fl oz, pt
 *   pt    → gal, fl oz, qt
 *   gal   → fl oz, qt, pt
 *
 * Supported conversions (weight):
 *   oz  → lbs
 *   lbs → oz
 *
 * Cross-domain (weight → volume):
 *   lbs → gal  requires lbsPerGallon density factor
 */
function convertUnits(
  value: number,
  fromUnit: string,
  toUnit: string,
  lbsPerGallon?: number | null
): number | null {
  const from = fromUnit.toLowerCase().trim();
  const to = toUnit.toLowerCase().trim();

  if (from === to) return value;

  // Normalise everything to fl oz (liquid) or lbs (weight) as an intermediate
  let flOz: number | null = null;
  let lbs: number | null = null;

  switch (from) {
    case 'fl oz': flOz = value; break;
    case 'gal':   flOz = value * 128; break;
    case 'qt':    flOz = value * 32;  break;
    case 'pt':    flOz = value * 16;  break;
    case 'oz':    lbs  = value / 16;  break;
    case 'lbs':   lbs  = value;       break;
    default: return null;
  }

  // lbs → liquid via density
  if (lbs !== null && (to === 'fl oz' || to === 'gal' || to === 'qt' || to === 'pt')) {
    if (!lbsPerGallon || lbsPerGallon <= 0) return null;
    flOz = (lbs / lbsPerGallon) * 128;
    lbs = null;
  }

  // liquid → target
  if (flOz !== null) {
    switch (to) {
      case 'fl oz': return flOz;
      case 'gal':   return flOz / 128;
      case 'qt':    return flOz / 32;
      case 'pt':    return flOz / 16;
      default: return null;
    }
  }

  // weight → target
  if (lbs !== null) {
    switch (to) {
      case 'lbs': return lbs;
      case 'oz':  return lbs * 16;
      default: return null;
    }
  }

  return null;
}

/**
 * Calculate the number of purchasable units needed for a given acreage and rate.
 *
 * When rateUnit and unitSizeUnit differ, the rate is automatically converted
 * to match the container unit before dividing.
 *
 * Examples:
 *   16 fl oz/acre, 265 gal tote  → converts 16 fl oz to gal (0.125) → 1000 * 0.125 / 265 = 0.47 → 1 unit
 *   5.4 lbs/acre,  265 gal tote, lbsPerGallon=10 → 5.4/10=0.54 gal/acre → 1000*0.54/265=2.04 → 3 units
 */
export function calcUnitsNeeded(
  acreage: number,
  ratePerAcre: number,
  unitSize: number,
  rateUnit?: string | null,
  unitSizeUnit?: string | null,
  lbsPerGallon?: number | null
): number {
  if (acreage <= 0 || unitSize <= 0) return 0;

  let effectiveRate = ratePerAcre;

  if (rateUnit && unitSizeUnit) {
    const converted = convertUnits(ratePerAcre, rateUnit, unitSizeUnit, lbsPerGallon);
    if (converted !== null) {
      effectiveRate = converted;
    } else if (lbsPerGallon && lbsPerGallon > 0 && rateUnit === 'lbs') {
      // Fallback: legacy lbs → gal path when unitSizeUnit is not set
      effectiveRate = ratePerAcre / lbsPerGallon;
    }
  } else if (lbsPerGallon && lbsPerGallon > 0) {
    // Legacy path: lbs_per_gallon without explicit unit fields
    effectiveRate = ratePerAcre / lbsPerGallon;
  }

  return Math.ceil((acreage * effectiveRate) / unitSize);
}

export function calcCostPerAcre(unitsNeeded: number, price: string, acreage: number): number {
  if (acreage <= 0) return 0;
  const priceNum = parseFloat(price);
  if (!isFinite(priceNum)) return 0;
  return (unitsNeeded * priceNum) / acreage;
}
