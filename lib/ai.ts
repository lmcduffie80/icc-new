import Anthropic from '@anthropic-ai/sdk';

export interface FarmerDraftProduct {
  product_id: string;
  product_name: string;
  is_recommended: boolean;
  rate_per_acre: number;
  rate_unit: string;
  unit_size: number;
  unit_size_unit: string;
  lbs_per_gallon: number | null;
  reasoning: string;
  // Enriched from product catalog after AI parse — used for cost calculation
  price: string;
  unit_of_measure: string | null;
}

export interface FarmerDraftPass {
  name: string;
  category: string;
  timing_label: string;
  sort_order: number;
  products: FarmerDraftProduct[];
}

export interface FarmerDraftPlan {
  passes: FarmerDraftPass[];
  summary: string;
  weed_management_notes: string;
}

export interface AIDraftProduct {
  product_id: string;
  product_name: string;
  is_recommended: boolean;
  default_rate_per_acre: number;
  min_rate: number;
  max_rate: number;
  rate_unit: string;
  unit_size: number;
  unit_size_unit: string;
  lbs_per_gallon: number | null;
  reasoning: string;
}

export interface AIDraftPass {
  name: string;
  timing_label: string;
  category: string;
  description: string;
  is_required: boolean;
  sort_order: number;
  products: AIDraftProduct[];
}

export interface AIDraftProgram {
  passes: AIDraftPass[];
  summary: string;
}

export interface ProductForAI {
  id: string;
  name: string;
  category: string;
  price: string;
  unit_of_measure: string | null;
  active_ingredients: string | null;
  application_rate_range: string | null;
  container_sizes: string | null;
  package_type: string | null;
  lbs_per_gallon: string | null;
  epa_registration_number: string | null;
  epa_signal_word: string | null;
  features: string[] | null;
  specifications: Record<string, string> | null;
}

/** Admin-approved rate data from acre_pack_pass_products for a given product */
export interface ApprovedProductRate {
  default_rate_per_acre: number;
  min_rate: number;
  max_rate: number;
  rate_unit: string;
  unit_size: number;
  unit_size_unit: string | null;
  lbs_per_gallon: number | null;
}

const CROP_CONTEXT: Record<string, string> = {
  corn: `Corn production typically involves: (1) Burndown/pre-plant herbicide before planting, (2) Pre-emerge herbicide at planting for residual weed control, (3) Post-emerge herbicide for escaped weeds (V2-V6), (4) Fungicide at VT/R1 (tassel/silk) for disease management, (5) Insecticide as needed for corn borers/rootworm, (6) Adjuvants/surfactants to improve spray efficacy.`,
  soybeans: `Soybean production typically involves: (1) Burndown/pre-plant herbicide before planting, (2) Pre-emerge herbicide at planting for residual weed control, (3) Post-emerge herbicide for escaped weeds (V2-V4), (4) Fungicide at R3 (beginning pod) for disease management, (5) Insecticide as needed for aphids/bean leaf beetles, (6) Adjuvants/surfactants to improve spray efficacy.`,
  wheat: `Wheat production typically involves: (1) Fall herbicide for winter wheat establishment, (2) Spring herbicide for broadleaf/grass weed control, (3) Fungicide at flag leaf (Feekes 8-9) or heading for disease management, (4) Insecticide as needed for aphids/Hessian fly, (5) Plant growth regulators to reduce lodging, (6) Adjuvants/surfactants to improve spray efficacy.`,
  cotton: `Cotton production typically involves: (1) Burndown/pre-plant herbicide before planting, (2) Pre-emerge herbicide at planting for residual weed control, (3) Post-emerge herbicide (layby) for mid-season weed control, (4) Fungicide for boll rot/target spot, (5) Insecticide for bollworm/plant bugs, (6) Plant growth regulators (mepiquat chloride) to manage plant height, (7) Defoliants/harvest aids before harvest, (8) Adjuvants/surfactants to improve spray efficacy.`,
};

