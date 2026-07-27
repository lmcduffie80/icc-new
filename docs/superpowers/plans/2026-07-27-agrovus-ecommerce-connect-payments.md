# Agrovus E-Commerce Stripe Connect Payments — Implementation Plan (Retrospective)

> **Note:** Unlike Phase 1's plan doc, this one was written *after* Phase 2 was implemented — the work was executed directly from prompts task-by-task rather than from a written plan up front. It's captured here retrospectively, in the same bite-sized task format, so a future reader has a complete record of what was built and why without needing to dig through commit history. All checkboxes below reflect actual completed work on branch `feature/ecommerce-connect-payments` (worktree `.worktrees/ecommerce-connect-payments`), commits in order.

**Goal:** Let each tenant accept payments on their own storefront checkout — either as merchant of record on their own Stripe account (`own_stripe`) or managed by ICC for a commission (`icc_managed`) — per Phase 2 of `docs/superpowers/specs/2026-07-24-agrovus-ecommerce-multitenant-design.md`, while never breaking or changing behavior for ICC's own existing direct-charge checkout.

**Architecture:** Stripe Connect accounts are created via the newer **v2 Core Accounts API** (`stripe.v2.core.accounts.create`, `configuration.merchant`/`configuration.recipient`), but account **status** is still read via the classic **v1 `stripe.accounts.retrieve()`** and the `account.updated` webhook (both return the same flat `charges_enabled`/`payouts_enabled`/`details_submitted` shape even for v2-created accounts — there is no need to interact with the deeply-nested v2 `configuration.*.capabilities.*` shape just to answer "can this account take a charge?"). Checkout PaymentIntent creation branches three ways depending on whether a resolved tenant has a live Connect account, and if so, which `payments_mode` it's in — with the *no-tenant / no-Connect-account* path staying byte-for-byte identical to Phase 2's starting behavior (verified by dedicated regression coverage) so ICC's own checkout is provably unaffected.

**Tech Stack:** Next.js 16 App Router, TypeScript, Stripe Node SDK (`stripe.v2.core.*` for account creation/links, `stripe.accounts`/`stripe.paymentIntents`/`stripe.webhooks` v1 for everything else), raw SQL via `pg` (`lib/db.ts` `query`/`queryOne`), Vitest for tests.

---

### Task 0: Merge Phase 1 into `main`

**Why first:** Phase 2 builds directly on Phase 1's tenant-scoping work (`getRequiredTenantId`, tenant-scoped `Tenant` type, `tenant_memberships`); it needs to start from a `main` that already has all of that merged in, not a stale base.

- [x] Merge `feature/ecommerce-tenant-hardening` into `main`.
- [x] Create worktree `.worktrees/ecommerce-connect-payments` on branch `feature/ecommerce-connect-payments`, based on the freshly-updated `main`.

---

### Task 1: Add Stripe Connect columns to `tenants`

**Files:**
- Create: `migrations/094_add_stripe_connect_columns.sql`
- Modify: `lib/tenant.ts`

**Why:** Every downstream piece of Phase 2 (account creation, status checks, checkout routing) needs a place to persist and read a tenant's Connect account id, payments mode, and cached status flags.

- [x] **Step 1:** Write migration `094_add_stripe_connect_columns.sql` adding `payments_mode TEXT NOT NULL DEFAULT 'own_stripe'` (CHECK constrained to `'own_stripe' | 'icc_managed'`), `stripe_connect_account_id TEXT` (unique partial index, `WHERE ... IS NOT NULL`), `commission_bps INTEGER NOT NULL DEFAULT 0`, `stripe_connect_charges_enabled/payouts_enabled/details_submitted BOOLEAN NOT NULL DEFAULT false` to `tenants`. Deliberately a separate table/concern from `stripe_customer_id`/`stripe_subscription_id` (migration 083), which are for the Agrovus *SaaS subscription* billing, not the tenant's own commerce payments.
- [x] **Step 2:** Apply the migration.
- [x] **Step 3:** Add all six columns to the `Tenant` interface and `DbTenant` interface in `lib/tenant.ts`, extend `TENANT_SELECT`'s SQL and `mapTenant()`'s row mapping to include them.
- [x] **Step 4:** Commit — `db: add stripe_connect payment columns to tenants`.

---

### Task 2: Spike the Stripe v2 Core Accounts API

