/**
 * Server-side fallback for extracting a product image URL from a competitor
 * page. The Claude web-search agent reliably returns prices and product
 * names but its image_url field is null on most pages — Claude only sees
 * what shows up in the search snippet text, not the page's `<head>`.
 *
 * Almost every modern e-commerce site exposes the primary product image
 * via Open Graph (`og:image`) or Twitter Cards (`twitter:image`). We fetch
 * the page (with a tiny budget — only the first 256KB, since meta tags live
 * in `<head>`) and pull the first match.
 *
 * This is best-effort: if the fetch fails (403, timeout, non-HTML, etc.) we
 * return null and the UI falls back to its placeholder. We never throw.
 */

const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 256 * 1024;

// We send a current Chrome User-Agent rather than identifying as a bot
// because most large e-commerce sites (FBN, Tractor Supply, etc.) block
// non-browser user agents with a 403 — even though all we do is read
// publicly-served `og:image` meta tags. This is the same UA pattern that
// link-preview services (Slack, Discord) use to render link cards.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Patterns that match Open Graph / Twitter Card image meta tags. We accept
 * either order of the `property` and `content` attributes since templating
 * engines emit them inconsistently.
 */
const META_IMAGE_PATTERNS: ReadonlyArray<RegExp> = [
  /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
  /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
];

/**
 * Fetch the og:image / twitter:image URL from a competitor product page.
 * Returns null when no usable image can be extracted; never throws.
 */
export async function fetchOgImage(
  pageUrl: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<string | null> {
  if (!pageUrl) return null;

  // Attach a short timeout so a stuck competitor page doesn't block the
  // refresh cron — even if the caller passes its own AbortSignal, we OR
  // them together.
  const timeout = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ac.abort(), timeout);

  try {
    const response = await fetch(pageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: ac.signal,
    });

    if (!response.ok || !response.body) return null;
    const ctype = response.headers.get('content-type') ?? '';
    if (!ctype.toLowerCase().includes('text/html')) return null;

    // Stream-read a bounded amount and stop once we've passed </head> or
    // hit the byte budget. Most pages put og:image within the first 50KB.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    let received = 0;
    try {
      while (received < MAX_HTML_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (/<\/head>/i.test(html)) break;
      }
    } finally {
      // Don't await: we don't care if the cancel rejects.
      reader.cancel().catch(() => {});
    }

    for (const pattern of META_IMAGE_PATTERNS) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const raw = decodeHtmlEntities(match[1].trim());
        try {
          // Resolve relative URLs against the page URL.
          const resolved = new URL(raw, pageUrl);
          if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
            return null;
          }
          return resolved.toString();
        } catch {
          return null;
        }
      }
    }

    return null;
  } catch {
    // Network errors, aborts, decode errors — all best-effort failures.
    return null;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Minimal HTML entity decoder for the handful of entities that show up in
 * URLs (e.g. `&amp;` in query strings). We avoid pulling in a full HTML
 * parser since meta-tag content is almost always plain or entity-light.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, '/');
}
