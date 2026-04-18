-- 004_add_validation_constraints.sql

-- Add CHECK constraints for data integrity

-- 1. Product constraints
ALTER TABLE Product
ADD CONSTRAINT CHK_Product_WarrantyMonths CHECK (WarrantyMonths >= 0);

-- 2. ProductVariant constraints
ALTER TABLE ProductVariant
ADD CONSTRAINT CHK_ProductVariant_CostPrice CHECK (CostPrice >= 0);

ALTER TABLE ProductVariant
ADD CONSTRAINT CHK_ProductVariant_RetailPrice CHECK (RetailPrice >= 0);

-- 3. InventoryStock constraints
ALTER TABLE InventoryStock
ADD CONSTRAINT CHK_InventoryStock_QuantityOnHand CHECK (QuantityOnHand >= 0);

ALTER TABLE InventoryStock
ADD CONSTRAINT CHK_InventoryStock_QuantityReserved CHECK (QuantityReserved >= 0);

-- 4. SalesInvoiceLine constraints
ALTER TABLE SalesInvoiceLine
ADD CONSTRAINT CHK_SalesInvoiceLine_Quantity CHECK (Quantity > 0);

ALTER TABLE SalesInvoiceLine
ADD CONSTRAINT CHK_SalesInvoiceLine_UnitPrice CHECK (UnitPrice >= 0);

ALTER TABLE SalesInvoiceLine
ADD CONSTRAINT CHK_SalesInvoiceLine_DiscountPct CHECK (DiscountPct >= 0 AND DiscountPct <= 100);

-- 5. SalesInvoice constraints
ALTER TABLE SalesInvoice
ADD CONSTRAINT CHK_SalesInvoice_TotalAmount CHECK (TotalAmount >= 0);

ALTER TABLE SalesInvoice
ADD CONSTRAINT CHK_SalesInvoice_FinalAmount CHECK (FinalAmount >= 0);

-- 6. Trigger to automatically initialize inventory stock when a new variant is created
GO
CREATE TRIGGER TR_ProductVariant_AfterInsert
ON ProductVariant
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO InventoryStock (VariantId, LocationId, QuantityOnHand, QuantityReserved)
    SELECT i.VariantId, l.LocationId, 0, 0
    FROM inserted i
    CROSS JOIN InventoryLocation l;
END;
GO
