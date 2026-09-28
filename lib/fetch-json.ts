/**
 * Reads a fetch Response as JSON, guarding against non-JSON bodies (e.g. a
 * platform-level timeout/size-limit page) so callers never hit a raw,
 * uncaught `SyntaxError` from `res.json()` — which surfaces to users as a
 * confusing "parsing error" instead of an actionable message.
 */
export async function parseJsonResponse<T = unknown>(
  res: Response
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    return {
      ok: false,
      error: res.ok
        ? 'The server returned an unexpected response. Please try again.'
        : `Something went wrong (status ${res.status}). Please try again.`,
    };
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error;
    return { ok: false, error: message || 'Something went wrong. Please try again.' };
  }
  return { ok: true, data: data as T };
}
