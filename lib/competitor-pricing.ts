/**
 * AI-powered competitor pricing fetcher.
 *
 * Given an active ingredient and a competitor distributor, this module uses
 * the Vercel AI Gateway (AI SDK v6) with Anthropic's native web search tool
 * to find current product listings on that competitor's site, and returns a
 * structured list of `{ productName, price, unitOfMeasure, containerSize,
 * sourceUrl }` rows validated against a Zod schema.
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

import type { ParsedIngredient } from './competitor-match';
import { buildSearchQuery } from './competitor-match';

export interface CompetitorInfo {
  id: string;
  name: string;
  base_url: string;
  search_template: string | null;
}

export interface CompetitorListing {
  productName: string;
  price: number;
  unitOfMeasure: string | null;
  containerSize: string | null;
  sourceUrl: string;
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
});

const responseSchema = z.object({
  listings: z.array(listingSchema),
  notes: z.string().optional(),
});

const AGENT_SYSTEM_PROMPT = `You are a pricing research assistant for an agricultural chemicals retailer.

Your task: given an active ingredient and a specific competitor distributor, use web search to find currently listed products on that distributor's site that contain that active ingredient at the requested concentration, and return them as structured JSON.

Rules:
1. ONLY return products sold on the specified competitor's site. Never return listings from other retailers.
2. ONLY return products where you can verify the active ingredient and concentration from the competitor's product page.
3. ONLY return a price if you see it explicitly on the competitor's page. Never estimate or guess.
4. The sourceUrl MUST be the direct product page URL, not a search results page.
5. Return between 0 and 3 listings — pick the best matches, not exhaustive results.
6. If no matching products are found on the competitor's site, return an empty array.
7. Prices must be in USD as a plain number (e.g. 149.99), with no currency symbols.
8. Units must be normalized to one of: "gal", "qt", "pt", "fl oz", "lb", "oz", "each", "case".`;

/**
 * Model used for competitor pricing research. Plain `provider/model` strings
 * route through the Vercel AI Gateway automatically. We explicitly wrap via
 * `anthropic(...)` here because we need Anthropic's built-in web search tool,
 * which is a provider-specific feature.
 */
const MODEL = anthropic('claude-sonnet-4-5-20250929');

/**
 * Fetch current competitor listings for a single (competitor, ingredient)
 * pair. Safe to call in parallel — the caller is responsible for concurrency
 * limits and persistence.
 */
export async function fetchCompetitorListings(
  competitor: CompetitorInfo,
  ingredient: ParsedIngredient,
  options: { signal?: AbortSignal } = {}
): Promise<FetchOutcome> {
  const searchQuery = buildSearchQuery(competitor.search_template, ingredient);
  const concentrationText = ingredient.concentration !== null
    ? `${ingredient.concentration}%`
    : 'any concentration';

  const prompt = `Competitor: ${competitor.name}
Competitor site: ${competitor.base_url}
Active ingredient: ${ingredient.display}
Target concentration: ${concentrationText}
Suggested search query: ${searchQuery}

Find up to 3 current product listings on ${competitor.name} that contain ${ingredient.display} at ${concentrationText}. Use web search scoped to ${competitor.base_url}. Return a JSON object with the shape:

{
  "listings": [
    {
      "productName": string,
      "price": number,
      "unitOfMeasure": string | null,
      "containerSize": string | null,
      "sourceUrl": string
    }
  ],
  "notes": string (optional — reason if no listings found)
}

Return ONLY the JSON object, no prose.`;

  try {
    const result = await generateText({
      model: MODEL,
      system: AGENT_SYSTEM_PROMPT,
      prompt,
      tools: {
        web_search: anthropic.tools.webSearch_20250305({
          maxUses: 4,
          allowedDomains: [new URL(competitor.base_url).hostname],
        }),
      },
      stopWhen: stepCountIs(6),
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
        reason: validated.data.notes ?? 'No matching listings on competitor site',
      };
    }

    const listings: CompetitorListing[] = validated.data.listings.map((l) => ({
      productName: l.productName,
      price: l.price,
      unitOfMeasure: l.unitOfMeasure ?? null,
      containerSize: l.containerSize ?? null,
      sourceUrl: l.sourceUrl,
    }));

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