**Why:** Confirm the exact shape of `stripe.v2.core.accounts.create`/`stripe.v2.core.accountLinks.create` works against this Stripe account before writing production code against it — v2 Connect APIs are newer and less commonly documented than v1's `stripe.accounts.create`.

- [x] **Step 1:** Spike-test `stripe.v2.core.accounts.create` with both a `recipient`-only configuration (for `icc_managed`) and a `merchant` + `recipient` configuration (for `own_stripe`), confirming `dashboard: 'express'` vs `dashboard: 'full'` and `defaults.responsibilities.fees_collector`/`losses_collector` behave as expected for each mode.
- [x] **Step 2:** Spike-test `stripe.v2.core.accountLinks.create` with `use_case.type: 'account_onboarding'` to confirm it returns a working hosted onboarding URL for a v2-created account.
- [x] **Step 3:** Confirm v1 `stripe.accounts.retrieve()` still works against a v2-created account and returns the expected flat `charges_enabled`/`payouts_enabled`/`details_submitted` booleans — this became the basis for the "use v1 for status, v2 for creation" design decision baked into Task 4/6.
- [x] **Step 4:** Discard spike code (not committed as production code — findings folded directly into `lib/stripe-connect.ts` in Task 4).

---

### Task 3: Add `requireTenantAdmin` authorization helper

**Files:**
- Create: `lib/tenant-auth.ts`
- Create: `__tests__/lib/tenant-auth.test.ts`

**Why:** The onboarding/status endpoints in Tasks 5–6 need an authorization model distinct from both (a) `lib/admin-auth.ts`'s `requireAdmin`, which gates ICC's own global staff console with no notion of tenants, and (b) a bare authenticated session, which doesn't prove the caller is allowed to manage *this tenant's* payment setup.

