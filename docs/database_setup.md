# Database Setup & Concurrency Documentation

## Tổng quan

SQL Server 2022. Mô hình quan hệ cho hệ thống quản lý cửa hàng điện thoại & phụ kiện.

---

## Schema

### Master Data

| Bảng | Mô tả | PK | FK | Unique |
|---|---|---|---|---|
| `Brand` | Thương hiệu | `BrandId` (IDENTITY) | — | `BrandName` |
| `Category` | Danh mục (phân cấp) | `CategoryId` (IDENTITY) | `ParentCategoryId` → `Category` | — |
| `Supplier` | Nhà cung cấp | `SupplierId` (IDENTITY) | — | — |
| `InventoryLocation` | Kho hàng | `LocationId` (IDENTITY) | — | — |

### Catalog

| Bảng | Mô tả | PK | FK | Unique |
|---|---|---|---|---|
| `Product` | Sản phẩm | `ProductId` (IDENTITY) | `BrandId` → `Brand`, `CategoryId` → `Category` | `ProductCode` |
| `ProductVariant` | Biến thể (SKU, màu, giá) | `VariantId` (IDENTITY) | `ProductId` → `Product` | `Sku` |

Quan hệ: `Product` 1:N `ProductVariant`.

### Inventory

| Bảng | Mô tả | PK | FK |
|---|---|---|---|
| `InventoryStock` | Tồn kho theo variant + location | `VariantId` + `LocationId` (composite) | `VariantId` → `ProductVariant`, `LocationId` → `InventoryLocation` |

Cột: `QuantityOnHand` (thực có), `QuantityReserved` (đã đặt). Available = OnHand - Reserved.

### Transactions

| Bảng | Mô tả | PK | FK | Unique |
|---|---|---|---|---|
| `SalesInvoice` | Hóa đơn bán hàng | `InvoiceId` (IDENTITY) | — | `InvoiceCode` |
| `SalesInvoiceLine` | Chi tiết dòng hàng | `InvoiceId` + `[LineNo]` (composite) | `InvoiceId` → `SalesInvoice`, `VariantId` → `ProductVariant` | — |
| `PurchaseOrder` | Đơn nhập hàng | `PurchaseId` (IDENTITY) | `SupplierId` → `Supplier` | — |
| `PurchaseOrderLine` | Chi tiết nhập | `PurchaseId` + `[LineNo]` (composite) | `PurchaseId` → `PurchaseOrder`, `VariantId` → `ProductVariant` | — |

`SalesInvoice` lưu thông tin khách inline (`CustomerName`, `CustomerPhone`) — không dùng bảng Customer riêng. Tra cứu lịch sử mua hàng qua SĐT.

`[LineNo]` là reserved keyword trong SQL Server — phải escape trong mọi query.

---

## CHECK Constraints

| Constraint | Bảng | Điều kiện |
|---|---|---|
| `CHK_Product_WarrantyMonths` | Product | `WarrantyMonths >= 0` |
| `CHK_ProductVariant_CostPrice` | ProductVariant | `CostPrice >= 0` |
| `CHK_ProductVariant_RetailPrice` | ProductVariant | `RetailPrice >= 0` |
| `CHK_InventoryStock_QuantityOnHand` | InventoryStock | `QuantityOnHand >= 0` |
| `CHK_InventoryStock_QuantityReserved` | InventoryStock | `QuantityReserved >= 0` |
| `CHK_SalesInvoiceLine_Quantity` | SalesInvoiceLine | `Quantity > 0` |
| `CHK_SalesInvoiceLine_UnitPrice` | SalesInvoiceLine | `UnitPrice >= 0` |
| `CHK_SalesInvoiceLine_DiscountPct` | SalesInvoiceLine | `0 <= DiscountPct <= 100` |
| `CHK_SalesInvoice_TotalAmount` | SalesInvoice | `TotalAmount >= 0` |
| `CHK_SalesInvoice_FinalAmount` | SalesInvoice | `FinalAmount >= 0` |

---

## Trigger

### TR_ProductVariant_AfterInsert

Bảng: `ProductVariant` | Loại: `AFTER INSERT`

