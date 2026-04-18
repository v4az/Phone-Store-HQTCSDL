# Database Setup & Concurrency Documentation

This document outlines the database schema, internal logic (triggers/constraints), and the strategies implemented to solve the **5 major database concurrency problems**.

## 1. Schema Overview (Tables)

The database uses SQL Server and is designed for an e-commerce inventory management system.

- **Master Data**: `Brand`, `Category`, `Supplier`, `Customer`, `InventoryLocation`
- **Catalog**:
  - `Product`: Base product details (Name, Brand, Category, Warranty).
  - `ProductVariant`: SKU-level details (Color, Storage, CostPrice, RetailPrice).
- **Inventory**:
  - `InventoryStock`: Tracks `QuantityOnHand` and `QuantityReserved` per `VariantId` and `LocationId`.
- **Transactions**:
  - `PurchaseOrder` & `PurchaseOrderLine`: Inbound stock.
  - `SalesInvoice` & `SalesInvoiceLine`: Outbound sales.

---

## 2. Constraints & Triggers

To enforce strict data integrity at the database layer (preventing API bypasses or manual SQL errors), the following mechanisms are in place:

### Data Integrity Constraints (CHECK)
- **Prices & Amounts**: `CostPrice`, `RetailPrice`, `UnitPrice`, `TotalAmount`, `FinalAmount` cannot be `< 0`.
- **Quantities**: `QuantityOnHand`, `QuantityReserved`, `WarrantyMonths` cannot be `< 0`. Sales `Quantity` must be `> 0`.
- **Percentages**: `DiscountPct` is strictly bounded `BETWEEN 0 AND 100`.

### Automation (Triggers)
- **`TR_ProductVariant_AfterInsert`**: An `AFTER INSERT` trigger on the `ProductVariant` table. Whenever a new SKU is created, it automatically performs a `CROSS JOIN` with `InventoryLocation` to insert an `InventoryStock` record with `0` quantity for all locations. This guarantees that new products instantly appear in inventory systems without relying on application-layer service code.

---

## 3. The 5 Concurrency Problems & Mitigations

Handling high-volume concurrent transactions (e.g., flash sales, multiple admins updating products) introduces 5 classic database concurrency vulnerabilities. Here is how they are mitigated in this system:

### 1. Lost Update
**The Problem**: Two users simultaneously fetch an item with `Quantity = 1`, both sell it, and both update the database to `Quantity = 0`. The system "loses" one of the updates, resulting in overselling (negative stock).
**The Mitigation**: Instead of reading the quantity and calculating the new value in the Node.js application, updates are performed atomically in SQL:
```sql
UPDATE InventoryStock 
SET QuantityOnHand = QuantityOnHand - @qty 
WHERE VariantId = @variantId AND QuantityOnHand >= @qty
```
If `rowsAffected === 0`, the system aborts the transaction and throws an `InsufficientStockError`.

### 2. Dirty Read
**The Problem**: Transaction A updates a product price but hasn't committed. Transaction B reads this new price. Transaction A rolls back. Transaction B is now acting on fake ("dirty") data.
**The Mitigation**: SQL Server's default isolation level is `READ COMMITTED`. This ensures that shared locks are taken when reading data, meaning Transaction B is forced to wait until Transaction A commits or rolls back before it can read the row.

### 3. Dirty Write
**The Problem**: Transaction A and Transaction B both attempt to update the same uncommitted row concurrently. If not properly locked, the database can end up in an inconsistent state or overwrite data unpredictably.
**The Mitigation**: We use explicit row locking (`WITH (UPDLOCK)`) when fetching data that is guaranteed to be updated immediately after (e.g., during Soft Deletes or targeted inventory adjustments). This forces the second transaction to wait its turn, serializing the writes.

### 4. Non-Repeatable Read
**The Problem**: Transaction A reads a row. Transaction B updates that row and commits. Transaction A reads the row again and gets a completely different value, breaking its internal business logic.
**The Mitigation**: For critical multi-step operations that rely on data remaining unchanged (e.g., calculating complex invoice totals against live prices), the transaction isolation level is elevated to `REPEATABLE READ`, preventing other transactions from updating the locked rows until Transaction A is finished.

### 5. Phantom Read
**The Problem**: Transaction A runs a query (e.g., `SELECT SUM(TotalAmount) FROM SalesInvoice`). Transaction B inserts a *new* invoice and commits. If Transaction A runs the exact same query again, a new "phantom" row appears, changing the sum.
**The Mitigation**: We explicitly enabled `ALLOW_SNAPSHOT_ISOLATION` at the database level (`migrations/003_enable_snapshot_isolation.sql`). For massive read-heavy operations like the Dashboard Analytics, the queries run under `SNAPSHOT` isolation. This uses row-versioning (in `tempdb`) to give the query a frozen-in-time view of the database, completely eliminating phantom reads **without placing locks that would block concurrent writers**.
