import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSoilMoisture, interpretMoisture, latLngToStateFips } from '@/lib/smap';

describe('interpretMoisture', () => {
  it('classifies boundary values correctly', () => {
    expect(interpretMoisture(0.05).condition).toBe('drought');
    expect(interpretMoisture(0.15).condition).toBe('dry');
    expect(interpretMoisture(0.25).condition).toBe('normal');
    expect(interpretMoisture(0.35).condition).toBe('moist');
    expect(interpretMoisture(0.45).condition).toBe('saturated');
  });
});

describe('latLngToStateFips', () => {
  it('maps a lat/lng near Iowa to the Iowa FIPS code', () => {
    expect(latLngToStateFips(42.0, -93.5)).toBe('19');
  });
});

describe('fetchSoilMoisture', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  /** Extracts the SMAP layer date (YYYY.MM.DD) embedded in the request URL. */
  function dateFromUrl(url: string): string | null {
    const match = url.match(/SMAP-9KM-DAILY-SUB_(\d{4}\.\d{2}\.\d{2})_/);
    return match ? match[1] : null;
  }

  it('probes all 5 candidate days in parallel and prefers the most recent day with data', async () => {
    const calledDates: string[] = [];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      const dateStr = dateFromUrl(url) ?? '';
      calledDates.push(dateStr);

      // The freshest day (2 days ago) has no published data yet; the next
      // one back (3 days ago) does. Later days would also have data, but
      // the 3-days-ago result should win since it's most recent.
      const today = new Date();
      const daysAgo2 = new Date(today);
      daysAgo2.setUTCDate(daysAgo2.getUTCDate() - 2);
      const twoDaysAgoStr = [
        daysAgo2.getUTCFullYear(),
        String(daysAgo2.getUTCMonth() + 1).padStart(2, '0'),
        String(daysAgo2.getUTCDate()).padStart(2, '0'),
      ].join('.');

      if (dateStr === twoDaysAgoStr) {
        return Promise.resolve({ ok: false, text: async () => '' } as Response);
      }
      return Promise.resolve({
        ok: true,
        text: async () => "{'median': 0.222, 'mean': 0.225}",
      } as Response);
    });

    const result = await fetchSoilMoisture('19'); // fresh fips, not cached from other tests

    expect(result).not.toBeNull();
    expect(result?.mean).toBeCloseTo(0.225, 5);
    // All 5 candidate days should have been requested (parallel probing).
    expect(global.fetch).toHaveBeenCalledTimes(5);
  });

  it('returns null when no candidate day has data', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, text: async () => '' } as Response);

    const result = await fetchSoilMoisture('20'); // distinct fips, avoids cache collisions
    expect(result).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(5);
  });

  it('treats a 200 OK "ServerBusy" exception body as no data (not a parse crash)', async () => {
    // Some WPS deployments return 200 with an exception body rather than a
    // non-2xx status when overloaded — make sure we still detect it as
    // "no usable data" instead of trying to parse mean/median out of it.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<?xml version="1.0"?><ows:ExceptionReport><ows:Exception exceptionCode="ServerBusy"><ows:ExceptionText>Maximum number of parallel running processes reached. Please try later.</ows:ExceptionText></ows:Exception></ows:ExceptionReport>',
    } as Response);

    const result = await fetchSoilMoisture('22'); // distinct fips
    expect(result).toBeNull();
  });

  it('handles many concurrent fips lookups without hanging (concurrency limiter drains correctly)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "{'median': 0.20, 'mean': 0.21}",
    } as Response);

    // More than the internal concurrency cap, across distinct fips codes so
    // none hit the in-memory result cache.
    const fipsCodes = ['23', '24', '25', '26', '28', '30', '32', '33', '34', '35', '36', '37'];
    const results = await Promise.all(fipsCodes.map((f) => fetchSoilMoisture(f)));
    expect(results.every((r) => r?.mean === 0.21)).toBe(true);
  });

  it('caches a successful result in-memory for subsequent calls (no re-fetch)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "{'median': 0.18, 'mean': 0.19}",
    } as Response);

    const first = await fetchSoilMoisture('21'); // distinct fips
    expect(first).not.toBeNull();
    const callsAfterFirst = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callsAfterFirst).toBe(5);

    const second = await fetchSoilMoisture('21');
    expect(second).toEqual(first);
    // No additional network calls — served from the in-memory cache.
    expect(global.fetch).toHaveBeenCalledTimes(callsAfterFirst);
  });
});
