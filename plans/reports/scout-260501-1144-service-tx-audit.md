# Service-Layer Transaction & Query Audit — 260501-1144

Source: full read of `lib/db.ts`, `lib/errors.ts`, `lib/services/*.ts`, all `app/api/**/route.ts`.

## Per-function summary

| File | Function | Tx? | Iso | Lock | Atomic write? | Notes |
|---|---|---|---|---|---|---|
| brands.ts | getBrands/getById | ✗ | def | — | n/a | read-only |
| brands.ts | createBrand | ✗ | def | — | ✓ | single INSERT |
| brands.ts | updateBrand | ✓ | RC | — | ✓ | tx + single UPDATE OUTPUT |
| brands.ts | softDelete/hardDelete | ✗ | def | — | ✓ | single statement |
| categories.ts | get*/create/softDelete/hardDelete | ✗ | def | — | n/a/✓ | mirror of brands |
| categories.ts | updateCategory | ✓ | RC | — | ✓ | tx wrapper |
| products.ts | getProducts/getProductsWithVariants/getProductById | ✗ | def | — | n/a | LEFT JOIN reads |
| products.ts | createProduct | ✓ | RC | — | ✓ | tx: insert Product → variants → stock seeded by trigger |
| products.ts | softDeleteProduct | ✓ | RC | **UPDLOCK** | ✓ | SELECT UPDLOCK Product → 2× UPDATE; prevents re-activation race |
| products.ts | hardDeleteProduct | ✓ | RC | — | ✓ | tx: DELETE variants + product |
| products.ts | updateProduct | ✓ | RC | — | ✓ | tx + WHERE IsActive=1 guard |
| products.ts | updateInventoryStock | ✓ | RC | — | ✓ | tx loop of single-row UPDATE; per-iter fresh request |
| sales.ts | getInvoices | ✗ | def | — | n/a | single query |
| sales.ts | getInvoiceById | ✗ | def | — | n/a | **2 queries (header + lines) NOT in tx** ⚠ |
| sales.ts | createInvoice | ✓ | RC | **UPDLOCK** | ✓ | per-line: SELECT RetailPrice WITH(UPDLOCK) → atomic stock UPDATE with `>=` guard |
| report.ts | getDailySales/Weekly/Monthly/Quarterly/Yearly | ✗ | def | — | n/a | independent reads |
| report.ts | getDashboardSales | ✓ | **SNAPSHOT** | — | n/a | Promise.all(4 reads) inside SNAPSHOT tx |

## Standard-compliant patterns (keep)

1. **Atomic stock decrement** in createInvoice — `UPDATE … SET QuantityOnHand=QuantityOnHand-@qty WHERE …≥@qty` with `rowsAffected[0]===0` → throw `InsufficientStockError`.
2. **UPDLOCK for price** in createInvoice — locks ProductVariant row until commit; manager cannot change RetailPrice mid-tx.
3. **UPDLOCK for soft-delete** — softDeleteProduct locks Product row before flipping IsActive; updateProduct guarded by `WHERE IsActive=1`.
4. **SNAPSHOT for dashboard** — getDashboardSales wraps 4 aggregates in SNAPSHOT; consistent counts across daily/weekly/monthly/yearly.
5. **Fresh request per line** — sales.ts `for (const line of …) transaction.request().input(…)` — avoids mssql duplicate-param error.
6. **Rollback in catch** — every tx-wrapped function has `catch { await tx.rollback(); throw; }`.

## Gaps

| Gap | Where | Risk | Fix |
|---|---|---|---|
| /api/inventory bypasses service | `app/api/inventory/route.ts` | tight coupling, no tx control, harder to audit/test | move query into `lib/services/inventory.ts` |
| getInvoiceById not atomic | `lib/services/sales.ts` getInvoiceById | header + lines may diverge if concurrent insert into a fresh invoice (low risk; same invoice unlikely to mutate after creation) | wrap both queries in single tx OR single JOIN query |
| /api/reports calls each summary fn directly | `app/api/reports/route.ts` | phantom across the 4 summaries (different snapshot per query) | call `getDashboardSales()` instead |

## Param-reuse check
**No bugs.** Sales loop creates fresh `transaction.request()` per line. Products createProduct does same.

## Error / pool
- All tx wrapped: rollback in catch.
- Pool singleton (`getPool()`); no graceful shutdown — acceptable for Next.js serverless.

## Conclusion
Service layer is largely standard. Three fixes will make the system fully production-grade for the report's "layered defense" narrative.

## Open questions
- None.
