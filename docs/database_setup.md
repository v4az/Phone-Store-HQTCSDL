# Database Setup & Concurrency Documentation

## Tổng quan

Hệ thống quản lý cửa hàng điện thoại & phụ kiện sử dụng SQL Server 2022, thiết kế theo mô hình quan hệ. Trong quá trình phát triển, chúng tôi đã gặp và giải quyết nhiều vấn đề thực tế liên quan đến thiết kế schema, reserved keywords, trigger, thứ tự migration, và 5 bài toán concurrency kinh điển.

---

## Schema Design

### Master Data

**Brand** — Thương hiệu sản phẩm.
- PK: `BrandId` (IDENTITY)
- Unique: `BrandName`
- Cột: `Country`, `IsActive` (soft delete)

**Category** — Danh mục sản phẩm, hỗ trợ phân cấp.
- PK: `CategoryId` (IDENTITY)
- FK: `ParentCategoryId` → `Category(CategoryId)` (self-referencing)
- Cho phép cấu trúc cây: Phones, Accessories → Cases, Chargers, Earphones

**Supplier** — Nhà cung cấp hàng hóa.
- PK: `SupplierId` (IDENTITY)
- Cột: `Name`, `Phone`, `Address`, `IsActive`

**InventoryLocation** — Kho hàng / cửa hàng.
- PK: `LocationId` (IDENTITY)
- Cột: `LocationName`, `Address`

### Catalog

**Product** — Thông tin sản phẩm cơ bản.
- PK: `ProductId` (IDENTITY)
- FK: `BrandId` → `Brand`, `CategoryId` → `Category`
- Unique: `ProductCode`
- Cột: `ProductName`, `WarrantyMonths`, `Description`, `IsActive`

**ProductVariant** — Biến thể theo SKU (màu, dung lượng, giá).
- PK: `VariantId` (IDENTITY)
- FK: `ProductId` → `Product`
- Unique: `Sku`
- Cột: `Color`, `Storage`, `OtherAttributes`, `ImageUrl`, `CostPrice`, `RetailPrice`, `IsActive`

Quan hệ: `Product` 1:N `ProductVariant`. Mỗi sản phẩm có thể có nhiều biến thể (iPhone 15 Black 128GB, iPhone 15 Blue 256GB,...).

### Inventory

**InventoryStock** — Tồn kho theo biến thể và kho hàng.
- PK: `VariantId` + `LocationId` (composite)
- FK: `VariantId` → `ProductVariant`, `LocationId` → `InventoryLocation`
- Cột: `QuantityOnHand` (thực có), `QuantityReserved` (đã đặt)
- Available = `QuantityOnHand` - `QuantityReserved`

### Transactions

**SalesInvoice** — Hóa đơn bán hàng.
- PK: `InvoiceId` (IDENTITY)
- Unique: `InvoiceCode`
- Cột: `CustomerName`, `CustomerPhone`, `InvoiceDate`, `TotalAmount`, `DiscountAmount`, `FinalAmount`, `CreatedBy`

Ban đầu thiết kế có bảng `Customer` riêng với FK `CustomerId` trên `SalesInvoice`. Tuy nhiên, nhận thấy với mô hình cửa hàng điện thoại, việc lưu thông tin khách trực tiếp trên hóa đơn đơn giản hơn — tra cứu lịch sử mua hàng chỉ cần tìm theo SĐT. Bảng `Customer` đã được loại bỏ qua migration `005`.

**SalesInvoiceLine** — Chi tiết dòng hàng.
- PK: `InvoiceId` + `[LineNo]` (composite)
- FK: `InvoiceId` → `SalesInvoice`, `VariantId` → `ProductVariant`
- Cột: `Quantity`, `UnitPrice`, `DiscountPct`, `LineTotal`

**PurchaseOrder / PurchaseOrderLine** — Đơn nhập hàng (cấu trúc tương tự SalesInvoice).
- FK: `SupplierId` → `Supplier`, `VariantId` → `ProductVariant`

