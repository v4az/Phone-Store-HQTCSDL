# Phase 02 — Add DB Objects (UDF + View + Index + User + Audit)

## Context Links
- `plans/reports/scout-260501-1144-schema-inventory.md` — confirms 0 UDF / 0 view / 0 NC index
- `database/migrations/004_add_validation_constraints.sql` — pattern cho migration mới

## Overview
- **Priority:** P0
- **Status:** pending
- **Description:** Hai migration mới:
  - `006_add_views_functions_indexes.sql` — 2 UDF + 3 view + 5 NC index
  - `007_add_user_and_audit.sql` — `AppUser`, `AuditLog`, audit triggers (mô phỏng hệ thống thực tế có user)

## Key Insights
- "Hệ thống thực tế có user" → cần entity `AppUser` (admin/manager/staff), audit trail (ai sửa, sửa khi nào, sửa gì), trigger audit log.
- Hệ thống hiện push tất cả business logic ra service layer — đó là lý do trước đây không cần UDF/view. Báo cáo phải nêu trade-off này (testability vs SQL-side compute).
- View không index (non-materialized) chỉ là syntactic sugar — nhưng giúp query app gọn, ít JOIN ở TS code.
- NC index trade-off: nhanh đọc, chậm ghi (mỗi INSERT/UPDATE phải maintain index). Phải biện minh từng index.
- Audit trigger trade-off: tự động + không thể bypass từ app vs overhead mỗi UPDATE/DELETE; lưu OldValue/NewValue dạng JSON trong NVARCHAR(MAX).

## Requirements

### Functions (UDF)

**1. `fn_GetAvailableStock(@VariantId, @LocationId)` → INT**
- Trả `QuantityOnHand - QuantityReserved` (= "có thể bán ngay").
- Inline scalar UDF (`WITH SCHEMABINDING` để tối ưu) — SQL Server 2019+ auto-inline.
- Use case: hiển thị "available" trên UI thay vì tính ở app.

**2. `fn_GetProductDisplayName(@VariantId)` → NVARCHAR(400)**
- Trả `'<ProductName> - <Color> / <Storage>'` (concat, NULL-safe với ISNULL).
- Use case: dropdown variant chọn nhanh trong sales screen.

### Views

**1. `vw_ProductCatalog`**
- JOIN `Product + Brand + Category + ProductVariant` + tổng `SUM(QuantityOnHand)` từ InventoryStock.
- Cột: ProductId, ProductCode, ProductName, BrandName, CategoryName, VariantCount, TotalStock, MinPrice, MaxPrice.
- Use case: trang `/products` chỉ `SELECT * FROM vw_ProductCatalog WHERE IsActive=1`.

**2. `vw_InventoryByLocation`**
- JOIN `InventoryStock + ProductVariant + Product + InventoryLocation`.
- Cột: LocationId, LocationName, ProductName, Sku, Color, Storage, QuantityOnHand, QuantityReserved, AvailableQty (= dbo.fn_GetAvailableStock).
- Use case: trang `/inventory` thay raw query trong api route.

**3. `vw_DailySalesSummary`**
- GROUP BY CAST(InvoiceDate AS DATE).
- Cột: SaleDate, InvoiceCount, TotalRevenue, TotalDiscount, FinalRevenue.
- Use case: simplify `getDailySales()` trong service.

### Indexes (NC)

| Index | Bảng | Cột + INCLUDE | Use case | Trade-off |
|---|---|---|---|---|
| `IX_SalesInvoice_InvoiceDate` | SalesInvoice | InvoiceDate ASC INCLUDE (FinalAmount, TotalAmount, DiscountAmount) | report aggregates by date | thêm 1 NC; chậm 5-10% INSERT (chấp nhận được) |
| `IX_SalesInvoice_CustomerPhone` | SalesInvoice | CustomerPhone (filtered WHERE CustomerPhone IS NOT NULL) | tra cứu lịch sử khách qua SĐT | filtered → bé, chỉ cover khi có phone |
| `IX_ProductVariant_ProductId` | ProductVariant | ProductId | mọi product detail page (FK lookup) | 1 row mỗi variant — overhead nhỏ |
| `IX_InventoryStock_LocationId` | InventoryStock | LocationId INCLUDE (QuantityOnHand, QuantityReserved) | tồn kho theo kho | composite PK (Variant,Location) đã có nhưng leading col là Variant — query theo Location dùng index mới |
| `IX_SalesInvoiceLine_VariantId` | SalesInvoiceLine | VariantId | sales history cho 1 variant | hữu ích cho báo cáo top-seller |

