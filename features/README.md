# Agrovus Feature Modules

Each subdirectory contains the self-contained code for one platform feature.

```
features/
  shop/           Product browsing: ProductCard, ProductGrid, filters, search
  checkout/       Checkout flow: cart summary, address form, payment, order confirmation
  account/        Customer account: profile, orders, addresses, licenses
  supplier/       Supplier portal: contracts, products, warehouses, reports
  acre-pack/      Acre Pack programs: builder, pricing, program management
  crop-planning/  Crop plans: new plan wizard, dashboard, history
  admin/          Admin panel: shared tables, forms, action patterns
```

## Structure inside each feature

```
features/<name>/
  components/   React components specific to this feature
  hooks/        Custom hooks (all client-side)
  lib/          Server-side utilities and DB helpers for this feature
  types/        TypeScript interfaces and type aliases
  index.ts      Re-exports public surface of the feature
```

## Migration approach

This is an **incremental refactor**. Route files in `app/` stay thin and import
from `features/` as code is gradually moved. Shared UI stays in `components/ui/`.

- When you create a new feature component, place it in `features/<name>/components/`
- When you extract a utility, place it in `features/<name>/lib/`
- Update the corresponding `app/` route to import from `features/` instead of inline
- Shared cross-feature utilities continue to live in `lib/`
