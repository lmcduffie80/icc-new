import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchOgImage } from '@/lib/competitor-image';

const PAGE_URL = 'https://shop.example.com/products/glyphosate-2-5-gal';

function htmlResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  });
}

describe('fetchOgImage', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('extracts the og:image URL when meta tag is property-first', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      htmlResponse(`<html><head>
        <title>Glyphosate 2.5 gal</title>
        <meta property="og:image" content="https://cdn.example.com/img/glyph.jpg" />
      </head><body></body></html>`)
    );
    const result = await fetchOgImage(PAGE_URL);
    expect(result).toBe('https://cdn.example.com/img/glyph.jpg');
  });

  it('extracts when meta tag is content-first (attribute order swapped)', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      htmlResponse(`<html><head>
        <meta content="https://cdn.example.com/img/swapped.png" property="og:image">
      </head></html>`)
    );
    const result = await fetchOgImage(PAGE_URL);
    expect(result).toBe('https://cdn.example.com/img/swapped.png');
  });

  it('falls back to twitter:image when og:image is absent', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      htmlResponse(`<html><head>
        <meta name="twitter:image" content="https://cdn.example.com/img/twitter.jpg">
      </head></html>`)
    );
    const result = await fetchOgImage(PAGE_URL);
    expect(result).toBe('https://cdn.example.com/img/twitter.jpg');
  });

  it('resolves relative image URLs against the page URL', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      htmlResponse(`<html><head>
        <meta property="og:image" content="/cdn/relative.jpg">
      </head></html>`)
    );
    const result = await fetchOgImage(PAGE_URL);
    expect(result).toBe('https://shop.example.com/cdn/relative.jpg');
  });

  it('decodes &amp; entities in the URL', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      htmlResponse(`<html><head>
        <meta property="og:image" content="https://cdn.example.com/img.jpg?w=600&amp;h=600">
      </head></html>`)
    );
    const result = await fetchOgImage(PAGE_URL);
    expect(result).toBe('https://cdn.example.com/img.jpg?w=600&h=600');
  });

  it('returns null when no og/twitter image is present', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      htmlResponse(`<html><head><title>No image here</title></head></html>`)
    );
    const result = await fetchOgImage(PAGE_URL);
    expect(result).toBeNull();
  });

  it('returns null on non-HTML responses (e.g. JSON API endpoints)', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('{"hello":"world"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const result = await fetchOgImage(PAGE_URL);
    expect(result).toBeNull();
  });

  it('returns null on non-2xx responses', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('Forbidden', { status: 403 })
    );
    const result = await fetchOgImage(PAGE_URL);
    expect(result).toBeNull();
  });

  it('returns null when fetch throws (network error)', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('ECONNRESET')
    );
    const result = await fetchOgImage(PAGE_URL);
    expect(result).toBeNull();
  });

  it('rejects javascript: and other non-http schemes', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      htmlResponse(`<html><head>
        <meta property="og:image" content="javascript:alert(1)">
      </head></html>`)
    );
    const result = await fetchOgImage(PAGE_URL);
    expect(result).toBeNull();
  });

  it('returns null when given an empty page URL', async () => {
    const result = await fetchOgImage('');
    expect(result).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