### User & Audit (migration 007)

**Table `AppUser`** — entity người dùng hệ thống:

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| UserId | INT IDENTITY | PK |
| Username | NVARCHAR(50) | UNIQUE NOT NULL |
| FullName | NVARCHAR(100) | NOT NULL |
| Role | NVARCHAR(20) | CHECK Role IN ('admin','manager','staff') |
| IsActive | BIT | DEFAULT 1 |
| CreatedAt | DATETIME | DEFAULT GETDATE() |

Note: không lưu password trong scope này (auth là app-layer, ngoài scope báo cáo CSDL). Username + FullName + Role đủ minh hoạ user attribution.

**Table `AuditLog`** — log thay đổi entity quan trọng:

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| AuditId | BIGINT IDENTITY | PK |
| TableName | NVARCHAR(100) | NOT NULL |
| RecordId | NVARCHAR(100) | NOT NULL (string để hỗ trợ composite key) |
| Action | NVARCHAR(20) | CHECK Action IN ('INSERT','UPDATE','DELETE') |
| OldValue | NVARCHAR(MAX) | NULL — JSON snapshot row cũ |
| NewValue | NVARCHAR(MAX) | NULL — JSON snapshot row mới |
| ChangedAt | DATETIME | DEFAULT GETDATE() |
| ChangedByUserId | INT | NULL FK → AppUser (NULL cho system action) |

**Index** `IX_AuditLog_Table_Time` ON AuditLog(TableName, ChangedAt DESC) — tra cứu lịch sử nhanh theo bảng + thời gian.

**Triggers (mới)**:

| Tên | Bảng | Event | Mục đích |
|---|---|---|---|
| `TR_SalesInvoice_AfterUpdate_AuditLog` | SalesInvoice | AFTER UPDATE | Insert AuditLog với OldValue (JSON từ DELETED), NewValue (JSON từ INSERTED) |
| `TR_SalesInvoice_AfterDelete_AuditLog` | SalesInvoice | AFTER DELETE | Insert AuditLog với OldValue, Action='DELETE' |
| `TR_Product_AfterUpdate_AuditLog` | Product | AFTER UPDATE | Tương tự, log thay đổi sản phẩm (giá, mô tả, IsActive) |

Trigger dùng `FOR XML PATH` hoặc `FOR JSON PATH` để serialize INSERTED/DELETED thành JSON — **chọn `FOR JSON AUTO`** vì SQL Server 2016+ hỗ trợ trực tiếp, dễ đọc.

**Seed users (migration 002 hoặc 007 cuối):**
```sql
INSERT INTO AppUser (Username, FullName, Role) VALUES
  (N'admin', N'Quản trị viên', N'admin'),
  (N'manager01', N'Trần Quản Lý', N'manager'),
  (N'staff01', N'Nguyễn Nhân Viên', N'staff');
```

**Trade-off chính (báo cáo Ch.7)**:
- Trigger AuditLog **không thể bypass** từ app layer — nhân viên không thể "sửa lén" (DBA-only override).
- Cost: mỗi UPDATE thêm 1 INSERT vào AuditLog → tăng I/O ~5-15%.
- Alternative considered: temporal table (SQL Server 2016+) — auto track history. Trade-off: temporal table tự lưu mọi version, tốn storage hơn; không lưu được `ChangedByUserId` mà không tự custom.

## Architecture

**Migration `006_add_views_functions_indexes.sql`** — 1 file duy nhất, chia 3 section: FUNCTIONS, VIEWS, INDEXES. Mỗi object guard bằng `IF OBJECT_ID(...) IS NOT NULL DROP …; GO` để re-run được.

**Migration `007_add_user_and_audit.sql`** — chia 4 section: TABLES (AppUser, AuditLog), SEED USERS, TRIGGERS (audit log triggers).

Thứ tự: 006 chạy trước (views có thể tham chiếu UDF), 007 độc lập.

## Related Code Files

**Create:**
- `database/migrations/006_add_views_functions_indexes.sql`
- `database/migrations/007_add_user_and_audit.sql`

**Modify:** none (migration tự áp khi container restart).

**Read:**
- `database/init-db.sh` — verify migration runner pattern (alphabetical order)

## Implementation Steps

### Migration 006

