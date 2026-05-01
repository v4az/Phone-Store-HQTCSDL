# Schema Inventory Audit — 260501-1144

Source: scan of `database/migrations/001-005`. Verified what exists vs gaps for academic DB report.

## Tables (11)

| Table | PK | FK | UNIQUE | CHECK |
|---|---|---|---|---|
| Brand | BrandId IDENTITY | — | BrandName | — |
| Category | CategoryId IDENTITY | ParentCategoryId→Category | — | — |
| Product | ProductId IDENTITY | BrandId→Brand, CategoryId→Category | ProductCode | WarrantyMonths≥0 |
| ProductVariant | VariantId IDENTITY | ProductId→Product | Sku | CostPrice≥0, RetailPrice≥0 |
| InventoryLocation | LocationId IDENTITY | — | — | — |
| InventoryStock | (VariantId,LocationId) | VariantId→ProductVariant, LocationId→InventoryLocation | — | QuantityOnHand≥0, QuantityReserved≥0 |
| Supplier | SupplierId IDENTITY | — | — | — |
| PurchaseOrder | PurchaseId IDENTITY | SupplierId→Supplier | — | — |
| PurchaseOrderLine | (PurchaseId,LineNo) | PurchaseId→PurchaseOrder, VariantId→ProductVariant | — | — |
| SalesInvoice | InvoiceId IDENTITY | — | InvoiceCode | TotalAmount≥0, FinalAmount≥0 |
| SalesInvoiceLine | (InvoiceId,LineNo) | InvoiceId→SalesInvoice, VariantId→ProductVariant | — | Quantity>0, UnitPrice≥0, DiscountPct∈[0,100] |

`SalesInvoice` has inline customer (CustomerName, CustomerPhone) — no separate Customer table.
`[LineNo]` is reserved keyword — must escape with brackets.

## Relationships
- 1:N — Brand→Product, Category→Product, Product→Variant, Supplier→PO, SalesInvoice→Lines, PO→POLines, Variant→SalesInvoiceLine, Variant→POLine
- N:M — Variant ↔ Location via InventoryStock (composite PK)
- Self-ref — Category.ParentCategoryId → Category

## Indexes
- Clustered: implicit from PK on every table.
- Non-clustered: **NONE** explicit.
- Implicit unique: ProductCode, Sku, InvoiceCode, BrandName.

## Triggers
| Name | Table | Timing | Purpose |
|---|---|---|---|
| TR_ProductVariant_AfterInsert | ProductVariant | AFTER INSERT | Auto-create InventoryStock(qty=0) for each new variant × every location (CROSS JOIN) |

## UDFs
**NONE.**

## Views
**NONE.**

## Stored Procedures
**NONE.**

## DB-level
- ALLOW_SNAPSHOT_ISOLATION ON (migration 003)
- Recovery model: default (FULL on Docker image)

## Gaps for "đủ tầng" academic report

| Need | Status | Recommended addition |
|---|---|---|
| UDFs | absent | `fn_GetAvailableStock(VariantId,LocationId)`, `fn_GetProductDisplayName(VariantId)` |
| Views | absent | `vw_ProductCatalog`, `vw_InventoryByLocation`, `vw_DailySalesSummary` |
| NC indexes | absent | `IX_SalesInvoice_InvoiceDate INCLUDE(FinalAmount,TotalAmount)`, `IX_SalesInvoice_CustomerPhone`, `IX_ProductVariant_ProductId`, `IX_InventoryStock_LocationId`, `IX_SalesInvoiceLine_VariantId` |
| Audit/timestamps | absent | optional — skip (out of scope) |

## Open questions
- Should we delete the existing fragmented docs (concurrency-*.md, database_setup.md) once the consolidated `database-report.md` is written? — pending user.
