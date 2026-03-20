/**
 * ShipBoss LTL Freight Booking via Headless Browser
 *
 * The ShipBoss public API does not support booking LTL freight shipments.
 * This module uses Playwright to log into the ShipBoss web interface,
 * then calls the session-authenticated internal API from within the browser
 * context (via page.evaluate) so that session cookies are sent automatically.
 *
 * Flow:
 *   1. Launch headless Chromium via Playwright
 *   2. Navigate to ShipBoss login → AWS Cognito OAuth → redirect back
 *   3. Wait for the app to fully process the OAuth code and set session cookies
 *   4. Make all ShipBoss internal API calls via page.evaluate() so the browser
 *      automatically includes the authenticated session cookies:
 *      a. Navigate to /ship page            → auto-initializes fresh draft
 *      b. GET  /api/shipment               → retrieve draft ID
 *      c. POST /api/shipment/{id}/addresses → set from/to addresses
 *      d. POST /api/shipment/{id}/packages  → set package details
 *      e. GET  /api/shipment/{id}/rates     → fetch freight rates
 *      f. POST /api/shipment/{id}/submit    → submit for label/BOL
 *   5. Return tracking number, BOL URL, and booking confirmation
 */

import type { Page } from 'playwright';

const SHIPBOSS_BASE = 'https://ship.shipboss.io';
const LOGIN_URL = 'https://auth.shipboss.io/login?response_type=code&client_id=4uvdlv330mjk9b3u8hldjo0rfg&redirect_uri=https%3A%2F%2Fship.shipboss.io%2Flogin&scope=email+openid';

const LOGIN_TIMEOUT_MS = 60_000;
const API_TIMEOUT_MS = 30_000;

export interface FreightBookingInput {
  fromAddress: {
    name: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone: string;
    email?: string;
  };
  toAddress: {
    name: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone: string;
    email?: string;
  };
  packages: Array<{
    weight: number;
    length: number;
    width: number;
    height: number;
    quantity: number;
    commodity: string;
    freightClass: number;
  }>;
  pickupDate: string;
}

export interface FreightBookingResult {
  success: boolean;
  trackingNumber?: string;
  billOfLadingUrl?: string;
  carrier?: string;
  serviceName?: string;
  shipmentId?: string;
  error?: string;
}

interface BrowserApiResult {
  status: number;
  data: Record<string, unknown>;
  error?: string;
}

/**
 * Authenticate with ShipBoss via headless browser.
 * Returns an authenticated Playwright Page (browser stays open).
 * Caller is responsible for closing the browser via page.context().browser()?.close().
 */
