import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';

const suggestComparableSchema = z.object({
  name: z.string().min(1),
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

const SYSTEM_PROMPT = `You are an expert in the agricultural chemicals and crop inputs industry.

Your task is to suggest 6 well-known competing or comparable brand-name products for the given product. These suggestions will be displayed on an e-commerce storefront so customers can compare products.

Guidelines:
- Suggest real, well-known brand names that are direct competitors or close alternatives
- Focus on products that serve the same purpose (same active ingredient class, same use case, or same crop segment)
- Vary the suggestions to cover different manufacturers/brands where possible
- Do NOT include generic descriptions — only real product brand names
- If the product is a herbicide, suggest competing herbicide brands; if a fungicide, suggest competing fungicides; etc.
- For the agricultural/crop inputs sector, think of brands from companies like Bayer, Syngenta, BASF, Corteva, FMC, Nufarm, Valent, Helena, Winfield United, etc.

Respond ONLY with a valid JSON array of strings — no extra text, no markdown, no explanations:
["Product Name 1", "Product Name 2", "Product Name 3", "Product Name 4", "Product Name 5", "Product Name 6"]`;

// POST /api/admin/products/suggest-comparable
// Stateless — accepts product details, returns AI-suggested comparable product names.
export async function POST(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = suggestComparableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI suggestions unavailable — ANTHROPIC_API_KEY is not configured' },
      { status: 503 }
    );
  }

  const { name, category, description } = parsed.data;

  const userPrompt = `Please suggest 6 comparable or competing products for the following:

Product Name: ${name}
Category: ${category ?? 'Not specified'}
Description: ${description ?? 'Not provided'}`;

  try {
    const client = new Anthropic({ apiKey });

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

    // Strip markdown code fences if present
    const rawText = content.text.trim();
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const suggestions = JSON.parse(jsonText) as unknown;

    if (!Array.isArray(suggestions) || suggestions.some((s) => typeof s !== 'string')) {
      throw new Error('Invalid response structure from Claude');
    }

    return NextResponse.json({ suggestions: suggestions as string[] });
  } catch (error) {
    console.error('[SuggestComparable] Failed:', error);
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 });
  }
}