function buildProductCatalog(products: ProductForAI[], approvedRates?: Map<string, ApprovedProductRate>): string {
  return products
    .map((p) => {
      const lines: string[] = [
        `Product ID: ${p.id}`,
        `Name: ${p.name}`,
        `Category: ${p.category}`,
        `Store Price: $${p.price} per ${p.unit_of_measure || 'unit'}`,
      ];
      if (p.active_ingredients) lines.push(`Active Ingredients: ${p.active_ingredients}`);
      // Show label rate range as reference context; AI determines the actual rate to use
      const approved = approvedRates?.get(p.id);
      if (approved) {
        const rateUnit = approved.rate_unit;
        const isFlOz = rateUnit === 'fl oz';
        // Show gal-equivalent alongside fl oz so AI can express rates in gal/acre
        const galNote = isFlOz
          ? ` (${(approved.min_rate / 128).toFixed(3)}–${(approved.max_rate / 128).toFixed(3)} gal/acre)`
          : '';
        lines.push(`Label Rate Range: ${approved.min_rate}–${approved.max_rate} ${rateUnit}/acre${galNote}`);
        lines.push(`Container Size: ${approved.unit_size} ${approved.unit_size_unit ?? rateUnit}`);
        if (approved.lbs_per_gallon) lines.push(`Lbs Per Gallon: ${approved.lbs_per_gallon}`);
      } else {
        if (p.application_rate_range) lines.push(`Application Rate Range: ${p.application_rate_range}`);
        if (p.container_sizes) lines.push(`Container Sizes: ${p.container_sizes}`);
        if (p.lbs_per_gallon) lines.push(`Lbs Per Gallon: ${p.lbs_per_gallon}`);
      }
      if (p.package_type) lines.push(`Package Type: ${p.package_type}`);
      if (p.epa_registration_number) lines.push(`EPA Reg #: ${p.epa_registration_number}`);
      if (p.epa_signal_word) lines.push(`EPA Signal Word: ${p.epa_signal_word}`);
      if (p.features && p.features.length > 0) lines.push(`Features: ${p.features.join('; ')}`);
      if (p.specifications && Object.keys(p.specifications).length > 0) {
        const specs = Object.entries(p.specifications)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
        lines.push(`Specifications: ${specs}`);
      }
      return lines.join('\n');
    })
    .join('\n---\n');
}

const SYSTEM_PROMPT = `You are an expert agronomist and crop protection advisor for Innovative Crop Care (ICC), a crop input retailer. Your job is to create Innovative Crop Planning programs — season-long crop protection plans that organize products into application passes.

Rules:
1. ONLY use products from the provided catalog. Never invent product IDs or names.
2. Each pass should represent a distinct application timing/purpose (e.g., "Pre-Emerge Herbicide", "Post-Emerge Herbicide", "Foliar Fungicide").
3. Set application rates based on the product's label information (application rate range, active ingredient concentration).
4. For rate_unit, use one of: "fl oz", "oz", "lbs", "pt", "qt", "gal".
5. unit_size should be the purchasable container size (e.g., 265 for a 265-gal tote, 2.5 for a 2.5-gal jug).
6. unit_size_unit should be the container's unit of measure (e.g., "gal", "lbs", "oz").
7. If a product has lbs_per_gallon specified, include it. If the rate is in lbs but the container is in gal, the lbs_per_gallon conversion is essential.
8. Mark the most cost-effective or broadly useful product in each pass as is_recommended: true.
9. Sort passes in chronological order of typical field application (pre-plant first, harvest aids last).
10. A product can appear in multiple passes if agronomically appropriate.
11. Be conservative with rates — use moderate/default rates, not maximums.
12. If the catalog has no products suitable for a typical pass, omit that pass entirely.
13. Provide a brief reasoning for each product explaining WHY you chose it and how you determined the rate.`;