async function getAuthenticatedPage(): Promise<Page> {
  const email = process.env.SHIPBOSS_WEB_EMAIL;
  const password = process.env.SHIPBOSS_WEB_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'SHIPBOSS_WEB_EMAIL and SHIPBOSS_WEB_PASSWORD must be set for LTL freight booking'
    );
  }

  // Dynamic import to avoid build failures on serverless (no Chromium binary)
  const { chromium } = await import('playwright');
  const wsEndpoint = process.env.BROWSERLESS_WS_ENDPOINT;

  const MAX_CONNECT_RETRIES = 3;
  const CONNECT_RETRY_DELAY_MS = 3000;

  // Connect or launch browser
  let browser: import('playwright').Browser;
  if (wsEndpoint) {
    // Extend Browserless.io session to 3 minutes so rate polling doesn't
    // exceed the default session limit. Browserless expects milliseconds.
    const wsUrl = wsEndpoint.includes('?')
      ? `${wsEndpoint}&timeout=180000`
      : `${wsEndpoint}?timeout=180000`;

    let lastError: unknown;
    let connectedBrowser: import('playwright').Browser | undefined;
    for (let attempt = 1; attempt <= MAX_CONNECT_RETRIES; attempt++) {
      try {
        connectedBrowser = await chromium.connect(wsUrl);
        break;
      } catch (err) {
        lastError = err;
        console.warn(
          `[freight-booking] Browserless connect attempt ${attempt}/${MAX_CONNECT_RETRIES} failed: ${err instanceof Error ? err.message : String(err)}`
        );
        if (attempt < MAX_CONNECT_RETRIES) {
          await new Promise((r) => setTimeout(r, CONNECT_RETRY_DELAY_MS));
        }
      }
    }
    if (!connectedBrowser) {
      throw lastError;
    }
    browser = connectedBrowser;
  } else {
    browser = await chromium.launch({ headless: true });
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  // Wrap all login steps in try/catch so the browser is always closed on
  // failure — prevents zombie sessions on Browserless.io that consume the
  // concurrent slot and cause 408s on the next attempt.
  try {
    console.log('[freight-booking] Navigating to ShipBoss login...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: LOGIN_TIMEOUT_MS });

    // Wait for the page to settle after navigation
    await page.waitForTimeout(2000);

    // Use React's native input setter to set values and fire synthetic events.
    // This is the standard technique for filling React-controlled inputs from outside
    // the framework — direct .value assignment is ignored by React's reconciler.
    console.log('[freight-booking] Setting credentials via React native input setter...');
    const fillResult = await page.evaluate(({ u, p }: { u: string; p: string }) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      if (!nativeInputValueSetter) return { error: 'nativeInputValueSetter not found' };

      const emailEl = document.querySelectorAll('#signInFormUsername')[0] as HTMLInputElement | undefined;
      const pwdEl = document.querySelectorAll('#signInFormPassword')[0] as HTMLInputElement | undefined;

      if (!emailEl) return { error: 'email field not found' };
      if (!pwdEl) return { error: 'password field not found' };

      nativeInputValueSetter.call(emailEl, u);
      emailEl.dispatchEvent(new Event('input', { bubbles: true }));
      emailEl.dispatchEvent(new Event('change', { bubbles: true }));

      nativeInputValueSetter.call(pwdEl, p);
      pwdEl.dispatchEvent(new Event('input', { bubbles: true }));
      pwdEl.dispatchEvent(new Event('change', { bubbles: true }));

      return {
        emailValue: emailEl.value,
        pwdLength: pwdEl.value.length,
      };
    }, { u: email, p: password });

    console.log(`[freight-booking] Fill result: ${JSON.stringify(fillResult)}`);

    // Submit via JS click
    await page.evaluate(() => {
      const btn =
        (document.querySelector('input[name="signInSubmitButton"]') as HTMLElement) ??
        (document.querySelector('button[type="submit"]') as HTMLElement);
      btn?.click();
    });

    // Wait for redirect back to ship.shipboss.io
    await page.waitForURL(`${SHIPBOSS_BASE}/**`, { timeout: LOGIN_TIMEOUT_MS });

    // Wait for the SPA to fully process the OAuth code and set session cookies.
    // The redirect lands on /login?code=... and the app then navigates to the dashboard.
    await page.waitForLoadState('networkidle', { timeout: LOGIN_TIMEOUT_MS });

    const finalUrl = page.url();
    console.log(`[freight-booking] Post-login URL: ${finalUrl}`);

    // Verify we're not still on the login page
    if (finalUrl.includes('/login')) {
      // The app may still be processing — wait for navigation away from login
      try {
        await page.waitForURL(
          (url) => !url.pathname.startsWith('/login'),
          { timeout: 15_000 }
        );
        await page.waitForLoadState('networkidle', { timeout: 15_000 });
        console.log(`[freight-booking] Navigated to: ${page.url()}`);
      } catch {
        console.log('[freight-booking] Still on login page after wait, proceeding anyway...');
      }
    }

    console.log('[freight-booking] Login complete, session ready.');
    return page;
  } catch (err) {
    // Close the browser immediately so Browserless.io frees the session slot.
    // Without this, a failed login leaves a zombie session that blocks the next attempt.
    try { await browser.close(); } catch { /* ignore close errors */ }
    throw err;
  }
}

/**
 * Make an API call from within the authenticated browser context.
 * Uses the browser's own fetch so session cookies are included automatically.
 */
