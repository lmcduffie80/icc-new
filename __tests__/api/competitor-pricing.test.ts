import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/products/[id]/competitor-pricing/route';

const { mockQuery, mockQueryOne } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

function buildParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/products/[id]/competitor-pricing', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
  });

  it('returns 404 when the product does not exist', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const response = await GET(new Request('http://localhost/api/x') as never, buildParams('missing'));
    expect(response.status).toBe(404);
  });

  it('returns the product shape with empty competitors when no active ingredient parses', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'prod-1',
      name: 'Natural Seed',
      price: '100.00',
      unit_of_measure: 'bag',
      attributes: { activeIngredients: 'N/A - Natural Seed' },
    });

    const response = await GET(
      new Request('http://localhost/api/x') as never,
      buildParams('prod-1')
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.matchedIngredient).toBeNull();
    expect(body.competitors).toEqual([]);
    expect(body.ours.price).toBe(100);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns competitor rows sorted by price ascending and computes savings', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'prod-2',
      name: 'ICC Glyphosate 41%',
      price: '50.00',
      unit_of_measure: 'gallon',
      attributes: { activeIngredients: 'Glyphosate 41%' },
    });
    mockQuery.mockResolvedValueOnce([
      {
        id: 'cp-1',
        competitor_id: 'fbn',
        competitor_name: 'FBN',
        competitor_slug: 'fbn',
        product_name: 'FBN Glyphosate',
        price: '60.00',
        unit_of_measure: 'gallon',
        container_size: '2.5 gal',
        source_url: 'https://fbn.com/p/1',
        last_fetched_at: '2025-01-01T00:00:00Z',
        fetch_status: 'ok',
        concentration_percent: '41.0',
      },
      {
        id: 'cp-2',
        competitor_id: 'forestry',
        competitor_name: 'Forestry Distributing',
        competitor_slug: 'forestry-distributing',
        product_name: 'Forestry Glyphosate',
        price: '45.00',
        unit_of_measure: 'gallon',
        container_size: '2.5 gal',
        source_url: 'https://forestrydistributing.com/p/1',
        last_fetched_at: '2025-01-01T00:00:00Z',
        fetch_status: 'ok',
        concentration_percent: '41.0',
      },
    ]);

    const response = await GET(
      new Request('http://localhost/api/x') as never,
      buildParams('prod-2')
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=900');

    const body = await response.json();
    expect(body.matchedIngredient?.normalized).toBe('glyphosate');
    expect(body.competitors).toHaveLength(2);
    expect(body.competitors[0].competitorSlug).toBe('forestry-distributing');
    expect(body.competitors[0].price).toBe(45);
    expect(body.competitors[0].savingsVsOurs).toBe(-5);
    expect(body.competitors[1].price).toBe(60);
    expect(body.competitors[1].savingsVsOurs).toBe(10);
  });

  it('filters out listings whose concentration is outside tolerance', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'prod-3',
      name: 'Glyph 41%',
      price: '50.00',
      unit_of_measure: 'gallon',
      attributes: { activeIngredients: 'Glyphosate 41%' },
    });
    mockQuery.mockResolvedValueOnce([
      {
        id: 'cp-a',
        competitor_id: 'fbn',
        competitor_name: 'FBN',
        competitor_slug: 'fbn',
        product_name: 'Glyph 41',
        price: '44.00',
        unit_of_measure: 'gallon',
        container_size: null,
        source_url: null,
        last_fetched_at: '2025-01-01T00:00:00Z',
        fetch_status: 'ok',
        concentration_percent: '41.0',
      },
      {
        id: 'cp-b',
        competitor_id: 'forestry',
        competitor_name: 'Forestry Distributing',
        competitor_slug: 'forestry-distributing',
        product_name: 'Glyph 53',
        price: '30.00',
        unit_of_measure: 'gallon',
        container_size: null,
        source_url: null,
        last_fetched_at: '2025-01-01T00:00:00Z',
        fetch_status: 'ok',
        concentration_percent: '53.0',
      },
    ]);

    const response = await GET(
      new Request('http://localhost/api/x') as never,
      buildParams('prod-3')
    );
    const body = await response.json();
    expect(body.competitors).toHaveLength(1);
    expect(body.competitors[0].competitorSlug).toBe('fbn');
  });

  it('includes fetch_status not_found rows with null price', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'prod-4',
      name: 'Glyph 41%',
      price: '50.00',
      unit_of_measure: 'gallon',
      attributes: { activeIngredients: 'Glyphosate 41%' },
    });
    mockQuery.mockResolvedValueOnce([
      {
        id: 'cp-nf',
        competitor_id: 'cw',
        competitor_name: 'Chemical Warehouse',
        competitor_slug: 'chemical-warehouse',
        product_name: 'No match',
        price: null,
        unit_of_measure: null,
        container_size: null,
        source_url: null,
        last_fetched_at: '2025-01-01T00:00:00Z',
        fetch_status: 'not_found',
        concentration_percent: null,
      },
    ]);

    const response = await GET(
      new Request('http://localhost/api/x') as never,
      buildParams('prod-4')
    );
    const body = await response.json();
    expect(body.competitors).toHaveLength(1);
    expect(body.competitors[0].price).toBeNull();
    expect(body.competitors[0].fetchStatus).toBe('not_found');
    expect(body.competitors[0].savingsVsOurs).toBeNull();
  });
});