export async function generateAcrePackProgram(
  crop: string,
  products: ProductForAI[]
): Promise<AIDraftProgram> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const client = new Anthropic({ apiKey });

  const cropContext = CROP_CONTEXT[crop] || `Standard crop protection program for ${crop}.`;
  const catalog = buildProductCatalog(products);

  const userPrompt = `Create a crop planning program for **${crop}** using ONLY the products listed below.

## Agronomic Context
${cropContext}

## Available Product Catalog
${catalog}

## Output Format
Return a JSON object (and nothing else) matching this exact schema:
{
  "passes": [
    {
      "name": "Pass Name (e.g., Pre-Emerge Herbicide)",
      "timing_label": "When to apply (e.g., Spring, before planting)",
      "category": "Herbicides | Fungicides | Insecticides | Adjuvants",
      "description": "Brief description for farmers",
      "is_required": true/false,
      "sort_order": 1,
      "products": [
        {
          "product_id": "exact product ID from catalog",
          "product_name": "exact product name from catalog",
          "is_recommended": true/false,
          "default_rate_per_acre": 16,
          "min_rate": 12,
          "max_rate": 32,
          "rate_unit": "fl oz",
          "unit_size": 265,
          "unit_size_unit": "gal",
          "lbs_per_gallon": null,
          "reasoning": "Why this product and rate"
        }
      ]
    }
  ],
  "summary": "Overview of the program for the admin to review"
}

Important:
- Return ONLY valid JSON, no markdown code fences, no extra text.
- Every product_id MUST exactly match an ID from the catalog above.
- Set is_required to true for passes that are essential to the program (herbicides are usually required, fungicides/insecticides are often optional).`;

  const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    system: SYSTEM_PROMPT,
  });

  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from AI');
  }

  let rawText = textBlock.text.trim();
  // Strip markdown code fences if present
  if (rawText.startsWith('```')) {
    rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(rawText) as AIDraftProgram;

  // Validate structure
  if (!Array.isArray(parsed.passes)) {
    throw new Error('AI response missing passes array');
  }

  const validProductIds = new Set(products.map((p) => p.id));
  for (const pass of parsed.passes) {
    if (!pass.name || !pass.category) {
      throw new Error(`Invalid pass: missing name or category`);
    }
    for (const product of pass.products) {
      if (!validProductIds.has(product.product_id)) {
        throw new Error(`AI referenced unknown product_id: ${product.product_id}`);
      }
    }
    // Remove products where the AI returned an invalid (zero/missing) rate or container size
    pass.products = pass.products.filter(
      (p) => p.default_rate_per_acre > 0 && p.unit_size > 0
    );
  }
  // Remove passes that have no valid products after filtering
  parsed.passes = parsed.passes.filter((p) => p.products.length > 0);

  return parsed;
}

// Common weed resistance and management context for farmer-facing AI plans
const WEED_CONTEXT = `
Common problem weeds and management notes:
- Waterhemp (Amaranthus tuberculatus): Highly resistant to glyphosate, ALS inhibitors, and PPO inhibitors. Requires layered residual herbicides with multiple modes of action. Germinates throughout the season.
- Palmer amaranth (Amaranthus palmeri): Extremely competitive; resistant to glyphosate, ALS, PPO, and HPPD inhibitors. Use pre-emerge residuals plus post-emerge with different modes of action.
- Marestail / Horseweed (Conyza canadensis): Glyphosate-resistant biotypes widespread. Effective with fall burndown or spring burndown before planting. ALS inhibitors (chlorimuron) effective on susceptible biotypes.
- Giant ragweed (Ambrosia trifida): Glyphosate resistance common. Pre-emerge residuals plus post-emerge applications before V2 stage most effective.
- Common ragweed (Ambrosia artemisiifolia): Similar to giant ragweed; ALS inhibitors effective on susceptible biotypes.
- Velvetleaf (Abutilon theophrasti): Generally susceptible to most broadleaf herbicides; ALS and PPO inhibitors effective.
- Pigweed species: Overlaps with waterhemp/Palmer; use multi-mode-of-action programs.
- Foxtail species (green, yellow, giant): Grass weeds; controlled by ACCase inhibitors (clethodim, sethoxydim) and pre-emerge graminicides.
- Johnsongrass (Sorghum halepense): Perennial grass; ACCase inhibitors effective post-emerge. High rates needed for rhizome control.
- Nutsedge (yellow/purple): Difficult to control; halosulfuron or bentazon most effective.
- Lambsquarters (Chenopodium album): Generally susceptible to atrazine, ALS inhibitors, and glyphosate.

Resistance management principles:
- Rotate modes of action between passes and between years.
- Use pre-emerge residuals to reduce weed escapes and selection pressure.
- For heavy pressure or known resistant populations, use two or more effective modes of action.
- Adjuvants improve uptake and efficacy of many post-emerge herbicides.
`;

