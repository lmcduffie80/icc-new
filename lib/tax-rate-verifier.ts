/**
 * AI-powered tax rate verifier
 *
 * Uses Claude to cross-check configured state tax rates against its knowledge
 * of current US sales/use tax rates for agricultural inputs.
 *
 * Returns null (without throwing) when ANTHROPIC_API_KEY is not configured.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface TaxRateVerificationInput {
  stateCode: string;
  rate: number; // decimal, e.g. 0.08 for 8%
}

export interface TaxRateVerificationResult {
  stateCode: string;
  configuredRate: number;
  suggestedRate: number;
  verdict: 'match' | 'mismatch' | 'unknown';
  reasoning: string;
}

const SYSTEM_PROMPT = `You are a US sales and use tax expert specializing in pesticide and crop protection product sales to licensed farmers and agricultural producers.

The company selling these products is an agricultural chemical distributor. Customers are licensed farmers purchasing pesticides (herbicides, fungicides, insecticides), adjuvants, and crop protection chemicals for use in commercial farming operations — NOT for residential or non-agricultural use.

You will be given a list of US state codes and their configured tax rates (as decimals, e.g. 0.08 = 8%). For each state, provide:
1. The correct sales/use tax rate for pesticides sold to licensed farmers in that state
2. A verdict: "match" if the configured rate is correct, "mismatch" if it differs significantly (more than 0.5 percentage points), or "unknown" if you are not confident
3. A brief reasoning explaining the rate and any relevant farmer/agricultural exemptions

Critical notes:
- Many states have full sales tax exemptions for pesticides sold to farmers for agricultural production — in those states the correct rate is 0%
- Some states exempt only certain pesticide types or require a farmer exemption certificate
- A configured rate of 0% may be correct if the state has a blanket ag pesticide exemption
- A configured rate matching the general sales tax rate may be wrong if the state exempts ag pesticides
- Use your best knowledge of each state's agricultural exemption laws but acknowledge uncertainty where it exists

Respond ONLY with a valid JSON array in this exact format (no text outside the array):
[
  {
    "stateCode": "CA",
    "suggestedRate": 0.0725,
    "verdict": "match",
    "reasoning": "California does not provide a blanket sales tax exemption for pesticides sold to farmers. The standard rate of 7.25% applies."
  }
]`;

export async function verifyTaxRates(
  rates: TaxRateVerificationInput[]
): Promise<TaxRateVerificationResult[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  if (rates.length === 0) {
    return [];
  }

  const client = new Anthropic({ apiKey });

  const rateList = rates
    .map((r) => `- ${r.stateCode}: ${(r.rate * 100).toFixed(4)}%`)
    .join('\n');

  const userPrompt = `Please verify the following configured state tax rates for pesticide and crop protection product sales to licensed farmers:

${rateList}

For each state, return your suggested rate (considering any farmer/agricultural exemptions), a verdict (match/mismatch/unknown), and reasoning.`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const parsed = JSON.parse(content.text) as Array<{
      stateCode: string;
      suggestedRate: number;
      verdict: string;
      reasoning: string;
    }>;

    if (!Array.isArray(parsed)) {
      throw new Error('Expected JSON array from Claude');
    }

    return parsed.map((item) => {
      const configured = rates.find((r) => r.stateCode === item.stateCode);
      const verdict =
        item.verdict === 'match' || item.verdict === 'mismatch' || item.verdict === 'unknown'
          ? item.verdict
          : 'unknown';
      return {
        stateCode: item.stateCode,
        configuredRate: configured?.rate ?? 0,
        suggestedRate: item.suggestedRate,
        verdict,
        reasoning: item.reasoning,
      };
    });
  } catch (error) {
    console.error('[TaxRateVerifier] Verification failed:', error);
    return null;
  }
}