**Vấn đề `LineNo`**: `LineNo` là reserved keyword trong SQL Server (từ Transact-SQL cũ). Nếu dùng trực tiếp trong INSERT/SELECT sẽ gặp lỗi syntax. Phải luôn escape bằng `[LineNo]`. Schema đã định nghĩa đúng từ đầu, nhưng service layer quên escape — gây lỗi 500 khi tạo đơn hàng.

---

## CHECK Constraints

Đảm bảo tính toàn vẹn dữ liệu tại tầng database, không phụ thuộc application logic:

| Constraint | Bảng | Điều kiện |
|---|---|---|
| `CHK_Product_WarrantyMonths` | Product | `WarrantyMonths >= 0` |
| `CHK_ProductVariant_CostPrice` | ProductVariant | `CostPrice >= 0` |
| `CHK_ProductVariant_RetailPrice` | ProductVariant | `RetailPrice >= 0` |
| `CHK_InventoryStock_QuantityOnHand` | InventoryStock | `QuantityOnHand >= 0` |
| `CHK_InventoryStock_QuantityReserved` | InventoryStock | `QuantityReserved >= 0` |
| `CHK_SalesInvoiceLine_Quantity` | SalesInvoiceLine | `Quantity > 0` |
| `CHK_SalesInvoiceLine_UnitPrice` | SalesInvoiceLine | `UnitPrice >= 0` |
| `CHK_SalesInvoiceLine_DiscountPct` | SalesInvoiceLine | `DiscountPct >= 0 AND <= 100` |
| `CHK_SalesInvoice_TotalAmount` | SalesInvoice | `TotalAmount >= 0` |
| `CHK_SalesInvoice_FinalAmount` | SalesInvoice | `FinalAmount >= 0` |

---

## Trigger

### TR_ProductVariant_AfterInsert
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

Khi tạo biến thể mới, trigger tự động tạo bản ghi `InventoryStock` (qty = 0) cho **tất cả** kho hàng. SKU mới xuất hiện ngay trong hệ thống tồn kho.

**Vấn đề gặp phải**: SQL Server không cho phép `OUTPUT INSERTED.*` trên bảng có trigger (trừ khi dùng `OUTPUT INTO`). Lỗi: *"The target table 'ProductVariant' of the DML statement cannot have any enabled triggers..."*

**Giải pháp**: Thay `OUTPUT INSERTED.VariantId` bằng `SELECT SCOPE_IDENTITY()`. Và vì trigger đã tạo InventoryStock với qty = 0, muốn set tồn kho ban đầu > 0 thì dùng UPDATE thay vì INSERT (tránh duplicate key).

---

## Seed Data & Migration Order

Trigger nằm ở migration `004`, nhưng seed data tạo ProductVariant ở migration `002`. Kết quả: variant từ seed data không có InventoryStock — tồn kho trống.

**Giải pháp**: Thêm INSERT InventoryStock ở cuối `002` với qty mặc định = 10, kèm `NOT EXISTS` để không xung đột nếu trigger chạy trước:
```sql
INSERT INTO InventoryStock (VariantId, LocationId, QuantityOnHand, QuantityReserved)
SELECT pv.VariantId, 1, 10, 0
FROM ProductVariant pv
WHERE NOT EXISTS (
    SELECT 1 FROM InventoryStock ist
    WHERE ist.VariantId = pv.VariantId AND ist.LocationId = 1
);
```

### Migration Tracking

Hệ thống sử dụng bảng `_MigrationHistory` để theo dõi migration đã apply. Mỗi file `.sql` chỉ chạy đúng 1 lần, dừng ngay khi gặp lỗi.

| Migration | Mục đích |
|---|---|
| `001_init_schema.sql` | Tạo toàn bộ bảng, PK, FK, unique constraints |
| `002_seed_data.sql` | Seed brands, categories, 10 products, variants, location, inventory |
| `003_enable_snapshot_isolation.sql` | Bật `ALLOW_SNAPSHOT_ISOLATION` |
| `004_add_validation_constraints.sql` | CHECK constraints + trigger |
| `005_inline_customer_on_invoice.sql` | Inline customer lên SalesInvoice, xóa bảng Customer |

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
