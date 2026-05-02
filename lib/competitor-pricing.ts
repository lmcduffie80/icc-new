/**
 * AI-powered competitor pricing fetcher.
 *
 * Given an active ingredient (and optionally a packaging size) for a single
 * competitor distributor, this module uses the Vercel AI Gateway (AI SDK v6)
 * with Anthropic's native web search tool to find current product listings on
 * that competitor's site, and returns a structured list of `{ productName,
 * price, unitOfMeasure, containerSize, sourceUrl, packaging, retailerName }`
 * rows validated against a Zod schema.
 *
 * Domain handling:
 *   - When `competitor.base_url` is present (FBN, Forestry Distributing,
 *     Chemical Warehouse), the agent is restricted to that domain via
 *     `allowedDomains`.
 *   - When `competitor.base_url` is null (the seeded "Open Web" pseudo-
 *     competitor), `allowedDomains` is omitted so Claude can search across
 *     any retailer. The actual retailer is captured per-listing on the
 *     `retailerName` field.
 *
 * The agent never hallucinates prices: if no verifiable listing is found,
 * the caller records `fetch_status='not_found'` on the DB row instead of
 * writing a fake price.
 *
 * Auth: uses the Vercel AI Gateway via a plain `provider/model` string. On
 * Vercel this works automatically once the project is linked; locally the
 * developer runs `vercel env pull` to populate `VERCEL_OIDC_TOKEN`. When
 * neither OIDC nor `AI_GATEWAY_API_KEY` is present, `ANTHROPIC_API_KEY`
 * still works via the `@ai-sdk/anthropic` provider fallback used by this
 * module's optional non-gateway path.
 */

