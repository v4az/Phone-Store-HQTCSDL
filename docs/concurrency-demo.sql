-- =============================================================
-- Concurrency Demo Script
-- =============================================================
-- This script demonstrates the 5 concurrency problems and how
-- the fixes in the codebase prevent them.
-- Run each "Session" in a separate SSMS query window.
-- =============================================================


-- =============================================================
-- DEMO 1: Dirty Read — PREVENTED by default
-- =============================================================
-- SQL Server uses READ COMMITTED by default.
-- Session 2 will WAIT (not read dirty data) until Session 1 commits/rollbacks.

-- Session 1:
BEGIN TRANSACTION
UPDATE InventoryStock
SET QuantityOnHand = QuantityOnHand + 100
WHERE VariantId = 1 AND LocationId = 1
-- Don't commit yet! Switch to Session 2.

-- Session 2 (in a separate window):
-- This will BLOCK until Session 1 commits or rolls back.
SELECT QuantityOnHand FROM InventoryStock
WHERE VariantId = 1 AND LocationId = 1

-- Session 1: rollback
ROLLBACK
-- Session 2 now returns the CORRECT value (not the +100 dirty value)


-- =============================================================
-- DEMO 2: Dirty Write — PREVENTED by UPDLOCK + IsActive guard
-- =============================================================
-- Scenario: softDeleteProduct() races with updateProduct()
-- Fix: softDeleteProduct() uses SELECT WITH (UPDLOCK) first,
--       updateProduct() has AND IsActive = 1 in WHERE

-- Session 1 (softDelete):
BEGIN TRANSACTION
-- Lock the product row
SELECT ProductId FROM Product WITH (UPDLOCK) WHERE ProductId = 1
-- Now update
UPDATE Product SET IsActive = 0 WHERE ProductId = 1
UPDATE ProductVariant SET IsActive = 0 WHERE ProductId = 1

-- Session 2 (updateProduct — in a separate window):
-- This will BLOCK because Session 1 holds UPDLOCK on ProductId = 1
BEGIN TRANSACTION
UPDATE Product SET ProductName = N'New Name' WHERE ProductId = 1 AND IsActive = 1
-- ^^^ Even if Session 1 commits first, IsActive = 0 now, so rowsAffected = 0
COMMIT

-- Session 1:
COMMIT
-- Result: Product is soft-deleted, Session 2's update was safely rejected


-- =============================================================
-- DEMO 3: Non-Repeatable Read — PREVENTED by UPDLOCK on price
-- =============================================================
-- createInvoice() reads RetailPrice WITH (UPDLOCK)
-- No one can change the price while the invoice is being created.

-- Session 1 (createInvoice transaction):
BEGIN TRANSACTION
SELECT RetailPrice FROM ProductVariant WITH (UPDLOCK)
WHERE VariantId = 1 AND IsActive = 1
-- Returns e.g. 22990000. Row is now locked.

-- Session 2 (manager tries to change price):
UPDATE ProductVariant SET RetailPrice = 19990000 WHERE VariantId = 1
-- ^^^ BLOCKS until Session 1 commits

-- Session 1: continues creating invoice with price = 22990000
-- ... insert SalesInvoice, SalesInvoiceLine ...
COMMIT
-- Session 2's update now proceeds. Next invoice will use the new price.


-- =============================================================
-- DEMO 4: Lost Update — PREVENTED by atomic stock deduction
-- =============================================================
-- Two staff members sell items concurrently.
-- Fix: UPDATE ... SET QuantityOnHand = QuantityOnHand - @qty WHERE QuantityOnHand >= @qty

-- Setup: ensure stock = 10
UPDATE InventoryStock SET QuantityOnHand = 10 WHERE VariantId = 1 AND LocationId = 1

-- Session 1 (sell 3):
BEGIN TRANSACTION
UPDATE InventoryStock
SET QuantityOnHand = QuantityOnHand - 3
WHERE VariantId = 1 AND LocationId = 1 AND QuantityOnHand >= 3
-- rowsAffected = 1, stock is now 7 (but not committed yet, row is X-locked)

-- Session 2 (sell 5 — in a separate window):
BEGIN TRANSACTION
UPDATE InventoryStock
SET QuantityOnHand = QuantityOnHand - 5
WHERE VariantId = 1 AND LocationId = 1 AND QuantityOnHand >= 5
-- ^^^ BLOCKS waiting for Session 1's X-lock

-- Session 1:
COMMIT
-- Session 2 now proceeds: reads QuantityOnHand = 7, subtracts 5 → 2. rowsAffected = 1.

-- Session 2:
COMMIT

-- Verify: stock should be 2 (10 - 3 - 5 = 2) ✓
SELECT QuantityOnHand FROM InventoryStock WHERE VariantId = 1 AND LocationId = 1

-- Bonus: test insufficient stock
UPDATE InventoryStock SET QuantityOnHand = 2 WHERE VariantId = 1 AND LocationId = 1
-- Try to sell 5:
UPDATE InventoryStock
SET QuantityOnHand = QuantityOnHand - 5
WHERE VariantId = 1 AND LocationId = 1 AND QuantityOnHand >= 5
-- rowsAffected = 0 → sale rejected, stock unchanged ✓


-- =============================================================
-- DEMO 5: Phantom Read — PREVENTED by SNAPSHOT isolation
-- =============================================================
-- getDashboardSales() runs 4 queries in a SNAPSHOT transaction.
-- All queries see the same snapshot, even if new invoices are inserted concurrently.

-- Prerequisite (run once):
-- ALTER DATABASE csdl SET ALLOW_SNAPSHOT_ISOLATION ON;

-- Session 1 (dashboard report):
SET TRANSACTION ISOLATION LEVEL SNAPSHOT
BEGIN TRANSACTION
SELECT COUNT(*) AS SoHoaDon, SUM(FinalAmount) AS TongTien
FROM SalesInvoice
WHERE InvoiceDate >= '2026-01-01'
-- Returns e.g. 5 invoices, total 50,000,000

-- Session 2 (staff creates new invoice — in a separate window):
INSERT INTO SalesInvoice (InvoiceCode, InvoiceDate, TotalAmount, FinalAmount)
VALUES ('INV-PHANTOM-TEST', GETDATE(), 10000000, 10000000)
-- This succeeds immediately — SNAPSHOT doesn't block writers!

-- Session 1: run the same query again
SELECT COUNT(*) AS SoHoaDon, SUM(FinalAmount) AS TongTien
FROM SalesInvoice
WHERE InvoiceDate >= '2026-01-01'
-- Still returns 5 invoices, total 50,000,000 ✓ (no phantom!)
COMMIT

-- After commit, querying again would show 6 invoices (the new one is visible now)

-- Cleanup:
DELETE FROM SalesInvoice WHERE InvoiceCode = 'INV-PHANTOM-TEST'