const FARMER_SYSTEM_PROMPT = `You are an expert agronomist and crop protection advisor for Innovative Crop Care (ICC). Your job is to create personalized crop protection plans for farmers based on their specific weed problems, crop, and current field conditions.

Rules:
1. ONLY use products from the provided catalog. Never invent product IDs or names.
2. Organize products into exactly these four pass categories in this order:
   - "Pre-Emergent" (residual herbicides applied before or at planting)
   - "Post-Emerge" (herbicides applied after crop and weeds emerge)
   - "In-Season" (fungicides, insecticides, plant growth regulators applied during the growing season)
   - "Adjuvants" (spray additives to improve efficacy — always include if adjuvants are in the catalog)
3. Select products specifically effective against the farmer's named target weeds.
4. Determine application rates from the product label information in the catalog. Use the label range and weed pressure to choose the appropriate rate.
5. For rate_unit, prefer "gal" for liquid products sold by the gallon (e.g. glyphosate, herbicide concentrates). Use "lbs" for dry/granular products. Use "fl oz" or "oz" only for small-volume specialty products. Use "qt" or "pt" only if the label explicitly uses those units.
6. unit_size and unit_size_unit will be provided in the catalog — use those exact values.
7. If a product has lbs_per_gallon specified, include it.
8. Mark the most cost-effective or broadly useful product in each pass as is_recommended: true.
9. Adjust rates based on weed pressure: use higher rates within label range for heavy pressure, lower rates for light pressure.
10. A product can appear in multiple passes if agronomically appropriate.
11. If the catalog has no products suitable for a pass category, omit that pass entirely.
12. Provide a brief reasoning for each product explaining WHY it controls the named weeds and how you determined the rate.
13. Include weed_management_notes with resistance management advice specific to the named weeds.
14. If soil temperature and weather data are provided, incorporate them into your reasoning: note if conditions are optimal or suboptimal for specific products, and mention timing implications in the timing_label fields.`;

/** Optional environmental context injected into the AI prompt */
export interface EnvironmentalContext {
  /** Pre-formatted soil temperature + planting readiness block */
  soilTempContext: string;
  /** Pre-formatted weather + spray window block */
  weatherContext: string;
}

