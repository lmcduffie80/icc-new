# Agrovus E-Commerce Multi-Tenant Platform — Design

**Status:** Phase 1 (tenant scoping hardening) complete as of 2026-07-25. Phase 2 (Stripe Connect payments) complete as of 2026-07-27. Phases 3–7 (domains, logistics, pricing, onboarding, pilot) not yet started — see "Phased Rollout" below.

## Context

`icc-new` (this repo) already contains a partially-built multi-tenant SaaS layer, seeded under the "Agrovus" name:

- `tenants` / `tenant_memberships` / `plans` tables (`migrations/083_create_tenants.sql`, `084_add_tenant_id.sql`, `086_create_plans.sql`). ICC is `tenant_icc_default`, plan = enterprise.
- Path-based tenant resolution in `middleware.ts` (`/{slug}/...`), with subscription-status gating.
- Tenant-level Stripe subscription billing in `lib/billing.ts` (Checkout Sessions, Billing Portal, webhook sync via `/api/webhooks/stripe-billing`) — this is "Agrovus bills the tenant for the software," fully working.
- A full commerce stack (catalog, cart, Payment-Intent checkout, orders, ShipBoss freight, supplier portal, inventory/FIFO) that runs today for ICC only, with `tenant_id` partially threaded through non-ICC tables via migration 084.
- `features/README.md` already frames the codebase as "Agrovus Feature Modules."

This document is the design for finishing that work into a real multi-tenant e-commerce product that external Agrovus customers can subscribe to and run their own storefront on.

## Goals

1. Multiple external entities can run an independent online storefront (catalog, cart, checkout, orders, customer accounts) on this codebase, fully data-isolated from each other and from ICC.
2. A tenant can either:
   - **Self-manage**: connect their own Stripe account and their own shipping/carrier accounts, or
   - **Be managed by Innovative CropCare**: ICC operates payments and/or logistics on their behalf for a fee.
3. A tenant can point their own domain (e.g. `shop.acmefarm.com`) at their storefront instead of using a shared path-based URL.
4. A defensible monthly subscription pricing model, reusing the existing `plans`/`tenants` billing infrastructure.

## Non-goals (for v1)

- Multi-seller marketplace within a single tenant's storefront (one tenant = one selling entity's storefront, like today's ICC shop — not an Amazon-style marketplace of many sellers under one storefront).
- Full data-residency/DB-per-tenant isolation — staying on the existing shared-Neon-DB-with-`tenant_id` model, consistent with Agrovus-erp's `subsidiaryId` pattern.

## Architecture

### 1. Tenant model (extends existing `tenants` table)

Add columns:

```sql
ALTER TABLE tenants
  ADD COLUMN payments_mode TEXT NOT NULL DEFAULT 'own_stripe', -- 'own_stripe' | 'icc_managed'
  ADD COLUMN stripe_connect_account_id TEXT,                   -- Connect account for THIS tenant's commerce (distinct from stripe_customer_id, which is for the SaaS subscription)
  ADD COLUMN commission_bps INTEGER DEFAULT 0,                 -- e.g. 150 = 1.5%, only nonzero when payments_mode = 'icc_managed'
  ADD COLUMN logistics_mode TEXT NOT NULL DEFAULT 'own_carrier', -- 'own_carrier' | 'icc_managed'
  ADD COLUMN custom_domain TEXT UNIQUE,
  ADD COLUMN custom_domain_status TEXT DEFAULT 'unverified'; -- 'unverified' | 'pending' | 'verified' | 'failed'
```

Two independent axes (`payments_mode`, `logistics_mode`) because a tenant may want their own Stripe but our logistics, or vice versa — don't collapse this into one "managed" boolean.

### 2. Payments — Stripe Connect

Two flows depending on `payments_mode`:

- **`own_stripe`** — Connect **Standard** account. Tenant completes Stripe's own onboarding/dashboard. We never touch their funds; they are merchant of record for KYC, disputes, chargebacks, tax. We charge only our flat SaaS fee.
- **`icc_managed`** — Connect **Express** account (`dashboard: "express"`), configured with `recipient` capability at minimum; use **destination charges** with `application_fee_amount` on the PaymentIntent so our commission (`commission_bps`) is deducted automatically at time of sale — no manual invoicing, no Stripe Billing Meters needed for this part. ICC/Agrovus is the platform account; the connected account receives `transfer_data[destination]`.