1. Tạo file `database/migrations/006_add_views_functions_indexes.sql`.
2. Section A — UDFs:
   - DROP IF EXISTS `dbo.fn_GetAvailableStock`, recreate (WITH SCHEMABINDING).
   - DROP IF EXISTS `dbo.fn_GetProductDisplayName`, recreate.
3. Section B — Views (sau UDFs vì view có thể tham chiếu UDF):
   - DROP/CREATE `dbo.vw_ProductCatalog`, `dbo.vw_InventoryByLocation`, `dbo.vw_DailySalesSummary`.
4. Section C — NC Indexes (5 indexes; mỗi index guard bằng `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=…)`).

### Migration 007

5. Tạo file `database/migrations/007_add_user_and_audit.sql`.
6. Section A — Tables: `AppUser`, `AuditLog` + `IX_AuditLog_Table_Time`.
7. Section B — Seed: 3 user mẫu (admin, manager01, staff01).
8. Section C — Triggers:
   - `TR_SalesInvoice_AfterUpdate_AuditLog` — dùng `FOR JSON AUTO` để serialize INSERTED/DELETED.
   - `TR_SalesInvoice_AfterDelete_AuditLog`.
   - `TR_Product_AfterUpdate_AuditLog`.

### Apply & verify

9. Restart container: `docker compose down -v && docker compose up -d --build`.
10. Verify migration history:
    ```sql
    SELECT * FROM _MigrationHistory ORDER BY AppliedAt;  -- expect 007 files
    ```
11. Verify objects:
    ```sql
    SELECT name, type_desc FROM sys.objects WHERE is_ms_shipped=0 AND type IN ('FN','IF','TF','V','U','TR') ORDER BY type, name;
    SELECT t.name AS table_name, i.name AS index_name FROM sys.indexes i JOIN sys.tables t ON i.object_id=t.object_id WHERE i.is_primary_key=0 AND i.is_unique_constraint=0;
    ```
    Kỳ vọng: 2 UDF, 3 view, 6 NC index (5 từ 006 + 1 từ 007), 4 trigger (1 cũ + 3 mới), 13 user table (11 cũ + AppUser + AuditLog).
12. Smoke:
    ```sql
    SELECT TOP 5 * FROM vw_ProductCatalog;
    SELECT dbo.fn_GetAvailableStock(1,1);
    SELECT dbo.fn_GetProductDisplayName(1);
    SELECT * FROM AppUser;
    -- Trigger smoke: update an invoice, expect 1 row in AuditLog
    UPDATE SalesInvoice SET CustomerName = N'Audit test' WHERE InvoiceId = 1;
    SELECT TOP 1 * FROM AuditLog ORDER BY AuditId DESC;
    ```

## Todo
- [ ] Tạo migration 006 với 3 section (UDF / view / index)
- [ ] Tạo migration 007 với 3 section (table / seed / trigger)
- [ ] Restart container, verify cả 2 migration applied
- [ ] Verify object inventory: 2 UDF + 3 view + 6 NC index + 4 trigger + 2 table mới
- [ ] Smoke test từng object (gồm trigger AuditLog: UPDATE → row mới trong AuditLog)

## Success Criteria
- Migration 006, 007 trong `_MigrationHistory`.
- Smoke query trả đúng.
- AppUser có 3 row seed.
- Trigger AuditLog tạo entry khi UPDATE/DELETE SalesInvoice.

## Risk
| Rủi ro | Giảm thiểu |
|---|---|
| `fn_GetAvailableStock` dùng trong view → dependency phải tạo UDF trước | Order trong file: FN → VIEW → INDEX |
| `fn_GetProductDisplayName` scalar UDF → có thể chậm khi gọi trong WHERE/SELECT bảng lớn | Mark `WITH SCHEMABINDING` để inline; báo cáo nêu trade-off scalar UDF vs view |
| NC index ảnh hưởng INSERT/UPDATE | Chỉ thêm 5 index có justification rõ; báo cáo trade-off đầy đủ |
| `IX_SalesInvoice_CustomerPhone` filtered → cần version SQL Server hỗ trợ | SQL 2008+ có sẵn; OK |
| `vw_DailySalesSummary` GROUP BY CAST(date) → SARGABLE? | OK vì view không index; chỉ là syntactic. Nếu cần materialize thì tạo indexed view (out of scope) |

## Security
- UDF/view không expose data ngoài quyền user hiện tại.
- Không có dynamic SQL.

## Next
→ Phase 03: sửa 3 gap service layer để dùng object mới.