Tự động tạo `InventoryStock` (qty = 0) cho tất cả kho hàng khi thêm variant mới.

```sql
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
```

Lưu ý: Bảng có trigger không cho phép `OUTPUT INSERTED.*` — phải dùng `SELECT SCOPE_IDENTITY()` thay thế.

---

## Migrations

Theo dõi qua bảng `_MigrationHistory`. Mỗi file chạy đúng 1 lần.

| Migration | Mục đích |
|---|---|
| `001_init_schema.sql` | Tạo toàn bộ bảng, PK, FK, unique constraints |
| `002_seed_data.sql` | Seed brands, categories, 10 products, variants, location, inventory (qty 10) |
| `003_enable_snapshot_isolation.sql` | Bật `ALLOW_SNAPSHOT_ISOLATION` cho phantom read prevention |
| `004_add_validation_constraints.sql` | CHECK constraints + trigger `TR_ProductVariant_AfterInsert` |
| `005_inline_customer_on_invoice.sql` | Chuyển customer info inline lên SalesInvoice, xóa bảng Customer |

---

## 5 Concurrency Problems & Mitigations

### 1. Lost Update
**Bài toán**: Hai transaction cùng bán sản phẩm có tồn kho = 1. Cả hai đọc qty = 1, cả hai trừ 1, ghi qty = 0. Hệ thống mất một lần trừ — bán vượt tồn kho.

**Giải pháp**: Cập nhật atomic trong SQL — không đọc rồi tính từ application:
```sql
UPDATE InventoryStock
SET QuantityOnHand = QuantityOnHand - @qty
WHERE VariantId = @variantId
  AND LocationId = @locationId
  AND QuantityOnHand >= @qty
```
`WHERE QuantityOnHand >= @qty` là guard: nếu hai transaction race, cả hai dùng giá trị DB hiện tại. Transaction đầu thành công, transaction sau thấy `rowsAffected = 0` → rollback.

### 2. Dirty Read
**Bài toán**: Transaction A cập nhật giá nhưng chưa commit. Transaction B đọc giá mới. A rollback. B đang dùng dữ liệu không tồn tại.

**Giải pháp**: SQL Server mặc định `READ COMMITTED`. Shared lock ngăn đọc row chưa commit — B phải đợi A commit hoặc rollback trước.

### 3. Dirty Write
**Bài toán**: Hai transaction cùng update một row chưa commit, gây trạng thái không nhất quán.

**Giải pháp**: Dùng `WITH (UPDLOCK)` khi đọc row sẽ update ngay sau đó:
```sql
SELECT ProductId FROM Product WITH (UPDLOCK)
WHERE ProductId = @productId
```
Ví dụ: khi soft delete sản phẩm, lock row trước để ngăn transaction khác re-activate giữa chừng.

### 4. Non-Repeatable Read
**Bài toán**: Transaction A đọc `RetailPrice` để tính hóa đơn. Transaction B thay đổi giá và commit. A đọc lại — giá khác, tổng tiền sai.

**Giải pháp**: `WITH (UPDLOCK)` trên `ProductVariant` khi tạo hóa đơn:
```sql
SELECT RetailPrice FROM ProductVariant WITH (UPDLOCK)
WHERE VariantId = @variantId AND IsActive = 1
```
Lock giữ đến khi transaction commit — giá không thể thay đổi giữa chừng.

### 5. Phantom Read
**Bài toán**: Transaction A tính `SUM(TotalAmount)` cho dashboard. Transaction B thêm hóa đơn mới và commit. A chạy lại query — row "ma" xuất hiện, tổng thay đổi.

**Giải pháp**: Bật `ALLOW_SNAPSHOT_ISOLATION ON` ở tầng database:
```sql
ALTER DATABASE csdl SET ALLOW_SNAPSHOT_ISOLATION ON;
```
Dashboard analytics chạy với `SNAPSHOT` isolation — sử dụng row-versioning (lưu trong tempdb) để có snapshot dữ liệu tại thời điểm bắt đầu transaction. Không khóa concurrent writers, không ảnh hưởng hiệu năng ghi.
