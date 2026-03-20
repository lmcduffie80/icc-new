/**
 * State Eligibility Utilities
 *
 * Functions for checking product eligibility based on shipping state.
 * Products may have restrictions on which states they can be sold in.
 */

export interface ProductEligibility {
  productId: string;
  productName: string;
  approvedStates: string[];
  isEligible: boolean;
}

export interface CartEligibilityResult {
  allEligible: boolean;
  ineligibleProducts: ProductEligibility[];
  eligibleProducts: ProductEligibility[];
}

export interface CartItemForEligibility {
  id: string;
  name: string;
  approvedStates: string[];
}

/**
 * Check if a single product is approved for a given state.
 * Products with empty/undefined approvedStates are available everywhere.
 */
export function isProductEligibleForState(
  approvedStates: string[] | undefined | null,
  userState: string
): boolean {
  // No restrictions = available everywhere
  if (!approvedStates || approvedStates.length === 0) {
    return true;
  }

  // Normalize to uppercase for comparison
  const normalizedUserState = userState.toUpperCase();
  return approvedStates.some(
    (state) => state.toUpperCase() === normalizedUserState
  );
}

/**
 * Check cart eligibility for a shipping state.
 * Returns which products are eligible and which are not.
 */
export function checkCartEligibility(
  cartItems: CartItemForEligibility[],
  shippingState: string
): CartEligibilityResult {
  const ineligibleProducts: ProductEligibility[] = [];
  const eligibleProducts: ProductEligibility[] = [];

  for (const item of cartItems) {
    const isEligible = isProductEligibleForState(
      item.approvedStates,
      shippingState
    );

    const productEligibility: ProductEligibility = {
      productId: item.id,
      productName: item.name,
      approvedStates: item.approvedStates || [],
      isEligible,
    };

    if (isEligible) {
      eligibleProducts.push(productEligibility);
    } else {
      ineligibleProducts.push(productEligibility);
    }
  }

  return {
    allEligible: ineligibleProducts.length === 0,
    ineligibleProducts,
    eligibleProducts,
  };
}

/**
 * Get US state name from abbreviation
 */
const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
};

function getStateName(abbreviation: string): string {
  return STATE_NAMES[abbreviation.toUpperCase()] || abbreviation;
}

/**
 * Get user-friendly message for ineligible products.
 * Used to display error messages at checkout.
 */
export function getIneligibilityMessage(
  ineligibleProducts: ProductEligibility[],
  userState: string
): string {
  if (ineligibleProducts.length === 0) return '';

  const stateName = getStateName(userState);

  if (ineligibleProducts.length === 1) {
    const product = ineligibleProducts[0];
    return `"${product.productName}" is not approved for sale in ${stateName}. Please remove it from your cart to continue.`;
  }

  const productNames = ineligibleProducts
    .map((p) => `"${p.productName}"`)
    .join(', ');

  return `The following products are not approved for sale in ${stateName}: ${productNames}. Please remove them from your cart to continue.`;
}
