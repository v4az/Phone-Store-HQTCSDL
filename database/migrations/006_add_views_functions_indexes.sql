-- 006_add_views_functions_indexes.sql
-- Mục đích: bổ sung 2 UDF, 3 view, 5 non-clustered index để hệ thống đủ tầng
-- (xem báo cáo docs/database-report.md - chương 6, 8, 9 cho trade-off chi tiết)

-- =============================================================
-- SECTION A: USER-DEFINED FUNCTIONS (UDF)
-- =============================================================

-- fn_GetAvailableStock: trả số lượng có thể bán = QuantityOnHand - QuantityReserved.
-- Inline scalar UDF (SQL 2019+ tự inline khi WITH SCHEMABINDING + 2-part name).
GO
CREATE OR ALTER FUNCTION dbo.fn_GetAvailableStock(@VariantId INT, @LocationId INT)
RETURNS INT
WITH SCHEMABINDING
AS
BEGIN
    DECLARE @Available INT;
    SELECT @Available = QuantityOnHand - QuantityReserved
    FROM dbo.InventoryStock
    WHERE VariantId = @VariantId AND LocationId = @LocationId;
    RETURN ISNULL(@Available, 0);
END;
GO

-- fn_GetProductDisplayName: tên hiển thị cho variant: "ProductName - Color / Storage".
-- NULL-safe: bỏ phần thiếu, không xuất chuỗi rỗng/NULL.
CREATE OR ALTER FUNCTION dbo.fn_GetProductDisplayName(@VariantId INT)
RETURNS NVARCHAR(400)
WITH SCHEMABINDING
AS
BEGIN
    DECLARE @Result NVARCHAR(400);
    SELECT @Result =
        p.ProductName
        + ISNULL(N' - ' + v.Color, N'')
        + ISNULL(N' / ' + v.Storage, N'')
    FROM dbo.ProductVariant v
    JOIN dbo.Product p ON v.ProductId = p.ProductId
    WHERE v.VariantId = @VariantId;
    RETURN @Result;
END;
GO

-- =============================================================
-- SECTION B: VIEWS
-- =============================================================

-- vw_ProductCatalog: gộp Product + Brand + Category + tổng tồn + khoảng giá variant.
-- Dùng cho trang /products và search catalogue.
CREATE OR ALTER VIEW dbo.vw_ProductCatalog AS
SELECT
    p.ProductId,
    p.ProductCode,
    p.ProductName,
    p.WarrantyMonths,
    p.IsActive,
    b.BrandId,
    b.BrandName,
    c.CategoryId,
    c.CategoryName,
    COUNT(DISTINCT v.VariantId)            AS VariantCount,
    ISNULL(SUM(s.QuantityOnHand), 0)       AS TotalStock,
    MIN(v.RetailPrice)                     AS MinPrice,
    MAX(v.RetailPrice)                     AS MaxPrice
FROM dbo.Product p
LEFT JOIN dbo.Brand          b ON p.BrandId    = b.BrandId
LEFT JOIN dbo.Category       c ON p.CategoryId = c.CategoryId
LEFT JOIN dbo.ProductVariant v ON p.ProductId  = v.ProductId AND v.IsActive = 1
LEFT JOIN dbo.InventoryStock s ON v.VariantId  = s.VariantId
GROUP BY
    p.ProductId, p.ProductCode, p.ProductName, p.WarrantyMonths, p.IsActive,
    b.BrandId, b.BrandName, c.CategoryId, c.CategoryName;
GO

-- vw_InventoryByLocation: tồn kho theo từng kho, kèm available qty.
-- Tính AvailableQty inline (không gọi UDF) để query plan tối ưu.
CREATE OR ALTER VIEW dbo.vw_InventoryByLocation AS
SELECT
    s.LocationId,
    l.LocationName,
    s.VariantId,
    v.Sku,
    v.Color,
    v.Storage,
    p.ProductId,
    p.ProductCode,
    p.ProductName,
    s.QuantityOnHand,
    s.QuantityReserved,
    (s.QuantityOnHand - s.QuantityReserved) AS AvailableQty
FROM dbo.InventoryStock s
JOIN dbo.InventoryLocation l ON s.LocationId = l.LocationId
JOIN dbo.ProductVariant    v ON s.VariantId  = v.VariantId
JOIN dbo.Product           p ON v.ProductId  = p.ProductId;
GO

-- vw_DailySalesSummary: gộp doanh thu theo ngày (cho dashboard daily report).
CREATE OR ALTER VIEW dbo.vw_DailySalesSummary AS
SELECT
    CAST(InvoiceDate AS DATE) AS SaleDate,
    COUNT(*)                  AS InvoiceCount,
    SUM(TotalAmount)          AS TotalRevenue,
    SUM(DiscountAmount)       AS TotalDiscount,
    SUM(FinalAmount)          AS FinalRevenue
FROM dbo.SalesInvoice
GROUP BY CAST(InvoiceDate AS DATE);
GO

-- =============================================================
-- SECTION C: NON-CLUSTERED INDEXES
-- =============================================================

-- 1. Tìm hoá đơn theo ngày (daily/weekly/monthly report).
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_SalesInvoice_InvoiceDate' AND object_id = OBJECT_ID('dbo.SalesInvoice'))
    CREATE NONCLUSTERED INDEX IX_SalesInvoice_InvoiceDate
        ON dbo.SalesInvoice(InvoiceDate)
        INCLUDE (FinalAmount, TotalAmount, DiscountAmount);
GO

-- 2. Filtered index: tra cứu lịch sử khách qua SĐT (chỉ index khi có phone).
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_SalesInvoice_CustomerPhone' AND object_id = OBJECT_ID('dbo.SalesInvoice'))
    CREATE NONCLUSTERED INDEX IX_SalesInvoice_CustomerPhone
        ON dbo.SalesInvoice(CustomerPhone)
        WHERE CustomerPhone IS NOT NULL;
GO

-- 3. FK lookup: variant theo product (mỗi product detail page cần).
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_ProductVariant_ProductId' AND object_id = OBJECT_ID('dbo.ProductVariant'))
    CREATE NONCLUSTERED INDEX IX_ProductVariant_ProductId
        ON dbo.ProductVariant(ProductId)
        INCLUDE (Sku, Color, Storage, RetailPrice, IsActive);
GO

-- 4. Tồn kho theo location: composite PK (Variant,Location) leading-col là Variant,
--    query theo Location dùng index mới.
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_InventoryStock_LocationId' AND object_id = OBJECT_ID('dbo.InventoryStock'))
    CREATE NONCLUSTERED INDEX IX_InventoryStock_LocationId
        ON dbo.InventoryStock(LocationId)
        INCLUDE (QuantityOnHand, QuantityReserved);
GO

-- 5. Lịch sử bán theo variant (top-seller report, sales history per product).
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_SalesInvoiceLine_VariantId' AND object_id = OBJECT_ID('dbo.SalesInvoiceLine'))
    CREATE NONCLUSTERED INDEX IX_SalesInvoiceLine_VariantId
        ON dbo.SalesInvoiceLine(VariantId)
        INCLUDE (Quantity, UnitPrice, LineTotal);
GO