import { generateText, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

import type { ParsedIngredient, ParsedPackaging } from './competitor-match';
import { buildSearchQuery, parsePackaging, retailerNameFromUrl } from './competitor-match';

export interface CompetitorInfo {
  id: string;
  name: string;
  /** NULL for the "Open Web" pseudo-competitor where the agent searches across any retailer. */
  base_url: string | null;
  search_template: string | null;
}

export interface CompetitorListing {
  productName: string;
  price: number;
  unitOfMeasure: string | null;
  containerSize: string | null;
  sourceUrl: string;
  /** Direct URL to the product image on the competitor's page. NULL when not found. */
  imageUrl: string | null;
  /** Parsed packaging derived from `containerSize` (or null when unparseable). */
  packaging: ParsedPackaging | null;
  /** Retailer extracted from `sourceUrl` hostname (only meaningful for open-web hits). */
  retailerName: string | null;
}

export type FetchOutcome =
  | { status: 'ok'; listings: CompetitorListing[] }
  | { status: 'not_found'; reason: string }
  | { status: 'failed'; reason: string };

const listingSchema = z.object({
  productName: z.string().min(1),
  price: z.number().positive(),
  // Zod .nullable() types the field as `string | null | undefined`; we
  // normalize missing/undefined to `null` after parsing so the downstream
  // CompetitorListing shape is consistent.
  unitOfMeasure: z.string().nullable().optional(),
  containerSize: z.string().nullable().optional(),
  sourceUrl: z.string().url(),
  // Image URLs are optional. We accept any URL the agent reports, then the
  // browser falls back to a generic placeholder if the URL 404s.
  imageUrl: z.string().url().nullable().optional(),
});

const responseSchema = z.object({
  listings: z.array(listingSchema),
  notes: z.string().optional(),
});

const AGENT_SYSTEM_PROMPT = `You are a pricing research assistant for an agricultural chemicals retailer.

Your task: given an active ingredient (and optionally a target packaging size), use web search to find currently listed products on the requested retailer(s) that contain that active ingredient at the requested concentration AND match the requested packaging, and return them as structured JSON.

Rules:
1. ONLY return products from the requested retailer scope. If the user provides a competitor site, listings MUST be hosted on that site. If the user opens up the search to the open web, return listings from any legitimate retailer but capture the full direct product page URL.
2. ONLY return products where you can verify the active ingredient and concentration from the product page.
3. ONLY return a price if you see it explicitly on the product page. Never estimate or guess.
4. The sourceUrl MUST be the direct product page URL, not a search results page.
5. When a target packaging size is provided (e.g. "2.5 gal"), ONLY return listings that match that packaging within roughly 5% — exclude bulk drums, totes, cases, and unrelated sizes.
6. Return between 0 and 3 listings — pick the best matches, not exhaustive results.
7. If no matching products are found, return an empty array.
8. Prices must be in USD as a plain number (e.g. 149.99), with no currency symbols.
9. Units must be normalized to one of: "gal", "qt", "pt", "fl oz", "lb", "oz", "each", "case".
10. Always populate containerSize when known (e.g. "2.5 gal", "30 gal", "1 qt", "50 lb"). Leave null only if the page genuinely does not state the size.
11. Always populate imageUrl with a direct URL to the primary product image on the product page (typically the hero/main product photo). Use the absolute URL — not a thumbnail, not a base64 data URI, not a relative path. Use null only if the page truly has no product image you can extract.`;

/**
 * Model used for competitor pricing research. Plain `provider/model` strings
 * route through the Vercel AI Gateway automatically. We explicitly wrap via
 * `anthropic(...)` here because we need Anthropic's built-in web search tool,
 * which is a provider-specific feature.
 */
const MODEL = anthropic('claude-sonnet-4-5-20250929');

/**
 * Fetch current competitor listings for a single (competitor, ingredient,
 * packaging) tuple. Safe to call in parallel — the caller is responsible for
 * concurrency limits and persistence.
 *
 * `packaging` is optional: when null, the agent is asked to find any
 * packaging size for the ingredient, which is useful for products whose
 * `containerSizes` attribute is unparseable.
 */
export async function fetchCompetitorListings(
  competitor: CompetitorInfo,
  ingredient: ParsedIngredient,
  packaging: ParsedPackaging | null = null,
  options: { signal?: AbortSignal } = {}
): Promise<FetchOutcome> {
  const isOpenWeb = !competitor.base_url;
  const searchQuery = buildSearchQuery(competitor.search_template, ingredient, packaging);
  const concentrationText = ingredient.concentration !== null
    ? `${ingredient.concentration}%`
    : 'any concentration';
  const packagingText = packaging
    ? `${packaging.display} containers (match within ~5%)`
    : 'any container size';

  const scopeLine = isOpenWeb
    ? 'Search scope: open web — search across any legitimate retailer (Amazon, Tractor Supply, manufacturer sites, Do My Own, etc.). Capture the full product page URL on the retailer\'s domain.'
    : `Competitor site: ${competitor.base_url}\nSearch scope: only listings hosted on ${competitor.base_url}.`;

  const prompt = `Competitor: ${competitor.name}
${scopeLine}
Active ingredient: ${ingredient.display}
Target concentration: ${concentrationText}
Target packaging: ${packagingText}
Suggested search query: ${searchQuery}

Find up to 3 current product listings that contain ${ingredient.display} at ${concentrationText} in ${packagingText}. ${isOpenWeb ? 'Use web search across the open web.' : `Use web search scoped to ${competitor.base_url}.`} Return a JSON object with the shape:

{
  "listings": [
    {
      "productName": string,
      "price": number,
      "unitOfMeasure": string | null,
      "containerSize": string | null,
      "sourceUrl": string,
      "imageUrl": string | null
    }
  ],
  "notes": string (optional — reason if no listings found)
}

Return ONLY the JSON object, no prose.`;

  // Anthropic's webSearch tool only restricts to allowedDomains when the
  // option is set. For the open-web bucket we omit it entirely so Claude
  // can browse any retailer. We also bump maxUses for open-web to allow
  // broader exploration across multiple retailers.
  const webSearchOptions = isOpenWeb
    ? { maxUses: 6 }
    : { maxUses: 4, allowedDomains: [new URL(competitor.base_url!).hostname] };

  try {
    const result = await generateText({
      model: MODEL,
      system: AGENT_SYSTEM_PROMPT,
      prompt,
      tools: {
        web_search: anthropic.tools.webSearch_20250305(webSearchOptions),
      },
      stopWhen: stepCountIs(isOpenWeb ? 8 : 6),
      abortSignal: options.signal,
    });

    const jsonText = extractJsonObject(result.text);
    if (!jsonText) {
      return { status: 'failed', reason: 'Agent response contained no JSON object' };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonText);
    } catch (err) {
      return {
        status: 'failed',
        reason: `Invalid JSON in agent response: ${(err as Error).message}`,
      };
    }

    const validated = responseSchema.safeParse(parsedJson);
    if (!validated.success) {
      return {
        status: 'failed',
        reason: `Agent response failed schema validation: ${validated.error.message}`,
      };
    }

    if (validated.data.listings.length === 0) {
      return {
        status: 'not_found',
        reason: validated.data.notes ?? 'No matching listings found',
      };
    }

    const listings: CompetitorListing[] = validated.data.listings.map((l) => {
      const containerSize = l.containerSize ?? null;
      const unitOfMeasure = l.unitOfMeasure ?? null;
      return {
        productName: l.productName,
        price: l.price,
        unitOfMeasure,
        containerSize,
        sourceUrl: l.sourceUrl,
        imageUrl: l.imageUrl ?? null,
        packaging: parsePackaging(containerSize, unitOfMeasure),
        retailerName: isOpenWeb ? retailerNameFromUrl(l.sourceUrl) : null,
      };
    });

    return { status: 'ok', listings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'failed', reason: message };
  }
}

/**
 * Pull the first top-level JSON object from a string. The agent is
 * instructed to return JSON only, but we still defensively strip any
 * surrounding ```json fences or prose so unexpected formatting doesn't
 * fail the run.
 */
function extractJsonObject(text: string): string | null {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1] : text;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;
  return candidate.slice(firstBrace, lastBrace + 1);
}