- [x] **Step 1:** Write `TenantAdminContext` (`userId`, `userEmail`, `tenantId`) and `TenantAdminAuthError` (carries a `401 | 403 | 400` status) types.
- [x] **Step 2:** Write `requireTenantAdmin(request)`: resolves the session via `auth.api.getSession`, resolves the tenant via `getRequiredTenantId` (from Phase 1), then checks `tenant_memberships` for a row with `user_id` + `tenant_id` and `role = 'tenant_admin'`. Throws `TenantAdminAuthError` with 401 (no session), 400 (`MissingTenantError` from `getRequiredTenantId`), or 403 (no membership row, or membership role isn't `tenant_admin`).
- [x] **Step 3:** Write `tenantAdminAuthErrorResponse(err)`: converts a caught `TenantAdminAuthError` into a `NextResponse`, or returns `null` so the caller re-throws anything else — establishing the `try { ... } catch (err) { const res = tenantAdminAuthErrorResponse(err); if (res) return res; throw err; }` pattern reused by every tenant-admin route in this phase.
- [x] **Step 4:** Write unit tests covering all four outcomes (success, 401, 400, 403).
- [x] **Step 5:** Commit — `feat: add requireTenantAdmin authorization helper`.

---

### Task 4: Add `lib/stripe-connect.ts` account/onboarding/status helpers

**Files:**
- Create: `lib/stripe-connect.ts`
- Create: `__tests__/lib/stripe-connect.test.ts`

- [x] **Step 1:** Write `getOrCreateConnectAccountForTenant(tenant, contactEmail)`: returns the tenant's existing `stripeConnectAccountId` if set; otherwise creates a v2 Core Account with a configuration that branches on `tenant.paymentsMode`:
  - `icc_managed` → `dashboard: 'express'`, `configuration.recipient` only, `defaults.responsibilities = { fees_collector: 'application', losses_collector: 'application' }` (ICC/the application absorbs fees and losses).
  - `own_stripe` → `dashboard: 'full'`, `configuration.merchant` + `configuration.recipient`, `defaults.responsibilities = { fees_collector: 'stripe', losses_collector: 'stripe' }` (the tenant is merchant of record; Stripe collects directly from them).

  `identity.country` is hardcoded to `'us'` for this phase (documented deferred item — see design doc). Persists the new account id to `tenants.stripe_connect_account_id` immediately after creation.
- [x] **Step 2:** Write `createConnectOnboardingLink(accountId, paymentsMode, returnUrl, refreshUrl)`: creates a v2 Account Link with `use_case.account_onboarding.configurations` set to `['recipient']` for `icc_managed` or `['merchant', 'recipient']` for `own_stripe` — mirrors the configuration set from Step 1 so onboarding actually walks the account through everything it was created needing.
- [x] **Step 3:** Write `mapStripeAccountToStatusSnapshot(account)`: pure mapping from the flat v1 `charges_enabled`/`payouts_enabled`/`details_submitted` fields to a camelCase `ConnectAccountStatusSnapshot`, shared by both the live-status route (Task 6) and the webhook handler (Task 7) so the mapping logic exists in exactly one place.
- [x] **Step 4:** Write `getConnectAccountStatusSnapshot(accountId)`: calls v1 `stripe.accounts.retrieve(accountId)` and passes the result through `mapStripeAccountToStatusSnapshot` — deliberately v1, not the deeply-nested v2 shape, per Task 2's spike findings.
- [x] **Step 5:** Write `calculateApplicationFeeCents(amountCents, commissionBps)`: computes `round(amountCents * commissionBps / 10000)`, clamped to `[0, amountCents - 1]` since Stripe rejects an `application_fee_amount` that is `>=` the charge amount.
- [x] **Step 6:** Write unit tests for all five functions, including the `icc_managed` vs `own_stripe` configuration branch and fee-clamping edge cases.
- [x] **Step 7:** Commit — `feat: add lib/stripe-connect.ts helpers for account creation, onboarding links, and status`.

---

### Task 5: Add `POST /api/tenant-admin/connect/onboard`

**Files:**
- Create: `app/api/tenant-admin/connect/onboard/route.ts`
- Create: `__tests__/api/tenant-admin/connect/onboard.test.ts`

- [x] **Step 1:** Authorize via `requireTenantAdmin`/`tenantAdminAuthErrorResponse` (Task 3).
- [x] **Step 2:** Look up the tenant via `getTenantById(admin.tenantId)`; 404 if missing.
- [x] **Step 3:** Build `returnUrl`/`refreshUrl` pointing at `/{tenant.slug}/account/payments-setup?onboarding=complete` / `?onboarding=refresh`, derived from the request's own origin (works correctly in every environment without a hardcoded base URL).
- [x] **Step 4:** Call `getOrCreateConnectAccountForTenant` then `createConnectOnboardingLink`; return `{ url }`. On any Stripe error, return 502 with a generic message (never leak raw Stripe errors to the tenant admin).
- [x] **Step 5:** Write tests covering: unauthenticated (401), non-tenant-admin (403), missing tenant context (400), tenant not found (404), success (200 + url), Stripe error (502).
- [x] **Step 6:** Commit — `feat: add POST /api/tenant-admin/connect/onboard route`.

---

### Task 6: Add `GET /api/tenant-admin/connect/status`

**Files:**
- Create: `app/api/tenant-admin/connect/status/route.ts`
- Create: `__tests__/api/tenant-admin/connect/status.test.ts`

**Why a live check instead of trusting the DB cache:** a tenant admin who just finished Stripe's hosted onboarding and gets redirected back to `/account/payments-setup` needs to see fresh status immediately — the `account.updated` webhook (Task 7) may not have landed yet by the time they land on the page.

- [x] **Step 1:** Authorize via `requireTenantAdmin`; look up tenant; 404 if missing.
- [x] **Step 2:** If `tenant.stripeConnectAccountId` is null, return `{ hasConnectAccount: false, needsOnboarding: true, ... }` immediately (no Stripe call needed — there's nothing to check yet).
- [x] **Step 3:** Otherwise call `getConnectAccountStatusSnapshot` (live v1 Stripe check) and opportunistically write the fresh values back to the DB cache (`stripe_connect_charges_enabled`/`payouts_enabled`/`details_submitted`) on success.
- [x] **Step 4:** On a Stripe error (e.g. transient API outage), fall back to serving the last-known DB-cached values rather than failing the whole page — a tenant admin should still be able to see "yes, you're set up" even if a live re-check briefly fails.
- [x] **Step 5:** Write tests covering: unauthenticated, forbidden, no account yet, live-check success (+ DB write-back), live-check failure (+ stale-cache fallback).
- [x] **Step 6:** Commit — `feat: add GET /api/tenant-admin/connect/status route`.

---

### Task 7: Add `POST /api/webhooks/stripe-connect`

**Files:**
- Create: `app/api/webhooks/stripe-connect/route.ts`
- Create: `__tests__/api/webhooks/stripe-connect.test.ts`
- Modify: `lib/env-validation.ts`

**Why a dedicated webhook route/secret instead of reusing `/api/webhooks/stripe`:** Connect account events are a materially different trust boundary from the existing subscription-billing webhook (`/api/webhooks/stripe-billing`, its own existing precedent for a dedicated secret) — verifying them against a shared secret would mean a leaked Connect webhook secret could also forge subscription-billing events, and vice versa.

- [x] **Step 1:** Add `STRIPE_CONNECT_WEBHOOK_SECRET: z.string().min(1)` to `lib/env-validation.ts`'s schema, alongside the existing `STRIPE_WEBHOOK_SECRET`. Confirmed this schema isn't wired into any actual runtime boot path today (checked all call sites — only `lib/admin-middleware.ts` and `app/api/admin/auth/login/route.ts` reference it), so adding a new required field here cannot crash production; but the var still needs to actually be set in Vercel and the webhook endpoint registered in the Stripe Dashboard before this feature can work in production.
- [x] **Step 2:** Verify the raw request body against `STRIPE_CONNECT_WEBHOOK_SECRET` directly with `stripe.webhooks.constructEvent` (not the shared `lib/stripe.ts#verifyWebhookSignature` helper, which is hardcoded to `STRIPE_WEBHOOK_SECRET`).
- [x] **Step 3:** Idempotency: check/record processed event ids in `stripe_webhook_events` (the same table/pattern already used by the billing webhook), keyed on Stripe's event id — a duplicate delivery short-circuits to `{ received: true, duplicate: true }` without reprocessing.
- [x] **Step 4:** Handle `account.updated`: look up the tenant by `stripe_connect_account_id`; if none matches (e.g. a stray/test account), log a warning and still mark the event processed (not an error condition — nothing to retry). Otherwise map the flat v1-shaped payload through `mapStripeAccountToStatusSnapshot` (Task 4) and write the three status booleans to the tenant's row.
- [x] **Step 5:** Any other event type is logged as an unhandled type (low severity) and still marked processed.
- [x] **Step 6:** On a processing exception, mark the event `failed` in `stripe_webhook_events` but still return HTTP 200 (`{ received: true, error: 'Processing failed but acknowledged' }`) so Stripe doesn't retry-storm a bug in our handler; reserve a `500` response for signature/infrastructure failures where a Stripe retry is actually useful.
- [x] **Step 7:** Write tests covering: missing signature, missing secret, invalid signature, duplicate event, `account.updated` for a known tenant, `account.updated` for an unknown account, unhandled event type, and a processing exception still returning 200.
- [x] **Step 8:** Commit — `feat: add POST /api/webhooks/stripe-connect route`.

---

### Task 8: Route checkout PaymentIntents through Connect

**Files:**
- Modify: `app/api/payment/create-intent/route.ts`
- Modify: `lib/stripe.ts` (`createPaymentIntent`'s `options.connect`)
- Modify: `app/[tenant]/(main)/checkout/page.tsx` (pass `tenant_id`)
- Modify: `__tests__/api/payment/create-intent.test.ts`, `__tests__/lib/stripe.test.ts`

**Why this is the highest-stakes task in the phase:** a bug here either sends a tenant's customer's money to the wrong Stripe account, charges the wrong commission, or accidentally breaks ICC's own checkout (which must go through this exact same route unmodified). The design deliberately optimizes for "impossible to silently misroute money" over "convenient":

- [x] **Step 1:** In `create-intent`, resolve the tenant via an *optional* `?tenant_id=` query param (not `getRequiredTenantId`/`MissingTenantError` — a missing tenant is expected and valid here, e.g. ICC's own checkout has no tenant param at all). A tenant id that fails to resolve to a real tenant logs a warning and falls back to the direct-charge path rather than failing the request — a stale/bad client-side id shouldn't be able to break checkout.
- [x] **Step 2: Hard-block on incomplete onboarding, rather than silently falling back.** If a tenant *has* a `stripeConnectAccountId` but `stripeConnectChargesEnabled` is still `false`, checkout returns 503 ("This store's payment processing isn't fully set up yet") instead of silently falling back to a direct charge. A silent fallback would have put the customer's money in ICC's own Stripe balance with no automated path to route it to the tenant afterward — a hard block is recoverable (tenant finishes onboarding, checkout starts working); a silent misroute is not.
- [x] **Step 3:** When a tenant *can* route to Connect (`stripeConnectAccountId` set AND `stripeConnectChargesEnabled` true), compute `connectOptions` once, threading the exact same `amountCents` value used elsewhere in the handler (never let two different code paths independently round the same dollar amount to cents):
  - `own_stripe` → `{ destinationAccountId, onBehalfOf: destinationAccountId }` (the tenant is merchant of record for the charge itself, so `on_behalf_of` applies their statement descriptor/MCC to the *charge*, not just the payout).
  - `icc_managed` → `{ destinationAccountId, applicationFeeAmountCents: calculateApplicationFeeCents(amountCents, tenant.commissionBps) }` (ICC stays merchant of record; commission is deducted automatically at charge time via `application_fee_amount`).
- [x] **Step 4:** Extend `createPaymentIntent`'s `options` with an optional `connect` object; when present, add `transfer_data: { destination }`, optionally `on_behalf_of`, and optionally `application_fee_amount` (only included when `> 0`) to the underlying `stripe.paymentIntents.create` call. When `connect` is omitted entirely, the call is byte-for-byte identical to pre-Phase-2 behavior.
- [x] **Step 5:** Stamp `tenantId` into the PaymentIntent's `metadata` when a tenant is present, for later reconciliation.
- [x] **Step 6:** Update the checkout page's client-side fetch to pass `?tenant_id=${tenant.id}` (and add `tenant.id` to the relevant `useCallback` dependency array).
- [x] **Step 7:** Extend tests to cover: no tenant param (existing direct-charge behavior unchanged), tenant with no Connect account (direct-charge), tenant with incomplete onboarding (503 block), `own_stripe` tenant (destination + `on_behalf_of`), `icc_managed` tenant (destination + `application_fee_amount`, correct bps math), and a bad/unresolvable `tenant_id` (falls back to direct-charge, does not 500).
- [x] **Step 8:** Commit — `feat: route checkout payments through tenant Connect accounts, preserve direct-charge fallback`.

---

### Task 9: Cross-tenant money-safety regression suite

**Files:**
- Create: `__tests__/regression/connect-cross-tenant-safety.test.ts`

**Why a dedicated suite on top of Task 5/6/8's per-route unit tests:** those prove each route is correct in isolation; this suite specifically proves tenant data can't bleed across *sequential* requests sharing the same Node process/module state (the exact failure mode a hardcoded, closed-over, or accidentally-cached value would produce, which per-route tests calling a handler only once wouldn't catch).

- [x] **Step 1:** For each of `create-intent`, `connect/onboard`, and `connect/status`, call the same route handler function **twice in a row** with two different tenants (different `stripeConnectAccountId`, `paymentsMode`, `commissionBps`) and assert each call's captured downstream Stripe-call args are scoped to that call's own tenant only — e.g. tenant A's call never receives tenant B's `applicationFeeAmountCents` or `destinationAccountId`.
- [x] **Step 2:** Keep `calculateApplicationFeeCents` real (partial-mock `lib/stripe-connect`, not a full mock) so the suite exercises actual bps math instead of a stubbed-out constant — a shared/hardcoded fee value is exactly the kind of bug this file exists to catch.
- [x] **Step 3:** Run the full suite to confirm no leakage across any of the three routes.
- [x] **Step 4:** Commit — `test: add cross-tenant money-safety regression suite for Connect payments`.

---

### Task 10: Tenant-admin payments setup page

**Files:**
- Create: `app/[tenant]/(main)/account/payments-setup/page.tsx`
- Modify: `lib/account-navigation.ts` (add a "Payment Setup" entry, `Landmark` icon)

- [x] **Step 1:** Client component (`useTenant()` for `tenant.id`) that on mount calls `GET /api/tenant-admin/connect/status?tenant_id=...` and renders one of three states: loading, error, or status.
- [x] **Step 2:** When `needsOnboarding` is true, show a call-to-action button ("Start payment setup" / "Continue payment setup" depending on `hasConnectAccount`) that calls `POST /api/tenant-admin/connect/onboard` and redirects the browser to the returned Stripe-hosted URL.
- [x] **Step 3:** When onboarding is complete, show a status card: payments mode (human-readable label for `own_stripe`/`icc_managed`), and three status pills (accepting payments / payouts enabled / details submitted), plus an "Update payment details" button that re-runs the same onboarding-link flow (Stripe Account Links support resuming/updating an already-onboarded account).
- [x] **Step 4:** Handle the `?onboarding=complete` / `?onboarding=refresh` return-URL query params from Task 5 with transient banners ("verifying your status..." / "session expired, please try again") — the live status fetch above is always the actual source of truth, these banners are just a friendlier interstitial while that fetch resolves.
- [x] **Step 5:** Add a "Payment Setup" entry to `lib/account-navigation.ts` (new `Landmark` icon import from `lucide-react`) so tenant admins can reach the page from the account hub.
- [x] **Step 6:** Commit — `feat: add tenant-admin payments setup page`.

---

## Key design decisions

1. **Accounts v2 API for creation, v1 for status.** `stripe.v2.core.accounts.create`/`accountLinks.create` for account creation and onboarding (the modern, actively-developed Connect surface), but `stripe.accounts.retrieve()` and the classic `account.updated` webhook for status — both return the same simple flat booleans regardless of which API created the account, and there's no product need to touch the deeply-nested v2 `configuration.*.capabilities.*` shape just to answer "can this account take a charge yet?"
2. **One onboarding code path, two configurations.** `getOrCreateConnectAccountForTenant`/`createConnectOnboardingLink` are single functions that branch internally on `tenant.paymentsMode`, rather than two parallel implementations — keeps the v2-configuration-vs-v1-status precedent, the DB write-back, and the error handling in one place per concern.
3. **Express dashboard for `icc_managed`, full dashboard for `own_stripe`.** Managed tenants get the lighter-weight, cobranded Express onboarding (ICC is effectively operating payments on their behalf); self-serve tenants get the full Stripe dashboard since they are fully merchant of record.
4. **Destination charges throughout, differing only in `on_behalf_of` vs `application_fee_amount`.** Both modes use `transfer_data.destination` (a destination charge). `own_stripe` additionally sets `on_behalf_of` so the *charge* itself (statement descriptor, MCC, liability) belongs to the tenant, consistent with them being merchant of record. `icc_managed` additionally sets `application_fee_amount` so ICC's commission is deducted automatically at charge time with no follow-up invoicing step.
5. **Hard-block checkout on incomplete onboarding, never silently fall back.** A tenant with a Connect account id but `charges_enabled: false` gets a 503 at checkout, not a silent direct charge. A direct charge in that state would put the customer's money in ICC's own Stripe balance with no automated way to route it to the tenant afterward — recoverable friction (block + prompt to finish onboarding) beats an unrecoverable money-routing mistake.
6. **A dedicated `STRIPE_CONNECT_WEBHOOK_SECRET`, not the shared billing secret.** Connect account events are a different trust boundary from subscription-billing events; a compromised secret for one should not also forge events for the other.
7. **Live Stripe status check on every `GET /api/tenant-admin/connect/status` call, with DB-cache fallback only on error.** A tenant admin who just finished hosted onboarding needs to see fresh status the moment they're redirected back, without waiting on webhook delivery latency. The DB cache exists purely as a resilience fallback for when the live check itself fails, and is opportunistically refreshed by both the status route and the webhook.
8. **A dedicated cross-tenant money-safety regression suite, separate from per-route unit tests.** Per-route tests prove each handler is correct for a single call; the regression suite (Task 9) specifically proves no tenant-scoped value (account id, commission bps, fee amount) can leak across sequential calls sharing Node process/module state — the class of bug a single-call unit test structurally cannot catch.
9. **Hardcoded to `us`/`usd` for this phase, on purpose, and documented as a known gap** rather than half-building partial multi-country/multi-currency support that hasn't been verified against Stripe's actual behavior for non-US accounts.

---

## What's still open after this plan

- **Checkout currency hardcoded to `usd`** — `tenant.currency` exists on the `Tenant` type but isn't threaded into `createPaymentIntent`'s currency for tenant checkouts yet.
- **No Canada Connect account support** — `identity.country` is hardcoded to `'us'`; CA accounts (`tenant.country` can already be `'US'|'CA'`) are unverified.
- **No self-serve tenant sign-up flow** — this phase only builds payments plumbing for tenants that already exist in `tenants`; there's still no UI for a new tenant to register itself (Phase 6 in the design doc).
- **Logistics/shipping-carrier-per-tenant** — a separate axis from payments (`logistics_mode` in the design doc), not touched here; still Phase 4.
- **Custom-domain routing** — unrelated to payments, still Phase 3.
- Production go-live for this feature additionally requires: setting `STRIPE_CONNECT_WEBHOOK_SECRET` in Vercel, and registering the `/api/webhooks/stripe-connect` endpoint (for the `account.updated` event) in the Stripe Dashboard. Neither is done as part of this branch — see Task 7.
