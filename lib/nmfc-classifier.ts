/**
 * NMFC (National Motor Freight Classification) AI classifier
 *
 * Uses Claude to suggest an NMFC number for a product based on its
 * name, description, category, unit of measure, and carton dimensions.
 *
 * Returns null (without throwing) when ANTHROPIC_API_KEY is not configured,
 * so callers can silently skip classification in environments without the key.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface NmfcClassificationInput {
  name: string;
  description?: string | null;
  category?: string | null;
  unit_of_measure?: string | null;
  carton_length?: number | null;
  carton_width?: number | null;
  carton_height?: number | null;
  carton_weight_lbs?: number | null;
}

export interface NmfcClassificationResult {
  nmfc_number: string;
  freight_class: string;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are an expert in the National Motor Freight Classification (NMFC) system used for LTL (Less-Than-Truckload) freight in the United States.

Your task is to suggest the most appropriate NMFC item number for an agricultural chemical or crop input product based on the product details provided.

NMFC numbers are used to classify freight for LTL shipping. Common NMFC classes for agricultural chemicals include:
- Pesticides, herbicides, fungicides: typically NMFC 46120 (Class 55-70)
- Fertilizers, dry: typically NMFC 155020 (Class 55-65)
- Fertilizers, liquid: typically NMFC 155040 (Class 55-70)
- Seed treatments: typically NMFC 46120 or 155020 depending on form
- Adjuvants and surfactants: typically NMFC 46120 (Class 55-65)
- Micronutrients and trace elements: typically NMFC 155020

When evaluating, consider:
1. Product name and category (herbicide, fungicide, fertilizer, etc.)
2. Physical form (liquid, dry, granular)
3. Container type inferred from unit of measure (gallon, tote, bag, etc.)
4. Carton dimensions and weight (density affects freight class)

Respond ONLY with a valid JSON object in this exact format:
{
  "nmfc_number": "46120",
  "freight_class": "65",
  "reasoning": "Brief explanation of why this NMFC number and freight class apply",
  "confidence": "high" | "medium" | "low"
}

The freight_class must be one of the standard LTL freight classes: 50, 55, 60, 65, 70, 77.5, 85, 92.5, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500.
Freight class is determined primarily by density (weight per cubic foot): higher density = lower class number = lower cost.
For agricultural chemicals in standard cartons/totes, class 55-70 is typical.

Do not include any text outside the JSON object.`;

export async function classifyNmfc(
  product: NmfcClassificationInput
): Promise<NmfcClassificationResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  const client = new Anthropic({ apiKey });

  const isTote = ['tote', 'tank'].some(t =>
    product.unit_of_measure?.toLowerCase().includes(t)
  );

  const dimensionDetails = isTote
    ? 'Container type: Tote (no carton — ships as-is on pallet; dimensions not applicable)'
    : (product.carton_length && product.carton_width && product.carton_height
        ? `Carton dimensions: ${product.carton_length}" L × ${product.carton_width}" W × ${product.carton_height}" H`
        : 'Carton dimensions: not provided');

  const weightDetail = isTote
    ? (product.carton_weight_lbs
        ? `Tote weight: ${product.carton_weight_lbs} lbs`
        : 'Tote weight: approximately 2,800 lbs (standard 265-gallon tote)')
    : (product.carton_weight_lbs
        ? `Carton weight: ${product.carton_weight_lbs} lbs`
        : 'Carton weight: not provided');

  const userPrompt = `Please suggest an NMFC number for the following product:

Product Name: ${product.name}
Category: ${product.category ?? 'Not specified'}
Description: ${product.description ?? 'Not provided'}
Unit of Measure: ${product.unit_of_measure ?? 'Not specified'}
${dimensionDetails}
${weightDetail}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Strip markdown code fences that Claude sometimes adds despite being instructed not to
    const rawText = content.text.trim();
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(jsonText) as {
      nmfc_number: string;
      freight_class: string;
      reasoning: string;
      confidence?: string;
    };

    if (!parsed.nmfc_number || !parsed.freight_class || !parsed.reasoning) {
      throw new Error('Invalid response structure from Claude');
    }

    return {
      nmfc_number: parsed.nmfc_number,
      freight_class: parsed.freight_class,
      reasoning: parsed.reasoning,
    };
  } catch (error) {
    console.error('[NmfcClassifier] Classification failed:', error);
    return null;
  }
}