async function browserApi(
  page: Page,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: Record<string, unknown>
): Promise<{ status: number; data: Record<string, unknown> }> {
  const result = await page.evaluate(
    async ({
      method: m,
      url,
      body: b,
      timeoutMs,
    }: {
      method: string;
      url: string;
      body?: Record<string, unknown>;
      timeoutMs: number;
    }): Promise<BrowserApiResult> => {
      try {
        // Read XSRF token from cookie
        const xsrf = document.cookie
          .split('; ')
          .find((c) => c.startsWith('XSRF-TOKEN='))
          ?.split('=')[1];
        const xsrfDecoded = xsrf ? decodeURIComponent(xsrf) : '';

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(url, {
          method: m,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...(xsrfDecoded ? { 'X-XSRF-TOKEN': xsrfDecoded } : {}),
          },
          credentials: 'include',
          body: b ? JSON.stringify(b) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timer);
        const text = await res.text();

        let data: Record<string, unknown>;
        try {
          data = JSON.parse(text) as Record<string, unknown>;
        } catch {
          data = { _raw: text.slice(0, 500) };
        }

        return { status: res.status, data };
      } catch (err) {
        return {
          status: 0,
          data: {},
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    { method, url: `${SHIPBOSS_BASE}${path}`, body, timeoutMs: API_TIMEOUT_MS }
  );

  if (result.error) {
    throw new Error(`ShipBoss API call failed: ${result.error}`);
  }

  if (
    typeof result.data._raw === 'string' &&
    (result.data._raw.includes('<!DOCTYPE') || result.data._raw.includes('<html'))
  ) {
    throw new Error(
      `ShipBoss returned HTML instead of JSON (HTTP ${result.status}). Session may have expired.`
    );
  }

  return { status: result.status, data: result.data };
}

/**
 * Book an LTL freight shipment through the ShipBoss web interface.
 *
 * Uses Playwright to authenticate, then calls the internal session-based
 * API from within the browser context to create a shipment, set
 * addresses/packages, and submit.
 */
export async function bookLtlFreight(
  input: FreightBookingInput
): Promise<FreightBookingResult> {
  let page: Page | null = null;

  try {
    page = await getAuthenticatedPage();
  } catch (error) {
    console.error('[freight-booking] Login failed:', error);
    return {
      success: false,
      error: `ShipBoss login failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }

  try {
    // Log full input so we can verify addresses and package data are correct
    console.log('[freight-booking] Input data:', JSON.stringify({
      from: input.fromAddress,
      to: input.toAddress,
      packages: input.packages,
      pickupDate: input.pickupDate,
    }, null, 2));

    // Step 1: Navigate to the New Shipment page — ShipBoss auto-initializes a
    // fresh draft when /ship loads. Then GET /api/shipment to retrieve its ID.
    console.log('[freight-booking] Navigating to new shipment page to initialize fresh draft...');
    await page.goto(`${SHIPBOSS_BASE}/ship`, { waitUntil: 'networkidle', timeout: 30_000 });
    console.log('[freight-booking] New shipment page loaded, fetching draft ID...');
    const draftResp = await browserApi(page, 'GET', '/api/shipment');
    console.log('[freight-booking] Draft shipment raw response:', JSON.stringify(draftResp.data).slice(0, 500));

    // Extract shipment ID — handle both flat and nested response shapes
    const topLevel = draftResp.data.id as string | undefined;
    const nested = (draftResp.data.data as Record<string, unknown> | undefined)?.id as string | undefined;
    const sid = topLevel ?? nested;

    if (!sid) {
      throw new Error(
        `Failed to create draft shipment: no shipment ID returned. Response: ${JSON.stringify(draftResp.data).slice(0, 300)}`
      );
    }

    console.log(`[freight-booking] Draft shipment created: ${sid}`);

    // The /ship page always returns the most recent draft for the session.
    // If that draft was previously submitted it is in a terminal state —
    // even a reset call won't let ShipBoss accept new address assignments on it.
    // Delete it so that the next /ship navigation creates a genuinely fresh draft.
    console.log(`[freight-booking] Deleting stale draft ${sid}...`);
    const deleteResp = await browserApi(page, 'DELETE', `/api/shipment/${sid}`);
    console.log('[freight-booking] Delete response:', JSON.stringify(deleteResp.data).slice(0, 300));

    // Navigate to /ship again — now that the old draft is gone ShipBoss will
    // auto-initialize a new one when the page loads.
    console.log('[freight-booking] Re-navigating to /ship to get fresh draft...');
    await page.goto(`${SHIPBOSS_BASE}/ship`, { waitUntil: 'networkidle', timeout: 30_000 });
    const freshDraftResp = await browserApi(page, 'GET', '/api/shipment');
    console.log('[freight-booking] Fresh draft raw response:', JSON.stringify(freshDraftResp.data).slice(0, 500));

    const freshTopLevel = freshDraftResp.data.id as string | undefined;
    const freshNested = (freshDraftResp.data.data as Record<string, unknown> | undefined)?.id as string | undefined;
    const freshSid = freshTopLevel ?? freshNested;

    if (!freshSid) {
      throw new Error(
        `Failed to create fresh draft. Response: ${JSON.stringify(freshDraftResp.data).slice(0, 300)}`
      );
    }
    console.log(`[freight-booking] Fresh draft created: ${freshSid}`);

    // Step 2: Set addresses
    console.log('[freight-booking] Setting addresses...');
    const fromResp = await browserApi(page, 'POST', `/api/shipment/${freshSid}/addresses`, {
      assignment: 'from',
      name: input.fromAddress.name,
      address_1: input.fromAddress.street,
      city: input.fromAddress.city,
      state: input.fromAddress.state,
      zip: input.fromAddress.zip,
      country: input.fromAddress.country,
      phone: input.fromAddress.phone,
      email: input.fromAddress.email ?? '',
    });
    console.log('[freight-booking] From address response:', JSON.stringify(fromResp.data).slice(0, 300));

    const toResp = await browserApi(page, 'POST', `/api/shipment/${freshSid}/addresses`, {
      assignment: 'to',
      name: input.toAddress.name,
      address_1: input.toAddress.street,
      city: input.toAddress.city,
      state: input.toAddress.state,
      zip: input.toAddress.zip,
      country: input.toAddress.country,
      phone: input.toAddress.phone,
      email: input.toAddress.email ?? '',
    });
    console.log('[freight-booking] To address response:', JSON.stringify(toResp.data).slice(0, 300));

    // Step 3: Set package type to freight (PLT) and update packages
    console.log('[freight-booking] Setting packages...');
    const pkgTypeResp = await browserApi(page, 'POST', `/api/shipment/${freshSid}/update-package-type/LTL`);
    console.log('[freight-booking] Package type response:', JSON.stringify(pkgTypeResp.data).slice(0, 300));

    const pkgPayload = {
      isInternational: false,
      packages: input.packages.map((pkg) => ({
        weight: pkg.weight,
        length: pkg.length,
        width: pkg.width,
        height: pkg.height,
        quantity: pkg.quantity,
        commodity: pkg.commodity,
        freight_class: pkg.freightClass,
      })),
      weightUnit: 'lb',
    };
    console.log('[freight-booking] Packages payload:', JSON.stringify(pkgPayload));
    const pkgResp = await browserApi(page, 'POST', `/api/shipment/${freshSid}/packages`, pkgPayload);
    console.log('[freight-booking] Packages response:', JSON.stringify(pkgResp.data).slice(0, 300));

    // Step 4: Set shipment date
    console.log('[freight-booking] Setting shipment date...');
    const dateResp = await browserApi(page, 'POST', `/api/shipment/${freshSid}/update-shipment-date`, {
      shipment_date: input.pickupDate,
    });
    console.log('[freight-booking] Date response:', JSON.stringify(dateResp.data).slice(0, 300));

    // Step 5: Poll for freight rates — ShipBoss processes rates asynchronously.
    // The first response is often {"_raw":"wait for job"} and rates appear after a few seconds.
    console.log('[freight-booking] Fetching freight rates...');
    const MAX_RATE_POLLS = 8;
    const RATE_POLL_INTERVAL_MS = 4000;
    let selectedRateId: string | number | undefined;

    const extractRatesArray = (raw: Record<string, unknown>): Array<Record<string, unknown>> | null => {
      if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
      if (Array.isArray(raw.rates)) return raw.rates as Array<Record<string, unknown>>;
      if (Array.isArray((raw.data as Record<string, unknown> | undefined)?.rates))
        return (raw.data as Record<string, unknown>).rates as Array<Record<string, unknown>>;
      if (Array.isArray(raw.data)) return raw.data as Array<Record<string, unknown>>;
      return null;
    };

    for (let attempt = 0; attempt < MAX_RATE_POLLS; attempt++) {
      const ratesResp = await browserApi(
        page,
        'GET',
        `/api/shipment/${freshSid}/rates?requestId=${Date.now()}`
      );
      const raw = ratesResp.data;
      console.log(`[freight-booking] Rates attempt ${attempt + 1}:`, JSON.stringify(raw).slice(0, 300));

      // "wait for job" means ShipBoss is still computing rates — poll again
      const isWaiting =
        (typeof raw._raw === 'string' && raw._raw.includes('wait for job')) ||
        (typeof raw.status === 'string' && raw.status.includes('wait'));

      if (isWaiting) {
        console.log(`[freight-booking] Rates not ready yet, waiting ${RATE_POLL_INTERVAL_MS}ms...`);
        await new Promise((r) => setTimeout(r, RATE_POLL_INTERVAL_MS));
        continue;
      }

      const rates = extractRatesArray(raw);
      if (rates && rates.length > 0) {
        selectedRateId = (rates[0].id ?? rates[0].rate_id) as string | number | undefined;
        console.log(
          `[freight-booking] Got ${rates.length} rates. Selected rate ID: ${selectedRateId}`,
          'First rate:', JSON.stringify(rates[0]).slice(0, 200)
        );
        break;
      }

      // Non-waiting response with no rates — wait and retry once more
      console.log('[freight-booking] Rates response had no usable rates, retrying...');
      await new Promise((r) => setTimeout(r, RATE_POLL_INTERVAL_MS));
    }

    if (!selectedRateId) {
      throw new Error('No freight rates available from ShipBoss after polling. The shipment may have invalid dimensions or the carrier is unavailable.');
    }

    // Step 6: Submit the shipment with the selected rate
    console.log(`[freight-booking] Submitting shipment with rate ID: ${selectedRateId}...`);
    const submitResp = await browserApi(page, 'POST', `/api/shipment/${freshSid}/submit`, {
      requestId: Date.now().toString(),
      timezone: 'America/New_York',
      rate_id: selectedRateId,
    });

    const submitData = submitResp.data;
    console.log('[freight-booking] Submit response:', JSON.stringify(submitData).slice(0, 500));

    // Treat error responses as hard failures
    if (
      submitData.message &&
      typeof submitData.message === 'string' &&
      !submitData.id &&
      !submitData.tracking_number &&
      !(submitData.packages as Array<unknown> | undefined)?.length
    ) {
      throw new Error(`ShipBoss submit failed: ${submitData.message}`);
    }

    // Handle "wait for job" pattern — ShipBoss may process async
    if (submitData.status === 'wait for job') {
      console.log('[freight-booking] Shipment queued for processing, waiting...');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // Extract results
    const packages = submitData.packages as Array<Record<string, unknown>> | undefined;
    const trackingNumber = packages?.[0]?.tracking_number as string | undefined;
    const billOfLadingUrl = (submitData.billOfLadingUrl ?? submitData.bill_of_lading_url) as string | undefined;
    const carrier = submitData.carrier as string | undefined;

    return {
      success: true,
      trackingNumber: trackingNumber ?? undefined,
      billOfLadingUrl: billOfLadingUrl ?? undefined,
      carrier: carrier ?? undefined,
      shipmentId: freshSid,
    };
  } catch (error) {
    console.error('[freight-booking] Booking failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'LTL freight booking failed',
    };
  } finally {
    // Always close the browser
    try {
      await page?.context().browser()?.close();
    } catch {
      // ignore close errors
    }
  }
}

/**
 * Check if the ShipBoss web automation credentials are configured.
 */
export function isFreightBookingConfigured(): boolean {
  return !!(process.env.SHIPBOSS_WEB_EMAIL && process.env.SHIPBOSS_WEB_PASSWORD);
}