Reference (Stripe Connect, 2026 guidance — re-verify against `docs.stripe.com/connect` before implementing, APIs shift):
- Use Accounts v2 API with `configuration.recipient` (+ `configuration.merchant` only if the connected account needs to be merchant of record for direct charges — not our default case).
- Do NOT default to `on_behalf_of` for the standard marketplace-style flow; that's for indirect-charge edge cases.
- Idempotent webhook handling keyed on Stripe event ID (already the pattern in `stripe_webhook_events` — reuse it for Connect webhooks too).

This is entirely separate from the existing `lib/billing.ts` tenant subscription billing, which stays as-is (that's "Agrovus bills the tenant for software," not "customer pays for a product").

### 3. Custom domains

- Tenant submits a domain in settings → we call the Vercel Domains API to add it to the project, return the required DNS records (typically a CNAME to Vercel's edge) for the tenant to add at their registrar.
- Poll/verify via Vercel's domain verification endpoint; update `custom_domain_status`.
- `middleware.ts` changes: resolve tenant by `request.headers.get('host')` against `custom_domain` **first**; fall back to today's first-path-segment slug resolution for the shared `*.vercel.app` / `agrovus.app` host. Keep the existing `/api/internal/tenant/[slug]` lookup pattern, add a `/api/internal/tenant/by-domain/[host]` variant (or extend the existing route to accept either).
- Re-read Vercel's current multi-tenant custom-domains guide before implementing — Vercel's domain/project APIs change over releases.

### 4. Logistics isolation

- New `tenant_carrier_credentials` table (encrypted secret storage, same pattern as other secret-at-rest fields in this repo) keyed by `tenant_id`, holding ShipBoss (or future carrier) bearer tokens.
- `logistics_mode = 'own_carrier'` → use the tenant's row.
- `logistics_mode = 'icc_managed'` → fall back to the existing global `SHIPPING_ICC` credential, with a markup applied when calculating rates shown to the tenant's customers (or a flat monthly logistics-management add-on, TBD with pricing decision).
- Update `lib/freight-quote.ts` and `lib/shipboss-freight-booking.ts` to select credentials by tenant instead of assuming the global token.

### 5. Tenant scoping hardening (prerequisite, do first)

Before onboarding any *external* tenant:
- Audit every commerce table for `tenant_id` presence and enforcement (migration 084 added the column to most tables — verify every read/write path filters on it; today's ICC-only usage means gaps are invisible).
- `Product` is currently a **global**, unscoped catalog (globally unique SKU) — decide: either scope it per-tenant, or keep a shared catalog concept but make catalog *visibility/pricing* tenant-scoped (needs explicit decision, affects data model).
- Retire the legacy unscoped `app/(main)/...` route tree (duplicate of `app/[tenant]/...`) — having both live is a scoping bypass risk once other tenants' data is in the same DB.

### 6. Pricing / plan tiers

Extend `plans.features` JSON (no schema change needed beyond what's already there) with new commerce flags: `ecommerce_enabled`, `max_skus`, `logistics_included`. Add new plan rows for the commerce-specific tiers. Commission (`commission_bps`) lives on `tenants`, not `plans`, since it can be negotiated per-tenant even within a plan tier.

**Pricing ladder — mirrors Agrovus ERP's existing Starter/Growth/Scale price points exactly** (`Agrovus-marketing/app/pricing/page.tsx`), so the sales story is "add Commerce at the same tier price as your ERP plan":

| Tier | Monthly | Annual | `payments_mode` | `logistics_mode` | Notes |
|---|---|---|---|---|---|
| Commerce Starter | $499 | $399 | `own_stripe` (Connect Standard, $0 platform cut) | `own_carrier` | Matches ERP Starter. Storefront, catalog (≤250 SKUs), cart/checkout, 1 custom domain. |
| Commerce Growth | $1,199 | $959 | `own_stripe` | `icc_managed` (ShipBoss + markup) | Matches ERP Growth. Unlimited SKUs, supplier portal, acre-pack. |
| Commerce Managed | $2,499 | $1,999 | `icc_managed` (Connect Express, ICC = MoR) + **1.5% GMV** via `application_fee_amount` | `icc_managed` | Matches ERP Scale. "White-glove" — commission funds the payment/logistics risk we absorb. |
| Enterprise | Custom | Custom | Either | Either | Negotiated GMV %, multi-brand/multi-domain, SLA. |

The 1.5% GMV commission is intentionally kept on the top tier only — that's the tier where Agrovus/ICC is actually merchant of record and bears real operational/financial risk. The two self-serve tiers are flat because we never touch the tenant's funds there.

### 7. Onboarding

New tenant signup flow mirrors the existing Agrovus-erp marketing→provisioning pattern already built (`Agrovus-marketing/app/api/webhooks/stripe/route.ts` → calls `Agrovus-erp/app/api/provision/route.ts`): a Stripe Checkout subscription on signup → webhook → creates a `tenants` row (+ `tenant_memberships` for the admin user) here, analogous to how `Subsidiary` + `UserSubsidiary` get created in the ERP today.

## Decisions (resolved 2026-07-24)

1. **Stripe Connect account type for the managed tier** — **Express** dashboard. Lighter-weight onboarding, cobranded, Stripe handles most KYC/payout UX.
2. **Domain approach** — **Vercel Domains API**. Tenant points DNS (CNAME) at Vercel; we auto-verify + provision SSL.
3. **Pricing numbers** — Commerce tiers mirror ERP Starter/Growth/Scale price points exactly ($499/$1,199/$2,499 monthly), with 1.5% GMV added only on the Managed tier.
4. **`Product` catalog scoping** — **fully per-tenant**. Each tenant manages an independent product catalog; no shared/global catalog across tenants.

All four decisions above are now locked in. Phase 1 (tenant scoping hardening) implementation plan: `docs/superpowers/plans/2026-07-24-agrovus-ecommerce-tenant-hardening.md`.

## Phase 1 completion (2026-07-25)

All 12 tasks in `docs/superpowers/plans/2026-07-24-agrovus-ecommerce-tenant-hardening.md` are done on branch `feature/ecommerce-tenant-hardening` (worktree `.worktrees/ecommerce-tenant-hardening`):

- DB safety-net default added for `products.tenant_id` (migration `093_add_products_tenant_id_default.sql`).
- Legacy unscoped `app/(main)/...` route tree retired; `middleware.ts` redirects bare/unresolved paths to the default tenant (with query-string preservation, bypass-path collision guards, and redirect-loop prevention).
- `getRequiredTenantId` / `MissingTenantError` helper (`lib/tenant.ts`) resolves tenant context from `x-tenant-id` header or `tenant_id` query param for API routes.
- `GET /api/products`, `GET /api/products/[id]`, and `GET /api/categories` are all tenant-scoped (400 on missing tenant for the first two; graceful default-categories fallback for the third).
- Client call sites (`shop`, `compare`, `checkout` pages; `footer`, `search-overlay` components) pass `tenant_id` from `useTenant()`.
- Admin product creation stamps `tenant_id` (falls back to shared `FALLBACK_TENANT_ID` constant, `lib/tenant.ts`, when write endpoints aren't yet reachable through tenant-scoped routing — see "What's still open" below).
- Supplier product creation (`POST /api/supplier/products`) was found to be already fully deprecated (410/403, admin-assigns-to-supplier workflow) — no live write path exists there, so no code change was needed; resolved N/A in the plan doc.
- Cross-tenant isolation regression test (`__tests__/api/tenant-isolation.test.ts`) proves tenant A can never list or fetch tenant B's products by id, and that omitting `tenant_id` fails closed (400), not open.
- Full suite: 77 test files / 1083 tests passing, 0 lint errors, clean typecheck.

### What's still open after this plan

- `/admin` (and by extension anything using `FALLBACK_TENANT_ID`) is not yet tenant-scoped in routing — it's ICC-staff-only today, sitting in `middleware.ts`'s `BYPASS_PREFIXES`. A real tenant-scoped admin UI is future work (part of Phase 2+ below); until then, admin-created products fall back to `tenant_icc_default` when no tenant context is present.
- This hardening pass covered the `products`/`categories` read/write paths specifically flagged in the original audit. It did not re-audit every other commerce table (cart, orders, inventory, etc.) for `tenant_id` enforcement — that broader audit (goal 5, "Audit every commerce table for tenant_id presence and enforcement") should happen before onboarding a real external tenant, not just before Phase 2 payments work.

## Phase 2 completion (2026-07-27)

Stripe Connect payments landed on branch `feature/ecommerce-connect-payments` (worktree `.worktrees/ecommerce-connect-payments`), executed directly from prompts rather than a written plan doc up front — a retrospective plan doc was written after the fact for the historical record: `docs/superpowers/plans/2026-07-27-agrovus-ecommerce-connect-payments.md`.

- Merged Phase 1 (`feature/ecommerce-tenant-hardening`) into `main` first.
- Migration `094_add_stripe_connect_columns.sql` adds `payments_mode`, `stripe_connect_account_id`, `commission_bps`, `stripe_connect_charges_enabled`, `stripe_connect_payouts_enabled`, `stripe_connect_details_submitted` to `tenants`; `lib/tenant.ts` exposes all six on the `Tenant` type.
- Verified Stripe's v2 Core Accounts API (`stripe.v2.core.accounts`, `stripe.v2.core.accountLinks`) works against this account, used alongside v1 `stripe.accounts.retrieve()` for status checks (v1 still emits the flat `account.updated` shape even for v2-created accounts).
- `lib/tenant-auth.ts` — `requireTenantAdmin` / `tenantAdminAuthErrorResponse` enforce tenant-scoped admin access (distinct from ICC-staff-only `lib/admin-auth.ts`), keyed off `tenant_memberships.role = 'tenant_admin'`.
- `lib/stripe-connect.ts` — `getOrCreateConnectAccountForTenant`, `createConnectOnboardingLink`, `mapStripeAccountToStatusSnapshot`, `getConnectAccountStatusSnapshot`, `calculateApplicationFeeCents`.
- `POST /api/tenant-admin/connect/onboard` starts/resumes hosted Stripe onboarding, returning an Account Link URL.
- `GET /api/tenant-admin/connect/status` reports live Connect status with DB-cache self-healing and stale-cache fallback on Stripe errors.
- `POST /api/webhooks/stripe-connect` — idempotent `account.updated` handler keeping the DB cache in sync, using its own `STRIPE_CONNECT_WEBHOOK_SECRET` (added as a **required** var in `lib/env-validation.ts`; that schema isn't wired into any runtime boot path today, so this doesn't risk crashing anything, but the var still needs to actually be set in Vercel and the webhook endpoint registered in the Stripe Dashboard before this goes live in production).
- `app/api/payment/create-intent/route.ts` + `lib/stripe.ts` — three-way branch routing checkout PaymentIntents through tenant Connect destination charges (`own_stripe` → `on_behalf_of`, `icc_managed` → `application_fee_amount`), with a proven byte-for-byte fallback to ICC's original direct-charge behavior when no tenant/no Connect account is involved.
- Dedicated cross-tenant money-safety regression suite (`__tests__/regression/connect-cross-tenant-safety.test.ts`) proving no leakage of accounts/fees/status across back-to-back calls for different tenants.
- `/{slug}/account/payments-setup` — tenant-admin-facing settings page to start/monitor Connect onboarding, linked from the account hub.
- Full suite: 83 test files / 1143 tests passing, 0 lint errors, clean typecheck, clean production build.

### Known deferred items (follow-ups for later phases)

- **Checkout currency is hardcoded to `usd`** regardless of `tenant.currency` — needs to be threaded through before a non-USD tenant can go live.
- **No Canada Connect account support** — `identity.country` is hardcoded to `'us'` in `getOrCreateConnectAccountForTenant`; CA accounts are not yet verified to work the same way.
- **No self-serve tenant sign-up flow** — Phase 2 only builds the payments plumbing for tenants that already exist; there's still no UI for a brand-new tenant to actually register (this is Phase 6, "Self-serve onboarding wizard," below).
- **Logistics/shipping-carrier-per-tenant** is a separate toggle from payments (`logistics_mode` in the original design) and was not touched in Phase 2 — still Phase 4.
- **Custom-domain routing** is unrelated to payments and remains Phase 3.

## Phased Rollout

1. ~~Tenant scoping hardening~~ — **done**, see "Phase 1 completion" above.
2. ~~Per-tenant payments (Stripe Connect, both modes)~~ — **done**, see "Phase 2 completion" above.
3. Custom domains.
4. Logistics isolation.
5. Commerce plan tiers + commission billing.
6. Self-serve onboarding wizard.
7. Pilot with 1–2 real external customers before GA.