export async function generateFarmerPlan(
  crop: string,
  targetWeeds: string[],
  weedPressure: 'light' | 'moderate' | 'heavy',
  products: ProductForAI[],
  approvedRates?: Map<string, ApprovedProductRate>,
  environmentalContext?: EnvironmentalContext
): Promise<FarmerDraftPlan> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const client = new Anthropic({ apiKey });

  const cropContext = CROP_CONTEXT[crop] || `Standard crop protection program for ${crop}.`;
  const catalog = buildProductCatalog(products, approvedRates);
  const weedList = targetWeeds.length > 0 ? targetWeeds.join(', ') : 'general broadleaf and grass weeds';

  const envSection = environmentalContext
    ? `\n${environmentalContext.soilTempContext}\n\n${environmentalContext.weatherContext}\n`
    : '';

  const userPrompt = `Create a personalized crop protection plan for a farmer growing **${crop}**.

## Target Weeds
The farmer is targeting: **${weedList}**
Weed pressure level: **${weedPressure}**

## Agronomic Context
${cropContext}
${envSection}
## Weed Biology and Resistance Notes
${WEED_CONTEXT}

## Available Product Catalog
${catalog}

## Output Format
Return a JSON object (and nothing else) matching this exact schema:
{
  "passes": [
    {
      "name": "Pre-Emergent Herbicide",
      "category": "Pre-Emergent",
      "timing_label": "At planting or before crop emergence",
      "sort_order": 1,
      "products": [
        {
          "product_id": "exact product ID from catalog",
          "product_name": "exact product name from catalog",
          "is_recommended": true,
          "rate_per_acre": 1.0,
          "rate_unit": "gal",
          "unit_size": 265,
          "unit_size_unit": "gal",
          "lbs_per_gallon": null,
          "reasoning": "Why this product controls the named weeds and how the rate was determined from the label"
        }
      ]
    }
  ],
  "summary": "Brief overview of the plan for the farmer",
  "weed_management_notes": "Resistance management advice specific to the named weeds"
}

Important:
- Return ONLY valid JSON, no markdown code fences, no extra text.
- Every product_id MUST exactly match an ID from the catalog above.
- Use the four pass categories: Pre-Emergent, Post-Emerge, In-Season, Adjuvants.
- Omit a category entirely if no suitable products exist in the catalog.
- For ${weedPressure} pressure, ${weedPressure === 'heavy' ? 'use rates near the upper end of the label range and include layered residual programs' : weedPressure === 'moderate' ? 'use moderate label rates' : 'use rates near the lower end of the label range'}.`;

  const message = await client.messages.create(
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: userPrompt }],
      system: FARMER_SYSTEM_PROMPT,
    },
    { timeout: 55_000 }
  );

  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from AI');
  }

  let rawText = textBlock.text.trim();
  if (rawText.startsWith('```')) {
    rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(rawText) as FarmerDraftPlan;

  if (!Array.isArray(parsed.passes)) {
    throw new Error('AI response missing passes array');
  }

  const productMap = new Map(products.map((p) => [p.id, p]));
  for (const pass of parsed.passes) {
    if (!pass.name || !pass.category) {
      throw new Error(`Invalid pass: missing name or category`);
    }
    for (const product of pass.products) {
      if (!productMap.has(product.product_id)) {
        throw new Error(`AI referenced unknown product_id: ${product.product_id}`);
      }
      // Enrich with price and unit_of_measure from catalog for cost calculation
      const catalogProduct = productMap.get(product.product_id)!;
      product.price = catalogProduct.price;
      product.unit_of_measure = catalogProduct.unit_of_measure;

      // Override container size from DB (product fact) but let AI determine the rate
      const approved = approvedRates?.get(product.product_id);
      if (approved) {
        product.unit_size = approved.unit_size;
        product.unit_size_unit = approved.unit_size_unit ?? product.unit_size_unit;
        product.lbs_per_gallon = approved.lbs_per_gallon;
      }
    }
    // Remove products where the AI returned an invalid (zero/missing) rate or container size
    const beforeFilter = pass.products.length;
    pass.products = pass.products.filter(
      (p) => p.rate_per_acre > 0 && p.unit_size > 0
    );
    if (pass.products.length < beforeFilter) {
      console.warn(
        `[CropPlan] Filtered ${beforeFilter - pass.products.length} product(s) from pass "${pass.name}" due to zero rate_per_acre or unit_size`
      );
    }
  }
  // Remove passes that have no valid products after filtering
  parsed.passes = parsed.passes.filter((p) => p.products.length > 0);

  return parsed;
}
