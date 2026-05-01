# Báo cáo Cơ sở dữ liệu — Hệ thống Quản lý Cửa hàng Điện thoại & Phụ kiện

> **Stack:** Next.js (App Router) · TypeScript · `mssql` driver · SQL Server 2022 · Docker
> **Database:** `csdl` · default isolation level `READ COMMITTED` · `ALLOW_SNAPSHOT_ISOLATION ON`
> **Repo:** `Phone-Store-HQTCSDL`

---

## Mục lục

1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Mô hình thực thể (Entity)](#2-mô-hình-thực-thể-entity)
3. [Bảng (Table) & lược đồ chi tiết](#3-bảng-table--lược-đồ-chi-tiết)
4. [Quan hệ (Relationship) & ER diagram](#4-quan-hệ-relationship--er-diagram)
5. [Ràng buộc (Constraint)](#5-ràng-buộc-constraint)
6. [Index](#6-index)
7. [Trigger](#7-trigger)
8. [Function (UDF)](#8-function-udf)
9. [View](#9-view)
10. [Transaction (theo service)](#10-transaction-theo-service)
11. [Concurrency: 5 vấn đề + Demo + Fix](#11-concurrency-5-vấn-đề--demo--fix)
12. [Trade-off matrix & kết luận](#12-trade-off-matrix--kết-luận)

---

## 1. Tổng quan hệ thống

### 1.1 Bối cảnh nghiệp vụ

Cửa hàng bán **điện thoại** và **phụ kiện** (case, sạc, tai nghe, …). Yêu cầu:

- Quản lý danh mục sản phẩm theo **brand** (Apple, Samsung, …) và **category** phân cấp (Phones, Accessories → Cases / Chargers / …).
- Mỗi sản phẩm có nhiều **biến thể** (variant) khác nhau về **màu**, **dung lượng**, giá vốn, giá bán.
- **Tồn kho** quản lý theo cặp `(variant, location)` — cùng 1 SKU có thể nằm ở nhiều kho.
- Nghiệp vụ **bán hàng**: lập hoá đơn nhiều dòng, mỗi dòng gắn với 1 variant; trừ tồn kho ngay khi commit.
- Nghiệp vụ **nhập hàng**: đặt hàng từ nhà cung cấp.
- **Báo cáo doanh thu**: theo ngày / tuần / tháng / quý / năm; dashboard tổng hợp 4 dải thời gian đồng nhất.
- **User & audit**: có nhiều nhân viên (admin / manager / staff); thay đổi quan trọng (sửa hoá đơn, xóa hoá đơn, đổi giá sản phẩm) phải được **audit log** tự động bởi DB.

### 1.2 Stack & lý do chọn SQL Server

| Tầng | Công nghệ | Lý do |
|---|---|---|
| Frontend | Next.js 16 + React 19 + Ant Design | App Router cho routing/SSR đơn giản, AntD cho UI nghiệp vụ nhanh |
| Backend | Next.js API Routes + service layer (TS) | Co-location frontend/backend, ít moving parts cho project học thuật |
| Driver | `mssql` (node-mssql) | Native SQL Server, hỗ trợ tx/lock hint chuẩn |
| DB | SQL Server 2022 (Docker) | Hỗ trợ đầy đủ: SNAPSHOT isolation, FOR JSON, scalar UDF inlining, filtered index, computed PK column |

**Trade-off vs PostgreSQL/MySQL**: SQL Server có hint `WITH (UPDLOCK)` rõ ràng, syntax `OUTPUT INSERTED.*` cho insert→return-id, isolation level `SNAPSHOT` mature từ 2005. Phù hợp môn học CSDL minh hoạ concurrency.

### 1.3 Kiến trúc tầng

```
┌─────────────────────────────────────────┐
│  UI (Next.js pages, AntD components)    │
└───────────────┬─────────────────────────┘
                │
┌───────────────▼─────────────────────────┐
│  API Routes (thin, no SQL)              │
│  app/api/**/route.ts                    │
└───────────────┬─────────────────────────┘
                │ chỉ gọi service
┌───────────────▼─────────────────────────┐
│  Service layer (transaction boundary)   │
│  lib/services/*.ts                      │
│  - tx.begin / tx.commit / tx.rollback   │
│  - WITH (UPDLOCK) hints                 │
│  - Atomic UPDATE                        │
└───────────────┬─────────────────────────┘
                │ ADO.NET / TDS
┌───────────────▼─────────────────────────┐
│  SQL Server                             │
│  - Tables / FK / CHECK / UNIQUE         │
│  - Triggers (audit + invariant)         │
│  - UDF / View / Index                   │
└─────────────────────────────────────────┘
```

### 1.4 Migration & versioning

7 migration files (thứ tự alphabet, mỗi file chạy 1 lần qua `_MigrationHistory`):

| File | Mục đích |
|---|---|
| `001_init_schema.sql` | 11 bảng nghiệp vụ + PK/FK/UNIQUE |
| `002_seed_data.sql` | Brands, categories, 10 sản phẩm, variants, location, stock=10 |
| `003_enable_snapshot_isolation.sql` | `ALLOW_SNAPSHOT_ISOLATION ON` |
| `004_add_validation_constraints.sql` | 10 CHECK constraints + trigger `TR_ProductVariant_AfterInsert` |
| `005_inline_customer_on_invoice.sql` | Drop bảng Customer, inline `CustomerName`/`CustomerPhone` lên SalesInvoice |
| `006_add_views_functions_indexes.sql` | 2 UDF + 3 view + 5 NC index |
| `007_add_user_and_audit.sql` | `AppUser` + `AuditLog` + 3 audit trigger |

---

## 2. Mô hình thực thể (Entity)

Tổng cộng **13 entity** (bảng người dùng, không tính `_MigrationHistory`):

| # | Entity | Vai trò nghiệp vụ |
|---|---|---|
| 1 | **Brand** | Thương hiệu (Apple, Samsung, Xiaomi, …) |
| 2 | **Category** | Danh mục phân cấp (self-ref) — Phones, Accessories→Cases/Chargers |
| 3 | **Product** | Sản phẩm "logic" (vd: iPhone 15 Pro Max) |
| 4 | **ProductVariant** | Biến thể bán được (vd: iPhone 15 Pro Max — Titan / 256GB) |
| 5 | **InventoryLocation** | Kho hàng (Kho trung tâm, Chi nhánh 1, …) |
| 6 | **InventoryStock** | Tồn kho theo cặp (Variant × Location) — bảng giao N:M |
| 7 | **Supplier** | Nhà cung cấp |
| 8 | **PurchaseOrder** | Đơn nhập hàng (header) |
| 9 | **PurchaseOrderLine** | Chi tiết đơn nhập (1 dòng = 1 variant + qty + cost) |
| 10 | **SalesInvoice** | Hoá đơn bán (header, có inline customer info) |
| 11 | **SalesInvoiceLine** | Chi tiết hoá đơn bán (1 dòng = 1 variant + qty + price) |
| 12 | **AppUser** | Người dùng hệ thống (admin / manager / staff) |
| 13 | **AuditLog** | Log thay đổi hoá đơn / sản phẩm (auto bởi trigger) |

### 2.1 Lý do "logic vs variant"

Tách `Product` ra `ProductVariant`:
- **Product** = thông tin cho marketing (tên hiển thị, brand, category, mô tả, bảo hành).
- **ProductVariant** = đơn vị bán thực tế (SKU, màu, dung lượng, giá vốn, giá bán).

Ví dụ: 1 `Product` "iPhone 15 Pro Max" có 9 `ProductVariant` (3 màu × 3 dung lượng). Tồn kho, giá, hoá đơn đều **tham chiếu variant** chứ không phải product.

**Trade-off**: phức tạp hơn nhưng mô tả thực tế bán lẻ chính xác. Nếu bỏ variant, phải lặp Product cho mỗi (màu, dung lượng) → vi phạm DRY ở data.

### 2.2 Lý do "inline customer trên SalesInvoice"

Migration `005` đã bỏ bảng `Customer`. Lý do:

- Cửa hàng bán lẻ — phần lớn khách **không quay lại**. Bảng Customer riêng làm nặng schema mà ít giá trị.
- Khi cần lịch sử khách: tra qua **`CustomerPhone`** (filtered index ở Ch.6).
- Đơn giản, ít FK, dễ mở rộng sau (nếu cần CRM thật, restore bảng Customer).

Trade-off: nếu khách thay tên/số, lịch sử cũ giữ giá trị tại thời điểm bán (đúng nghiệp vụ kế toán).

### 2.3 Lý do `AppUser` & `AuditLog` (migration 007)

Mô phỏng hệ thống thực tế có nhiều user. `AppUser` lưu danh sách nhân viên + role; `AuditLog` ghi lại mọi thay đổi quan trọng (sửa giá, sửa hoá đơn, xóa). Chi tiết Ch.7.

---

## 3. Bảng (Table) & lược đồ chi tiết

### 3.1 Brand

| Cột | Kiểu | Null | Default | Mô tả |
|---|---|---|---|---|
| `BrandId` | INT IDENTITY(1,1) | ✗ | — | PK surrogate |
| `BrandName` | NVARCHAR(100) | ✗ | — | UNIQUE — "Apple", "Samsung" |
| `Country` | NVARCHAR(100) | ✓ | — | Xuất xứ |
| `IsActive` | BIT | ✗ | 1 | Soft-delete flag |

### 3.2 Category

| Cột | Kiểu | Null | Default | Mô tả |
|---|---|---|---|---|
| `CategoryId` | INT IDENTITY | ✗ | — | PK |
| `CategoryName` | NVARCHAR(100) | ✗ | — | "Phones", "Cases", … |
| `ParentCategoryId` | INT | ✓ | NULL | Self-ref FK; NULL = gốc |
| `IsActive` | BIT | ✗ | 1 | |

### 3.3 Product

| Cột | Kiểu | Null | Default | Mô tả |
|---|---|---|---|---|
| `ProductId` | INT IDENTITY | ✗ | — | PK |
| `ProductCode` | NVARCHAR(50) | ✗ | — | UNIQUE — mã nội bộ |
| `ProductName` | NVARCHAR(200) | ✗ | — | Tên hiển thị |
| `BrandId` | INT | ✗ | — | FK → Brand |
| `CategoryId` | INT | ✗ | — | FK → Category |
| `WarrantyMonths` | INT | ✗ | 0 | CHECK ≥ 0 |
| `Description` | NVARCHAR(500) | ✓ | — | |
| `IsActive` | BIT | ✗ | 1 | |

### 3.4 ProductVariant

| Cột | Kiểu | Null | Default | Mô tả |
|---|---|---|---|---|
| `VariantId` | INT IDENTITY | ✗ | — | PK |
| `ProductId` | INT | ✗ | — | FK → Product |
| `Sku` | NVARCHAR(50) | ✗ | — | UNIQUE — mã đơn vị bán |
| `Color` | NVARCHAR(50) | ✓ | — | "Titan", "Đen", … |
| `Storage` | NVARCHAR(20) | ✓ | — | "128GB", "256GB", … |
| `OtherAttributes` | NVARCHAR(500) | ✓ | — | JSON tự do (RAM, …) |
| `ImageUrl` | NVARCHAR(500) | ✓ | — | |
| `CostPrice` | DECIMAL(18,2) | ✗ | 0 | CHECK ≥ 0 |
| `RetailPrice` | DECIMAL(18,2) | ✗ | 0 | CHECK ≥ 0 |
| `IsActive` | BIT | ✗ | 1 | |

### 3.5 InventoryLocation

| Cột | Kiểu | Null | Mô tả |
|---|---|---|---|
| `LocationId` | INT IDENTITY | ✗ | PK |
| `LocationName` | NVARCHAR(100) | ✗ | "Kho TT", "CN1", … |
| `Address` | NVARCHAR(300) | ✓ | |

### 3.6 InventoryStock — bảng giao N:M

| Cột | Kiểu | Null | Default | Mô tả |
|---|---|---|---|---|
| `VariantId` | INT | ✗ | — | PK part 1, FK → ProductVariant |
| `LocationId` | INT | ✗ | — | PK part 2, FK → InventoryLocation |
| `QuantityOnHand` | INT | ✗ | 0 | CHECK ≥ 0 — số có thật |
| `QuantityReserved` | INT | ✗ | 0 | CHECK ≥ 0 — đã đặt nhưng chưa bán |

**Available = OnHand − Reserved** (xem `fn_GetAvailableStock` Ch.8).

### 3.7 Supplier

| Cột | Kiểu | Null | Mô tả |
|---|---|---|---|
| `SupplierId` | INT IDENTITY | ✗ | PK |
| `Name` | NVARCHAR(200) | ✗ | |
| `Phone` | NVARCHAR(20) | ✓ | |
| `Address` | NVARCHAR(300) | ✓ | |
| `IsActive` | BIT | ✗ | DEFAULT 1 |

### 3.8 PurchaseOrder & PurchaseOrderLine

PurchaseOrder header:

| Cột | Kiểu | Mô tả |
|---|---|---|
| `PurchaseId` | INT IDENTITY PK | |
| `SupplierId` | INT NOT NULL FK | → Supplier |
| `PurchaseDate` | DATETIME DEFAULT GETDATE() | |
| `Note` | NVARCHAR(500) | |
| `TotalAmount` | DECIMAL(18,2) DEFAULT 0 | |
| `CreatedBy` | NVARCHAR(100) | (sẽ chuyển FK→AppUser ở future work) |

PurchaseOrderLine — composite PK (PurchaseId, [LineNo]):

| Cột | Kiểu | Mô tả |
|---|---|---|
| `PurchaseId` | INT NOT NULL | PK part 1, FK → PurchaseOrder |
| `[LineNo]` | INT NOT NULL | PK part 2 — phải escape (reserved keyword) |
| `VariantId` | INT NOT NULL | FK → ProductVariant |
| `Quantity` | INT DEFAULT 0 | |
| `UnitCost` | DECIMAL(18,2) | |
| `LineTotal` | DECIMAL(18,2) | |

### 3.9 SalesInvoice (sau migration 005)

| Cột | Kiểu | Null | Default | Mô tả |
|---|---|---|---|---|
| `InvoiceId` | INT IDENTITY | ✗ | — | PK |
| `InvoiceCode` | NVARCHAR(50) | ✗ | — | UNIQUE |
| `InvoiceDate` | DATETIME | ✗ | GETDATE() | |
| `TotalAmount` | DECIMAL(18,2) | ✗ | 0 | CHECK ≥ 0 |
| `DiscountAmount` | DECIMAL(18,2) | ✗ | 0 | |
| `FinalAmount` | DECIMAL(18,2) | ✗ | 0 | CHECK ≥ 0 |
| `CreatedBy` | NVARCHAR(100) | ✓ | — | username (legacy) |
| `CustomerName` | NVARCHAR(200) | ✓ | — | inline (đã bỏ FK Customer) |
| `CustomerPhone` | NVARCHAR(20) | ✓ | — | inline |

### 3.10 SalesInvoiceLine — composite PK

| Cột | Kiểu | Mô tả |
|---|---|---|
| `InvoiceId` | INT NOT NULL FK → SalesInvoice | PK part 1 |
| `[LineNo]` | INT NOT NULL | PK part 2 — escape |
| `VariantId` | INT NOT NULL FK → ProductVariant | |
| `Quantity` | INT | CHECK > 0 |
| `UnitPrice` | DECIMAL(18,2) | CHECK ≥ 0 |
| `DiscountPct` | DECIMAL(5,2) | CHECK ∈ [0, 100] |
| `LineTotal` | DECIMAL(18,2) | |

### 3.11 AppUser (migration 007)

| Cột | Kiểu | Null | Default | Mô tả |
|---|---|---|---|---|
| `UserId` | INT IDENTITY | ✗ | — | PK |
| `Username` | NVARCHAR(50) | ✗ | — | UNIQUE |
| `FullName` | NVARCHAR(100) | ✗ | — | |
| `Role` | NVARCHAR(20) | ✗ | — | CHECK ∈ {admin, manager, staff} |
| `IsActive` | BIT | ✗ | 1 | |
| `CreatedAt` | DATETIME | ✗ | GETDATE() | |

**Seed data**: 3 user (`admin`, `manager01`, `staff01`).

### 3.12 AuditLog (migration 007)

| Cột | Kiểu | Null | Default | Mô tả |
|---|---|---|---|---|
| `AuditId` | BIGINT IDENTITY | ✗ | — | PK |
| `TableName` | NVARCHAR(100) | ✗ | — | "SalesInvoice", "Product" |
| `RecordId` | NVARCHAR(100) | ✗ | — | PK row đã đổi (string để hỗ trợ composite) |
| `Action` | NVARCHAR(20) | ✗ | — | CHECK ∈ {INSERT, UPDATE, DELETE} |
| `OldValue` | NVARCHAR(MAX) | ✓ | — | JSON snapshot row trước |
| `NewValue` | NVARCHAR(MAX) | ✓ | — | JSON snapshot row sau (NULL khi DELETE) |
| `ChangedAt` | DATETIME | ✗ | GETDATE() | |
| `ChangedByUserId` | INT | ✓ | NULL | FK → AppUser (NULL cho system action) |

---

## 4. Quan hệ (Relationship) & ER diagram

### 4.1 Phân loại quan hệ

**1:N (One-to-Many)** — phổ biến nhất:

| Parent | Child | Qua FK |
|---|---|---|
| Brand | Product | Product.BrandId |
| Category | Product | Product.CategoryId |
| Product | ProductVariant | ProductVariant.ProductId |
| InventoryLocation | InventoryStock | InventoryStock.LocationId |
| ProductVariant | InventoryStock | InventoryStock.VariantId |
| Supplier | PurchaseOrder | PurchaseOrder.SupplierId |
| PurchaseOrder | PurchaseOrderLine | PurchaseOrderLine.PurchaseId |
| ProductVariant | PurchaseOrderLine | PurchaseOrderLine.VariantId |
| SalesInvoice | SalesInvoiceLine | SalesInvoiceLine.InvoiceId |
| ProductVariant | SalesInvoiceLine | SalesInvoiceLine.VariantId |
| AppUser | AuditLog | AuditLog.ChangedByUserId |

**N:M (Many-to-Many)** — qua bảng giao:
- `ProductVariant ↔ InventoryLocation` qua **InventoryStock** (composite PK đảm bảo cặp duy nhất).

**Self-referencing**:
- `Category → Category` qua `ParentCategoryId`. NULL = gốc. Cho phép phân cấp danh mục đệ quy.

### 4.2 ER Diagram (Mermaid)

```mermaid
erDiagram
    Brand ||--o{ Product : "manufactures"
    Category ||--o{ Product : "classifies"
    Category ||--o{ Category : "parent_of"
    Product ||--o{ ProductVariant : "has"
    ProductVariant ||--o{ InventoryStock : "stocked_as"
    InventoryLocation ||--o{ InventoryStock : "stores"
    Supplier ||--o{ PurchaseOrder : "supplies"
    PurchaseOrder ||--o{ PurchaseOrderLine : "contains"
    ProductVariant ||--o{ PurchaseOrderLine : "sold_in"
    SalesInvoice ||--o{ SalesInvoiceLine : "contains"
    ProductVariant ||--o{ SalesInvoiceLine : "sold_in"
    AppUser ||--o{ AuditLog : "performs"

    Brand {
        int BrandId PK
        nvarchar BrandName UK
        bit IsActive
    }
    Category {
        int CategoryId PK
        int ParentCategoryId FK
        nvarchar CategoryName
    }
    Product {
        int ProductId PK
        nvarchar ProductCode UK
        int BrandId FK
        int CategoryId FK
        int WarrantyMonths
    }
    ProductVariant {
        int VariantId PK
        int ProductId FK
        nvarchar Sku UK
        nvarchar Color
        nvarchar Storage
        decimal CostPrice
        decimal RetailPrice
    }
    InventoryLocation {
        int LocationId PK
        nvarchar LocationName
    }
    InventoryStock {
        int VariantId PK_FK
        int LocationId PK_FK
        int QuantityOnHand
        int QuantityReserved
    }
    Supplier {
        int SupplierId PK
        nvarchar Name
    }
    PurchaseOrder {
        int PurchaseId PK
        int SupplierId FK
        datetime PurchaseDate
    }
    PurchaseOrderLine {
        int PurchaseId PK_FK
        int LineNo PK
        int VariantId FK
        int Quantity
    }
    SalesInvoice {
        int InvoiceId PK
        nvarchar InvoiceCode UK
        datetime InvoiceDate
        nvarchar CustomerName
        nvarchar CustomerPhone
        decimal FinalAmount
    }
    SalesInvoiceLine {
        int InvoiceId PK_FK
        int LineNo PK
        int VariantId FK
        int Quantity
        decimal UnitPrice
    }
    AppUser {
        int UserId PK
        nvarchar Username UK
        nvarchar Role
    }
    AuditLog {
        bigint AuditId PK
        nvarchar TableName
        nvarchar Action
        nvarchar OldValue
        nvarchar NewValue
        int ChangedByUserId FK
    }
```

### 4.3 ASCII fallback

```
Brand ──1:N──► Product ──1:N──► ProductVariant ──1:N──► SalesInvoiceLine
                  ▲                     │                        │
Category ──1:N────┘                     │                        ▼
   ▲                                    │                  SalesInvoice
   └─self─(ParentCategoryId)            ▼
                              InventoryStock ◄──1:N── InventoryLocation
                                        ▲
                                        │
                                        └── (composite PK, N:M)

Supplier ──1:N──► PurchaseOrder ──1:N──► PurchaseOrderLine ──FK──► ProductVariant

AppUser ──1:N──► AuditLog (ChangedByUserId)
```

### 4.4 Chiến lược khoá

| Loại | Áp dụng | Lý do |
|---|---|---|
| **Surrogate PK (IDENTITY)** | Brand, Category, Product, ProductVariant, Supplier, InventoryLocation, PurchaseOrder, SalesInvoice, AppUser, AuditLog | Tách biệt key kỹ thuật khỏi key nghiệp vụ, dễ refactor sau |
| **Composite PK** | InventoryStock (Variant, Location), SalesInvoiceLine (Invoice, [LineNo]), PurchaseOrderLine (Purchase, [LineNo]) | Đảm bảo tổ hợp duy nhất, không cần thêm cột thừa |
| **Natural-business UNIQUE** | ProductCode, Sku, InvoiceCode, BrandName, Username | Bảo vệ business rule "không trùng mã" |
| **Soft-delete `IsActive`** | Brand, Category, Product, ProductVariant, Supplier, AppUser | Giữ lịch sử, tránh vi phạm FK khi đã có giao dịch |

**Trade-off** Surrogate vs Natural PK: surrogate tốn 4 byte mỗi row nhưng đổi mã nghiệp vụ (ProductCode, Sku) không phải cascade FK toàn hệ thống → dễ bảo trì.

---

## 5. Ràng buộc (Constraint)

### 5.1 Tổng hợp

| Constraint | Bảng | Loại | Điều kiện | Tác dụng |
|---|---|---|---|---|
| `PK_Brand`, `PK_Category`, … | mọi bảng | PK | IDENTITY hoặc composite | Định danh duy nhất |
| `UQ_Product_Code` | Product | UNIQUE | ProductCode | Mã sản phẩm không trùng |
| `UQ_ProductVariant_Sku` | ProductVariant | UNIQUE | Sku | SKU không trùng toàn hệ thống |
| `UQ_SalesInvoice_Code` | SalesInvoice | UNIQUE | InvoiceCode | Mã hoá đơn không trùng |
| `FK_*` | tất cả FK columns | FK | tham chiếu | Toàn vẹn tham chiếu — không xoá brand nếu còn product |
| `CHK_Product_WarrantyMonths` | Product | CHECK | `WarrantyMonths >= 0` | Bảo hành không âm |
| `CHK_ProductVariant_CostPrice` | ProductVariant | CHECK | `CostPrice >= 0` | |
| `CHK_ProductVariant_RetailPrice` | ProductVariant | CHECK | `RetailPrice >= 0` | |
| `CHK_InventoryStock_QuantityOnHand` | InventoryStock | CHECK | `QuantityOnHand >= 0` | **Quan trọng** — chặn bán âm tại tầng DB |
| `CHK_InventoryStock_QuantityReserved` | InventoryStock | CHECK | `QuantityReserved >= 0` | |
| `CHK_SalesInvoiceLine_Quantity` | SalesInvoiceLine | CHECK | `Quantity > 0` | Không có dòng số 0 |
| `CHK_SalesInvoiceLine_UnitPrice` | SalesInvoiceLine | CHECK | `UnitPrice >= 0` | |
| `CHK_SalesInvoiceLine_DiscountPct` | SalesInvoiceLine | CHECK | `0 <= DiscountPct <= 100` | |
| `CHK_SalesInvoice_TotalAmount` | SalesInvoice | CHECK | `TotalAmount >= 0` | |
| `CHK_SalesInvoice_FinalAmount` | SalesInvoice | CHECK | `FinalAmount >= 0` | |
| `CHK_AppUser_Role` | AppUser | CHECK | `Role IN ('admin','manager','staff')` | Enum role tại DB |
| `CHK_AuditLog_Action` | AuditLog | CHECK | `Action IN ('INSERT','UPDATE','DELETE')` | Enum action |
| `FK_AuditLog_AppUser` | AuditLog | FK | ChangedByUserId → AppUser | |

### 5.2 Trade-off: ràng buộc DB-side vs app-side

| Khía cạnh | DB-side (CHECK/FK/UNIQUE) | App-side (TypeScript validate) |
|---|---|---|
| Bypass | **Không thể** — mọi client đều bị chặn | Bypass được (curl trực tiếp DB) |
| Performance | Có chi phí mỗi INSERT/UPDATE | Phụ thuộc app |
| Error message | Generic SQL error code | Tuỳ biến UX |
| Đồng bộ logic | Chỉ 1 nơi (DB) | Có thể lệch giữa client/server |
| Test | Khó test riêng | Dễ test unit |

**Quyết định của hệ thống**: dùng cả 2 tầng.
- **DB-side**: bảo vệ invariant (qty ≥ 0, price ≥ 0) — không bao giờ vi phạm dù app có bug.
- **App-side**: validate input UX (vd: SĐT format) trước khi gọi service — báo lỗi đẹp hơn cho user.

---

## 6. Index

### 6.1 Phân loại

| Loại | Bảng | Index | Tự động? |
|---|---|---|---|
| **Clustered (PK)** | mọi bảng | trên cột PK | Tự động khi PRIMARY KEY |
| **Unique non-clustered** | Brand, Product, ProductVariant, SalesInvoice, AppUser | từ UNIQUE constraint | Tự động |
| **Non-clustered (NC)** | 6 indexes (Ch.6.2-6.3) | tự định nghĩa | Manual (`CREATE INDEX`) |

SQL Server mặc định tạo **clustered index trên PK** — lưu data physically theo thứ tự PK. Bảng có composite PK (InventoryStock, SalesInvoiceLine, PurchaseOrderLine) → clustered index tổ hợp.

### 6.2 Non-clustered indexes (migration 006)

#### `IX_SalesInvoice_InvoiceDate`

```sql
CREATE NONCLUSTERED INDEX IX_SalesInvoice_InvoiceDate
    ON dbo.SalesInvoice(InvoiceDate)
    INCLUDE (FinalAmount, TotalAmount, DiscountAmount);
```

- **Tại sao**: report doanh thu (`getDailySales`, `getMonthlySales`, …) lọc/group theo `InvoiceDate`. Không có index → table scan toàn bộ SalesInvoice.
- **INCLUDE**: cover các cột SUM (FinalAmount, TotalAmount, DiscountAmount) → query lookup chỉ cần đọc index, không phải lookup clustered.
- **Cost**: mỗi INSERT vào SalesInvoice phải maintain thêm index node. Với traffic 100 hoá đơn/ngày → không đáng kể.

#### `IX_SalesInvoice_CustomerPhone` (filtered)

```sql
CREATE NONCLUSTERED INDEX IX_SalesInvoice_CustomerPhone
    ON dbo.SalesInvoice(CustomerPhone)
    WHERE CustomerPhone IS NOT NULL;
```

- **Tại sao**: tra cứu lịch sử khách qua SĐT (`SELECT * FROM SalesInvoice WHERE CustomerPhone = @phone`). Không có index → scan.
- **Filtered**: nhiều hoá đơn có CustomerPhone NULL (khách walk-in) → index chỉ chứa rows có phone, **kích thước nhỏ hơn 50-80%**.
- **Trade-off**: nếu sau này sửa SĐT từ NULL→có/ngược lại, index phải update entry.

#### `IX_ProductVariant_ProductId`

```sql
CREATE NONCLUSTERED INDEX IX_ProductVariant_ProductId
    ON dbo.ProductVariant(ProductId)
    INCLUDE (Sku, Color, Storage, RetailPrice, IsActive);
```

- **Tại sao**: trang product detail luôn `WHERE ProductId = @id` để lấy danh sách variants. FK ProductId không tự tạo index trong SQL Server → cần manual.
- **INCLUDE**: cover cột thường dùng (Sku, Color, Storage, RetailPrice) → query không cần lookup clustered.

#### `IX_InventoryStock_LocationId`

```sql
CREATE NONCLUSTERED INDEX IX_InventoryStock_LocationId
    ON dbo.InventoryStock(LocationId)
    INCLUDE (QuantityOnHand, QuantityReserved);
```

- **Tại sao**: composite PK (Variant, Location) — leading column là Variant. Query "tồn kho theo kho" (`WHERE LocationId = @loc`) **không dùng được clustered PK** → cần index riêng.

#### `IX_SalesInvoiceLine_VariantId`

```sql
CREATE NONCLUSTERED INDEX IX_SalesInvoiceLine_VariantId
    ON dbo.SalesInvoiceLine(VariantId)
    INCLUDE (Quantity, UnitPrice, LineTotal);
```

- **Tại sao**: report top-seller, sales history per variant.
- Cùng lý do FK VariantId không auto-index.

#### `IX_AuditLog_Table_Time` (migration 007)

```sql
CREATE NONCLUSTERED INDEX IX_AuditLog_Table_Time
    ON dbo.AuditLog(TableName, ChangedAt DESC)
    INCLUDE (RecordId, Action, ChangedByUserId);
```

- **Tại sao**: tra cứu lịch sử "10 lần sửa hoá đơn gần nhất" → composite (TableName, ChangedAt DESC) match đúng query.

### 6.3 Trade-off chung của Index

| Lợi ích | Chi phí |
|---|---|
| Đọc nhanh: O(log n) thay vì O(n) | Mỗi INSERT/UPDATE/DELETE phải maintain index |
| Cover query qua INCLUDE | Tốn dung lượng (~10-30% bảng) |
| Filtered index tiết kiệm size | Phức tạp khi WHERE clause của query không match filter expression |
| Composite covering index → 1 index, nhiều query | Order columns sai → index vô dụng |

**Quy tắc của hệ thống**:
- Không tạo index "phòng hờ". Mỗi index phải có query thực dùng.
- Cột FK ít selective → cân nhắc kỹ (vd: BrandId chỉ có 4-5 brand, không cần index riêng cho Product.BrandId nếu join chính ngược lại từ Brand).

### 6.4 Index không tạo (cố ý)

| Cột | Lý do skip |
|---|---|
| Product.BrandId | Cardinality thấp (4-5 brand). JOIN từ Brand → Product hiếm dùng `WHERE BrandId = @id`, dùng JOIN thông thường. |
| Product.CategoryId | Tương tự. Hơn nữa filter chính từ trang catalog dùng vw_ProductCatalog. |
| Brand.IsActive, Product.IsActive | Bool 2 trị → selectivity thấp; query thường có thêm điều kiện kết hợp. |

---

## 7. Trigger

### 7.1 `TR_ProductVariant_AfterInsert` (migration 004)

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

**Mục đích**: khi tạo variant mới, tự động tạo bản ghi `InventoryStock` (qty=0) cho **mọi kho** hiện có. Đảm bảo invariant *"mỗi (variant, location) đều có row InventoryStock"*.

**Vì sao chọn trigger?**
- Service `createProduct` có thể quên gọi insert InventoryStock → vi phạm invariant. Trigger đảm bảo **không thể quên**.
- Logic đơn giản, không cần input từ user.

**Hạn chế cần biết**:
- Bảng có trigger **không cho phép `OUTPUT INSERTED.*`** trong INSERT thông thường (SQL Server limitation). Trong service `createProduct` phải dùng `SCOPE_IDENTITY()` thay thế.
- Khi thêm `InventoryLocation` mới, các variant cũ KHÔNG tự có row stock. Phải chạy script bù hoặc thêm trigger trên InventoryLocation. Hiện hệ thống chỉ có 1 location nên đủ dùng.

### 7.2 `TR_SalesInvoice_AfterUpdate_AuditLog` (migration 007)

```sql
CREATE OR ALTER TRIGGER TR_SalesInvoice_AfterUpdate_AuditLog
ON SalesInvoice
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO AuditLog (TableName, RecordId, Action, OldValue, NewValue, ChangedByUserId)
    SELECT
        N'SalesInvoice',
        CAST(i.InvoiceId AS NVARCHAR(100)),
        N'UPDATE',
        (SELECT d2.* FROM deleted  d2 WHERE d2.InvoiceId = i.InvoiceId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        (SELECT i2.* FROM inserted i2 WHERE i2.InvoiceId = i.InvoiceId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        NULL
    FROM inserted i;
END;
```

**Mục đích**: log mỗi UPDATE trên SalesInvoice — lưu OldValue + NewValue dạng JSON.

**Vì sao chọn trigger?**
- **Không thể bypass** từ tầng app: dù admin gõ SQL trực tiếp, audit vẫn ghi.
- Atomic với transaction gốc: nếu rollback hoá đơn, log cũng rollback theo.

**Hạn chế**:
- `ChangedByUserId` = NULL trong scope hiện tại. Để populate, app phải set `CONTEXT_INFO` trước UPDATE và trigger đọc lại — chưa làm (out of scope).
- Mỗi UPDATE → 2 subquery `FOR JSON PATH` (deleted, inserted) → overhead I/O ~5-15%.

### 7.3 `TR_SalesInvoice_AfterDelete_AuditLog` (migration 007)

Tương tự 7.2 nhưng cho DELETE — chỉ ghi `OldValue`, `NewValue` = NULL, `Action = 'DELETE'`. Đảm bảo **không mất dấu vết** khi xoá hoá đơn.

### 7.4 `TR_Product_AfterUpdate_AuditLog` (migration 007)

Log thay đổi sản phẩm (giá, mô tả, soft-delete `IsActive = 0`, …). Pattern giống 7.2.

### 7.5 Trade-off Trigger vs Application Code vs Temporal Table

| Cơ chế | Ưu | Nhược |
|---|---|---|
| **Trigger** (ta chọn) | Không bypass, atomic với tx gốc, single source of truth | Khó debug, ẩn từ app dev, OUTPUT INSERTED limitation |
| **Application code** | Dễ test, dễ debug, tuỳ biến cao | Bypass được (admin chạy SQL trực tiếp); dễ quên gọi |
| **Temporal table** (SQL 2016+) | Built-in, tự lưu mọi version | Tốn dung lượng (~2× table), không lưu được `ChangedByUserId` mặc định, schema cố định không thể thêm metadata |

**Quyết định**: trigger AuditLog cho audit (mật/quan trọng). Logic nghiệp vụ phức tạp (vd: tính total invoice) giữ ở service layer cho dễ test.

---

## 8. Function (UDF)

### 8.1 `fn_GetAvailableStock(@VariantId, @LocationId)`

```sql
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
```

**Mục đích**: trả số lượng có thể bán = OnHand − Reserved.

**Use case**: hiển thị "available" trên trang variant detail thay vì để app tính.

**Vì sao `WITH SCHEMABINDING`?**
- SQL Server 2019+ **tự inline** scalar UDF nếu `SCHEMABINDING` (giống view). Nghĩa là khi UDF gọi trong SELECT/WHERE của bảng triệu rows, query optimizer thay UDF body trực tiếp vào query plan → nhanh ngang inline expression.
- Hạn chế: bảng tham chiếu (`InventoryStock`) **không thể `ALTER`** (đổi schema) cho đến khi DROP UDF. Khi cần migration → drop UDF, alter, recreate UDF.

### 8.2 `fn_GetProductDisplayName(@VariantId)`

```sql
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
```

**Mục đích**: tên hiển thị "iPhone 15 Pro Max - Titan / 256GB".

**Use case**: dropdown chọn variant trong sales screen.

**Tại sao NULL-safe**: nếu Color hoặc Storage NULL, `ISNULL(N' - ' + v.Color, N'')` evaluate `N' - ' + NULL = NULL` → bị thay bằng `''`.

### 8.3 Trade-off UDF vs Computed Column vs View vs Inline Expression

| Cơ chế | Áp dụng | Ưu | Nhược |
|---|---|---|---|
| **Inline scalar UDF + SCHEMABINDING** (ta chọn) | tính trên cặp (Variant, Location) hoặc qua JOIN | Dùng được trong SELECT/WHERE/ORDER BY; 2019+ tự inline | SCHEMABINDING khoá ALTER bảng |
| **Computed column** | tính trên 1 row của 1 bảng | Có thể PERSIST + index được | Không tính qua bảng khác (no JOIN) |
| **View** | tập hợp cột | Re-use, có index nếu indexed view | Không nhận parameter |
| **Inline expression** | nội tuyến trong query | Tối ưu nhất | Lặp code, vi phạm DRY |

`fn_GetAvailableStock` không thể là computed column (cần JOIN). View không nhận parameter. → UDF là lựa chọn đúng.

### 8.4 Lưu ý: KHÔNG dùng UDF trong view chính

`vw_InventoryByLocation` tính `AvailableQty` **inline** thay vì gọi `fn_GetAvailableStock`:

```sql
(s.QuantityOnHand - s.QuantityReserved) AS AvailableQty
```

**Lý do**: dù UDF được inline, dùng trực tiếp expression vẫn ổn định nhất cho query optimizer. Trong view dạng `SELECT *`, optimizer dễ tính cost. UDF trade-off là khi gọi từ application code (vd: `SELECT dbo.fn_GetAvailableStock(1,1)`), code TS gọn hơn.

---

## 9. View

### 9.1 `vw_ProductCatalog`

```sql
CREATE OR ALTER VIEW dbo.vw_ProductCatalog AS
SELECT
    p.ProductId, p.ProductCode, p.ProductName, p.WarrantyMonths, p.IsActive,
    b.BrandId, b.BrandName,
    c.CategoryId, c.CategoryName,
    COUNT(DISTINCT v.VariantId)        AS VariantCount,
    ISNULL(SUM(s.QuantityOnHand), 0)   AS TotalStock,
    MIN(v.RetailPrice)                 AS MinPrice,
    MAX(v.RetailPrice)                 AS MaxPrice
FROM dbo.Product p
LEFT JOIN dbo.Brand          b ON p.BrandId    = b.BrandId
LEFT JOIN dbo.Category       c ON p.CategoryId = c.CategoryId
LEFT JOIN dbo.ProductVariant v ON p.ProductId  = v.ProductId AND v.IsActive = 1
LEFT JOIN dbo.InventoryStock s ON v.VariantId  = s.VariantId
GROUP BY p.ProductId, p.ProductCode, p.ProductName, p.WarrantyMonths, p.IsActive,
         b.BrandId, b.BrandName, c.CategoryId, c.CategoryName;
```

**Use case**: trang `/products` chỉ cần `SELECT * FROM vw_ProductCatalog WHERE IsActive = 1`.

### 9.2 `vw_InventoryByLocation`

Đã xem code đầy đủ ở migration 006. Dùng cho trang `/inventory` (đã refactor `/api/inventory` route gọi qua service `getInventoryStockList` truy vấn view này).

### 9.3 `vw_DailySalesSummary`

```sql
CREATE OR ALTER VIEW dbo.vw_DailySalesSummary AS
SELECT
    CAST(InvoiceDate AS DATE) AS SaleDate,
    COUNT(*)                  AS InvoiceCount,
    SUM(TotalAmount)          AS TotalRevenue,
    SUM(DiscountAmount)       AS TotalDiscount,
    SUM(FinalAmount)          AS FinalRevenue
FROM dbo.SalesInvoice
GROUP BY CAST(InvoiceDate AS DATE);
```

**Use case**: dashboard daily report. Service `getDailySales` có thể gọi `SELECT * FROM vw_DailySalesSummary WHERE SaleDate >= @from` (không refactor lúc này — báo cáo ghi nhận để cải tiến tương lai).

### 9.4 Trade-off View vs Indexed View vs Stored Procedure

| Loại | Đặc điểm | Áp dụng |
|---|---|---|
| **Standard view** (ta dùng) | Syntactic sugar, không lưu data, mỗi query re-compute | Đọc ít, không hot-path |
| **Indexed view** (materialized) | Lưu kết quả, có index riêng | Đọc nhiều, ghi ít. Yêu cầu SCHEMABINDING + nhiều ràng buộc |
| **Stored procedure** | Nhận param, có thể chứa logic phức tạp | Nghiệp vụ phức tạp nhưng test khó |

Hệ thống dùng **standard view** vì:
1. Dữ liệu thay đổi liên tục (hoá đơn tạo mỗi ngày) → indexed view phải maintain mỗi insert → cost cao.
2. Service layer (TypeScript) đã đảm nhận business logic → không cần stored procedure.

### 9.5 Tại sao không có Indexed View

Để tạo indexed view trên `vw_DailySalesSummary` cần:
- `WITH SCHEMABINDING` + cột `COUNT_BIG(*)` thay COUNT(*) + nhiều ràng buộc khác.
- Mỗi INSERT/UPDATE/DELETE SalesInvoice → maintain index của view.

Trade-off chấp nhận: query daily report chạy 1-2 lần/ngày, không đáng phải materialize. Khi traffic tăng (>100k hoá đơn/ngày), cân nhắc lại.

---

## 10. Transaction (theo service)

Dưới đây là phân tích từng hàm service có dùng transaction. Cột "tại sao" giải thích trade-off chọn isolation/lock hint.

### 10.1 Tổng hợp

| File | Function | Tx? | Isolation | Lock hints | Vì sao |
|---|---|---|---|---|---|
| brands.ts | `updateBrand` | ✓ | RC default | — | Atomicity multi-statement (sau này thêm audit log) |
| categories.ts | `updateCategory` | ✓ | RC default | — | Tương tự |
| products.ts | `createProduct` | ✓ | RC default | — | INSERT Product + variants + (trigger seed stock) trong 1 atomic block |
| products.ts | `softDeleteProduct` | ✓ | RC default | **UPDLOCK** | Chống Dirty Write race với `updateProduct` |
| products.ts | `updateProduct` | ✓ | RC default | guard WHERE `IsActive=1` | Không update sản phẩm đã soft-delete |
| products.ts | `hardDeleteProduct` | ✓ | RC default | — | DELETE variants + product atomic |
| products.ts | `updateInventoryStock` | ✓ | RC default | — | Loop UPDATE atomic |
| sales.ts | `getInvoiceById` | ✓ | RC | — | Header + lines từ cùng snapshot (no torn read) |
| sales.ts | `createInvoice` | ✓ | RC | **UPDLOCK** + atomic UPDATE | Lost Update + Non-Repeatable Read prevention |
| report.ts | `getDashboardSales` | ✓ | **SNAPSHOT** | — | 4 query share cùng snapshot, không phantom |

### 10.2 `createInvoice` — case study chính

```typescript
const transaction = new sql.Transaction(pool);
try {
  await transaction.begin();

  // Phase 1: per-line, lock price + atomic stock deduct
  for (const line of invoice.Lines) {
    // (a) Lock price — chống Non-Repeatable Read
    const priceResult = await transaction.request()
      .input("variantId", sql.Int, line.VariantId)
      .query(`
        SELECT RetailPrice FROM ProductVariant WITH (UPDLOCK)
        WHERE VariantId = @variantId AND IsActive = 1
      `);
    const dbPrice = priceResult.recordset[0].RetailPrice;

    // (b) Atomic stock decrement — chống Lost Update
    const stockResult = await transaction.request()
      .input("qty", sql.Int, line.Quantity)
      .input("variantId", sql.Int, line.VariantId)
      .input("locationId", sql.Int, locationId)
      .query(`
        UPDATE InventoryStock
        SET QuantityOnHand = QuantityOnHand - @qty
        WHERE VariantId = @variantId
          AND LocationId = @locationId
          AND QuantityOnHand >= @qty
      `);
    if (stockResult.rowsAffected[0] === 0) {
      throw new InsufficientStockError(...);
    }
    // ... compute lineTotal from dbPrice ...
  }

  // Phase 2: insert header (compute totals from verified lines)
  // Phase 3: insert lines (fresh request mỗi vòng — tránh duplicate param bug)

  await transaction.commit();
} catch (e) {
  await transaction.rollback();
  throw e;
}
```

**Tại sao chọn từng cơ chế**:

| Cơ chế | Vấn đề chống | Alternative considered | Lý do chọn |
|---|---|---|---|
| `BEGIN TRANSACTION` | Atomicity multi-statement | autocommit | Cần all-or-nothing: nếu insert line lỗi giữa chừng, đã trừ stock không thể rollback ở autocommit |
| `WITH (UPDLOCK)` đọc giá | Non-Repeatable Read | `REPEATABLE READ` toàn tx | UPDLOCK chỉ khoá row cần thiết, không lock toàn bộ row khác. Hơn nữa REPEATABLE READ vẫn cho phép Phantom — không phải vấn đề ở đây nhưng tổng quát không tốt. |
| Atomic `UPDATE … - @qty WHERE … >= @qty` | Lost Update | "SELECT then UPDATE" + UPDLOCK | Atomic đơn giản hơn, ít round-trip, không cần read trước; guard `>= @qty` tự động reject khi không đủ stock |
| Default isolation `READ COMMITTED` | Dirty Read | nâng SERIALIZABLE | RC đã chặn Dirty Read; nâng cao hơn → blocking nhiều, throughput giảm |

### 10.3 `softDeleteProduct` — chống Dirty Write

```typescript
await transaction.begin();
// Lock row Product trước
await transaction.request()
  .input("productId", sql.Int, productId)
  .query(`SELECT ProductId FROM Product WITH (UPDLOCK) WHERE ProductId = @productId`);

// Sau đó soft delete
await transaction.request()
  .input("productId", sql.Int, productId)
  .query(`UPDATE Product SET IsActive = 0 WHERE ProductId = @productId`);
await transaction.request()
  .input("productId", sql.Int, productId)
  .query(`UPDATE ProductVariant SET IsActive = 0 WHERE ProductId = @productId`);

await transaction.commit();
```

**Kịch bản chống**: `softDeleteProduct(1)` chạy đồng thời với `updateProduct(1, {IsActive: 1})` → một transaction kích hoạt lại sản phẩm vừa bị xoá (xem Ch.11.2 demo).

**Tại sao UPDLOCK + guard `WHERE IsActive = 1` ở `updateProduct`**: 2 lớp bảo vệ — UPDLOCK serialize, guard ngăn ghi vào row đã soft-delete dù không lock được.

### 10.4 `getDashboardSales` — chống Phantom Read

```typescript
const transaction = new sql.Transaction(pool);
await transaction.begin(sql.ISOLATION_LEVEL.SNAPSHOT);

const [daily, weekly, monthly, yearly] = await Promise.all([
  getDailySales(today, today, transaction),
  getWeeklySales(...),
  getMonthlySales(...),
  getYearlySales(...)
]);

await transaction.commit();
```

4 query đồng thời cùng share `transaction` → cùng đọc 1 snapshot dữ liệu tại thời điểm `BEGIN TRANSACTION`. Hoá đơn mới insert giữa chừng KHÔNG hiển thị (snapshot cố định) → daily/weekly/monthly nhất quán.

**Vì sao SNAPSHOT thay vì SERIALIZABLE?**
- SERIALIZABLE lock cả range → block writers (nhân viên đang bán bị treo).
- SNAPSHOT dùng row versioning (lưu trong tempdb) → không block ai. Chi phí: thêm dung lượng tempdb cho mỗi UPDATE.

### 10.5 `getInvoiceById` (sau hardening)

```typescript
const transaction = new sql.Transaction(pool);
await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

const header = await transaction.request().input(...).query("SELECT … FROM SalesInvoice WHERE …");
const lines  = await transaction.request().input(...).query("SELECT … FROM SalesInvoiceLine …");

await transaction.commit();
return { ...header, Lines: lines };
```

Trước hardening: 2 query rời từ 2 connection → giữa chừng có thể có UPDATE. Sau: cùng 1 connection + transaction → consistent.

### 10.6 Trade-off: tx ở đâu, ai mở?

**Quy tắc của hệ thống**: tx **bắt đầu và kết thúc ở service**. API route KHÔNG mở tx, không dùng `sql.Transaction`.

| Lý do | Giải thích |
|---|---|
| Encapsulation | API route chỉ chuyển dữ liệu; logic transaction là chi tiết tầng service |
| Test | Dễ unit test service standalone, không cần mock route |
| Reuse | Service có thể được gọi từ background job, CLI script — không cần API |

---

## 11. Concurrency: 5 vấn đề + Demo + Fix

SQL Server mặc định `READ COMMITTED`. Bài tập môn học CSDL truyền thống nêu 4 anomalies (Dirty/Non-Repeatable/Lost/Phantom). Hệ thống thêm **Dirty Write** (5) vì nó là vấn đề thực tế của softDelete vs update race.

### 11.1 Dirty Read

**Định nghĩa**: đọc dữ liệu mà transaction khác CHƯA commit. Nếu transaction đó rollback → đọc được dữ liệu không bao giờ tồn tại.

**Kịch bản nghiệp vụ**:
- Nhân viên A nhập hàng (UPDATE InventoryStock + 5) → chưa commit (đang nhập note).
- Nhân viên B kiểm tra tồn → đọc được +5 → bán hàng dựa trên số chưa commit.
- A rollback → tồn quay về cũ → B đã bán vượt thực tế.

**Demo SQL** (cần `READ UNCOMMITTED` để reproduce):

```sql
-- Session 1: nhập hàng (chưa commit)
BEGIN TRANSACTION;
UPDATE InventoryStock SET QuantityOnHand = QuantityOnHand + 5
WHERE VariantId = 1 AND LocationId = 1;

-- Session 2: dirty read
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
SELECT QuantityOnHand FROM InventoryStock WHERE VariantId = 1 AND LocationId = 1;
-- Đọc được giá trị +5 dù chưa commit

-- Session 1: rollback
ROLLBACK;
-- Số tồn quay về cũ — Session 2 đã đọc số "ma"
```

**Fix**: giữ default `READ COMMITTED`. Hệ thống KHÔNG dùng `WITH (NOLOCK)` hay `READ UNCOMMITTED` ở bất kỳ đâu (đã verify trong audit). Session 2 sẽ **đợi** session 1 commit/rollback.

```sql
-- Safe: dùng default
SELECT QuantityOnHand FROM InventoryStock
WHERE VariantId = 1 AND LocationId = 1;
-- Block đến khi Session 1 hoàn tất → đọc đúng giá trị
```

**Trade-off**:
- `READ UNCOMMITTED` nhanh hơn nhưng nguy hiểm — chỉ dùng cho monitoring/log không quan trọng.
- `READ COMMITTED` đủ chặn dirty read mà ít blocking.

### 11.2 Dirty Write

**Định nghĩa**: 2 transaction cùng ghi 1 row khi row chưa commit. Trong PostgreSQL có thể xảy ra; SQL Server mặc định ngăn (X-lock blocking) nhưng race condition vẫn tồn tại ở mức **logic nghiệp vụ** giữa các bảng liên quan.

**Kịch bản nghiệp vụ** (race `softDeleteProduct` vs `updateProduct`):

```
T1 (softDelete):  UPDATE Product SET IsActive = 0 WHERE ProductId = 1
T1:               UPDATE ProductVariant SET IsActive = 0 WHERE ProductId = 1
                  -- T1 giữ X-lock cả 2 bảng

T2 (updateProduct): UPDATE Product SET IsActive = 1 WHERE ProductId = 1
                    -- chờ T1 xong (default RC)

T1 COMMIT;
T2:               (proceeds) → Product.IsActive = 1
T2 COMMIT;

-- Kết quả: Product active, ProductVariant đã IsActive = 0 → trạng thái không nhất quán!
```

**Demo SQL** (cần 2 cửa sổ):

```sql
-- Session 1 — softDelete
BEGIN TRANSACTION;
SELECT ProductId FROM Product WITH (UPDLOCK) WHERE ProductId = 1;
UPDATE Product SET IsActive = 0 WHERE ProductId = 1;
UPDATE ProductVariant SET IsActive = 0 WHERE ProductId = 1;
-- chưa commit

-- Session 2 — updateProduct (BLOCKED bởi UPDLOCK của session 1)
BEGIN TRANSACTION;
UPDATE Product SET ProductName = N'New Name'
WHERE ProductId = 1 AND IsActive = 1;
-- ngay cả sau khi session 1 commit, IsActive = 0 → rowsAffected = 0
COMMIT;

-- Session 1
COMMIT;
-- Kết quả an toàn: T2 không kích hoạt lại được sản phẩm đã xoá
```

**Fix**: 2 lớp bảo vệ trong `softDeleteProduct` + `updateProduct`:

1. `softDeleteProduct`: `SELECT ProductId FROM Product WITH (UPDLOCK)` trước khi UPDATE → giữ X-lock toàn tx.
2. `updateProduct`: `WHERE ProductId = @id AND IsActive = 1` → guard ở chính UPDATE → không update được row đã soft-delete dù không có UPDLOCK.

**Trade-off**:
- 1 lớp guard `WHERE IsActive = 1` đủ trong nhiều trường hợp, nhưng UPDLOCK cộng thêm để serialize đúng order.
- Pessimistic locking → throughput thấp hơn optimistic versioning (vd: thêm cột RowVersion timestamp). Hệ thống nhỏ → chấp nhận được.

### 11.3 Non-Repeatable Read

**Định nghĩa**: trong cùng tx, đọc cùng row 2 lần được giá trị khác nhau.

**Kịch bản nghiệp vụ**:

```
T1 (createInvoice):  SELECT RetailPrice FROM ProductVariant WHERE VariantId = 1
                      -- đọc 22,990,000

T2 (manager):        UPDATE ProductVariant SET RetailPrice = 21,990,000 WHERE VariantId = 1
                      COMMIT;

T1:                  SELECT RetailPrice FROM ProductVariant WHERE VariantId = 1
                      -- đọc 21,990,000 — KHÁC lần đầu!
                      -- Hoá đơn 2 dòng cùng variant nhưng khác giá
```

**Demo SQL**:

```sql
-- Session 1
BEGIN TRANSACTION;
SELECT RetailPrice FROM ProductVariant WHERE VariantId = 1;
-- 22,990,000

-- Session 2
UPDATE ProductVariant SET RetailPrice = 21990000 WHERE VariantId = 1;
-- COMMIT ngay (không block)

-- Session 1
SELECT RetailPrice FROM ProductVariant WHERE VariantId = 1;
-- 21,990,000 — non-repeatable!
COMMIT;
```

**Fix**: dùng `WITH (UPDLOCK)` khi đọc giá trong `createInvoice`:

```sql
SELECT RetailPrice FROM ProductVariant WITH (UPDLOCK)
WHERE VariantId = @variantId AND IsActive = 1;
```

UPDLOCK giữ row đến hết transaction → manager (T2) `UPDATE … RetailPrice = …` bị **block** đến khi T1 commit.

**Alternative đã cân nhắc**:

| Cơ chế | Trade-off |
|---|---|
| `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ` | Lock toàn bộ row đã đọc trong tx — phạm vi rộng hơn cần thiết. UPDLOCK chỉ lock row cụ thể. |
| Read once + reuse trong app code | App phải bảo đảm không gọi lại; với invoice nhiều dòng dễ sót. UPDLOCK tự động giữ giá ổn định. |

### 11.4 Lost Update (nguy hiểm nhất)

**Định nghĩa**: 2 transaction cùng đọc giá trị, cùng tính giá trị mới, cùng ghi → ghi sau đè ghi trước → 1 update bị mất.

**Kịch bản nghiệp vụ**: 2 nhân viên cùng bán cùng variant (stock = 10).

```
NV A: SELECT QuantityOnHand → 10
NV B: SELECT QuantityOnHand → 10
NV B: UPDATE SET QuantityOnHand = 8 (10 - 2). COMMIT.
NV A: UPDATE SET QuantityOnHand = 9 (10 - 1). COMMIT.
-- Kết quả: 9. Đáng lẽ phải 7 (10 - 1 - 2). Lost update của B.
```

**Demo SQL** (cách SAI):

```sql
-- Session 1
BEGIN TRANSACTION;
SELECT QuantityOnHand FROM InventoryStock
WHERE VariantId = 1 AND LocationId = 1;
-- Đọc 10

-- Session 2
BEGIN TRANSACTION;
SELECT QuantityOnHand FROM InventoryStock WHERE VariantId = 1 AND LocationId = 1;
-- Cũng đọc 10
UPDATE InventoryStock SET QuantityOnHand = 8 WHERE VariantId = 1 AND LocationId = 1;
COMMIT;

-- Session 1
UPDATE InventoryStock SET QuantityOnHand = 9 WHERE VariantId = 1 AND LocationId = 1;
COMMIT;
-- Stock = 9 ❌ (đáng lẽ 7)
```

**Fix** (cách ĐÚNG — atomic UPDATE):

```sql
-- Cả 2 session
UPDATE InventoryStock
SET QuantityOnHand = QuantityOnHand - @qty
WHERE VariantId = @variantId
  AND LocationId = @locationId
  AND QuantityOnHand >= @qty;
```

**Demo fix**:

```sql
-- Setup
UPDATE InventoryStock SET QuantityOnHand = 10 WHERE VariantId = 1 AND LocationId = 1;

-- Session 1 (bán 3)
BEGIN TRANSACTION;
UPDATE InventoryStock
SET QuantityOnHand = QuantityOnHand - 3
WHERE VariantId = 1 AND LocationId = 1 AND QuantityOnHand >= 3;
-- rowsAffected = 1, stock = 7 (chưa commit, X-lock)

-- Session 2 (bán 5) — BLOCK chờ X-lock
BEGIN TRANSACTION;
UPDATE InventoryStock
SET QuantityOnHand = QuantityOnHand - 5
WHERE VariantId = 1 AND LocationId = 1 AND QuantityOnHand >= 5;

-- Session 1
COMMIT;
-- Session 2 proceed: đọc 7, trừ 5 → 2. rowsAffected = 1.
COMMIT;

SELECT QuantityOnHand FROM InventoryStock WHERE VariantId = 1 AND LocationId = 1;
-- 2 ✓ (10 - 3 - 5 = 2)
```

**Trade-off**: tại sao atomic UPDATE thay vì SELECT FOR UPDATE + UPDATE?

| Cơ chế | Pros | Cons |
|---|---|---|
| `UPDATE col = col - @v WHERE col >= @v` (ta dùng) | 1 round-trip, không cần app tính, guard inline | Nếu logic phức tạp hơn (vd: cần biết qty cũ để log) khó |
| SELECT WITH (UPDLOCK) + UPDATE | Có giá trị đọc cho app dùng | 2 round-trip, dễ deadlock |

**Bonus: kiểm tra insufficient stock**:

```sql
UPDATE InventoryStock SET QuantityOnHand = 2 WHERE VariantId = 1 AND LocationId = 1;
-- Bán 5 (không đủ)
UPDATE InventoryStock
SET QuantityOnHand = QuantityOnHand - 5
WHERE VariantId = 1 AND LocationId = 1 AND QuantityOnHand >= 5;
-- rowsAffected = 0 → service throw InsufficientStockError → API 409
```

### 11.5 Phantom Read

**Định nghĩa**: trong cùng tx, query 2 lần cho số dòng khác nhau (do INSERT/DELETE từ tx khác).

**Kịch bản nghiệp vụ**: dashboard report tính `COUNT/SUM` 4 dải thời gian (daily/weekly/monthly/yearly). Giữa các query, có hoá đơn mới được insert → daily count = 5, monthly count = 6 → không khớp.

**Demo SQL**:

```sql
-- Session 1 — dashboard report
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;  -- vẫn cho phantom!
BEGIN TRANSACTION;

SELECT COUNT(*) AS Cnt, SUM(FinalAmount) AS Total
FROM SalesInvoice WHERE InvoiceDate >= '2026-04-07';
-- 5 hoá đơn, tổng 50,000,000

-- Session 2 — nhân viên insert hoá đơn mới
INSERT INTO SalesInvoice (InvoiceCode, InvoiceDate, TotalAmount, FinalAmount)
VALUES ('INV-006', GETDATE(), 22990000, 22990000);
COMMIT;
-- KHÔNG bị block bởi REPEATABLE READ!

-- Session 1 — query lại
SELECT COUNT(*) AS Cnt, SUM(FinalAmount) AS Total
FROM SalesInvoice WHERE InvoiceDate >= '2026-04-07';
-- 6 hoá đơn, tổng 72,990,000 — phantom row!
COMMIT;
```

**Fix**: `getDashboardSales` dùng `SNAPSHOT` isolation:

```typescript
await transaction.begin(sql.ISOLATION_LEVEL.SNAPSHOT);
const [daily, weekly, monthly, yearly] = await Promise.all([
  getDailySales(today, today, transaction),
  getWeeklySales(...),
  getMonthlySales(...),
  getYearlySales(...)
]);
await transaction.commit();
```

Yêu cầu prerequisite (đã có ở migration 003):

```sql
ALTER DATABASE csdl SET ALLOW_SNAPSHOT_ISOLATION ON;
```

**Demo fix** (SSMS):

```sql
SET TRANSACTION ISOLATION LEVEL SNAPSHOT;
BEGIN TRANSACTION;
SELECT COUNT(*), SUM(FinalAmount) FROM SalesInvoice WHERE InvoiceDate >= '2026-01-01';
-- Snapshot tại BEGIN TRANSACTION

-- Session 2 INSERT bình thường (không block)
INSERT INTO SalesInvoice (...) VALUES (...);

SELECT COUNT(*), SUM(FinalAmount) FROM SalesInvoice WHERE InvoiceDate >= '2026-01-01';
-- Vẫn đọc snapshot cũ — không thấy row mới ✓
COMMIT;
```

**Trade-off SNAPSHOT vs SERIALIZABLE**:

| Cơ chế | Block writers? | Cost | Khi nào dùng |
|---|---|---|---|
| `SERIALIZABLE` | YES (range lock) | Throughput thấp khi nhiều writer | Cần absolute consistency, ít writer |
| `SNAPSHOT` (ta dùng) | NO (row versioning trong tempdb) | Tốn dung lượng tempdb | Read-heavy report, write thường xuyên |
| Single query | (1 query, không phantom giữa câu lệnh) | Free | Đơn giản, không cần multi-query |

### 11.6 Bảng tổng kết

| # | Vấn đề | Mặc định RC chặn? | Hot spot trong project | Cách hệ thống chống |
|---|---|---|---|---|
| 1 | Dirty Read | ✓ | InventoryStock | Giữ default RC |
| 2 | Dirty Write (logic race) | ✗ | Product/Variant softDelete | UPDLOCK + guard `WHERE IsActive = 1` |
| 3 | Non-Repeatable Read | ✗ | ProductVariant.RetailPrice | UPDLOCK trong createInvoice |
| 4 | Lost Update | ✗ | InventoryStock.QuantityOnHand | Atomic UPDATE với guard `>= @qty` |
| 5 | Phantom Read | ✗ | SalesInvoice (dashboard) | SNAPSHOT isolation |

### 11.7 Bảng isolation level vs vấn đề

| Isolation | Dirty | Non-Repeat | Lost Update | Phantom |
|---|---|---|---|---|
| READ UNCOMMITTED | ❌ | ❌ | ❌ | ❌ |
| READ COMMITTED (default) | ✓ | ❌ | ❌ | ❌ |
| REPEATABLE READ | ✓ | ✓ | ✓ | ❌ |
| SERIALIZABLE | ✓ | ✓ | ✓ | ✓ |
| **SNAPSHOT** | ✓ | ✓ | ✓ (write skew còn) | ✓ |

Hệ thống dùng RC làm baseline + cherry-pick: SNAPSHOT cho dashboard, UPDLOCK + atomic update cho create invoice, UPDLOCK cho softDelete. **Không bao giờ nâng tx-wide lên SERIALIZABLE** vì sẽ block writer toàn bộ.

---

## 12. Trade-off matrix & kết luận

### 12.1 Tổng hợp các quyết định lớn

| Quyết định | Chọn | Alternative | Lý do |
|---|---|---|---|
| Default isolation | READ COMMITTED | RR / SERIALIZABLE | RC chặn Dirty Read, ít blocking; nâng selective bằng SNAPSHOT/UPDLOCK khi cần |
| Stock decrement | Atomic `UPDATE col = col - @v WHERE col >= @v` | Read-then-write + UPDLOCK | Đơn giản, 1 round-trip, không deadlock |
| Dashboard isolation | SNAPSHOT | SERIALIZABLE | SNAPSHOT không block writers; đổi lại tốn tempdb |
| Customer storage | Inline trên SalesInvoice | Bảng Customer riêng | Walk-in shop, đa số khách 1 lần. Search qua phone đủ |
| Soft delete | `IsActive` flag | Hard DELETE | Giữ lịch sử, tránh vi phạm FK |
| Price source of truth | DB (re-read với UPDLOCK) | Client-supplied price | Client có thể stale; UPDLOCK chống đổi giá giữa tx |
| UDF inline scalar | `fn_GetAvailableStock` | Computed column | Cần JOIN cross-table; computed col chỉ tính trong 1 row |
| View materialization | Standard view (non-indexed) | Indexed view | Data đổi liên tục; cost maintain index cao |
| Audit | Trigger AfterUpdate/Delete + JSON snapshot | Application code / Temporal table | Trigger không bypass; JSON linh hoạt |
| Tx boundary | Service layer | API route hoặc DB stored proc | Test dễ, reuse từ background job |
| `[LineNo]` escape | Bracketed | Đổi tên cột | Giữ semantic gốc; chỉ tốn `[]` ở query |
| Trigger thêm row InventoryStock | Trigger | Service code | Đảm bảo invariant không thể bypass |

### 12.2 Đối tượng DB tổng kết (sau migration 007)

| Loại | Số lượng | Tên |
|---|---|---|
| Bảng nghiệp vụ | 13 | Brand, Category, Product, ProductVariant, InventoryLocation, InventoryStock, Supplier, PurchaseOrder, PurchaseOrderLine, SalesInvoice, SalesInvoiceLine, AppUser, AuditLog |
| Trigger | 4 | TR_ProductVariant_AfterInsert, TR_SalesInvoice_AfterUpdate_AuditLog, TR_SalesInvoice_AfterDelete_AuditLog, TR_Product_AfterUpdate_AuditLog |
| UDF | 2 | fn_GetAvailableStock, fn_GetProductDisplayName |
| View | 3 | vw_ProductCatalog, vw_InventoryByLocation, vw_DailySalesSummary |
| Non-clustered index | 6 | IX_SalesInvoice_InvoiceDate, IX_SalesInvoice_CustomerPhone, IX_ProductVariant_ProductId, IX_InventoryStock_LocationId, IX_SalesInvoiceLine_VariantId, IX_AuditLog_Table_Time |
| Clustered index | 13 | từ PK của 13 bảng |
| Unique non-clustered (auto) | 5 | từ UNIQUE constraints |
| CHECK constraint | 12+ | Ch.5 |
| FK constraint | 12 | Ch.4 |

### 12.3 Lớp bảo vệ concurrency (defense in depth)

Hệ thống dùng **nhiều lớp** chứ không chỉ 1 cơ chế:

```
┌─────────────────────────────────────────────────┐
│ Lớp 1: Default isolation READ COMMITTED         │
│   → chặn Dirty Read tự động                     │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│ Lớp 2: WITH (UPDLOCK) tại điểm critical         │
│   → chặn Non-Repeatable Read, Dirty Write       │
│   (createInvoice giá, softDeleteProduct)        │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│ Lớp 3: Atomic UPDATE với guard `>= @qty`        │
│   → chặn Lost Update                            │
│   (createInvoice trừ tồn kho)                   │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│ Lớp 4: SNAPSHOT isolation cho read-heavy        │
│   → chặn Phantom Read không block writer        │
│   (getDashboardSales)                           │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│ Lớp 5: CHECK constraint database-side           │
│   → backup nếu app code có bug                  │
│   (QuantityOnHand >= 0)                         │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│ Lớp 6: Audit trigger                            │
│   → ghi nhận mọi thay đổi để forensic           │
└─────────────────────────────────────────────────┘
```

### 12.4 Đánh giá hệ thống

**Mạnh**:
- Concurrency strategy chuẩn (UPDLOCK + atomic + SNAPSHOT) — không trade off nặng giữa correctness và throughput.
- Audit trail đầy đủ, không bypass được.
- Schema gọn, FK + CHECK đầy đủ, view + index hỗ trợ đúng hot-path.
- Service layer quản lý transaction; API route chỉ "thin" — kiểm thử dễ.

**Cải tiến tương lai**:
- **`ChangedByUserId` populate**: hiện NULL. App cần `SET CONTEXT_INFO` trước UPDATE để trigger đọc lại.
- **Indexed view** cho `vw_DailySalesSummary` khi traffic > 100k hoá đơn/ngày.
- **Audit thêm cho InventoryStock**: thay đổi tồn kho nhạy cảm tài chính, hiện chưa log.
- **Optimistic locking** (cột `RowVersion`) cho update sản phẩm — giảm pessimistic lock contention.
- **CreatedBy** chuyển từ `NVARCHAR` sang FK → `AppUser.UserId` (retrofit khi có auth real).
- **Foreign key cascade rules**: hiện default `NO ACTION`. Cân nhắc `ON DELETE CASCADE` cho SalesInvoiceLine khi xoá SalesInvoice.

### 12.5 Câu hỏi mở

- Có nên thêm `Customer` table trở lại nếu cửa hàng mở rộng sang CRM/loyalty? — Tuỳ scope tương lai; hiện thống nhất giữ inline.
- Có nên audit cho INSERT? — Hiện chỉ audit UPDATE/DELETE để giảm overhead. Có thể bật INSERT trigger nếu compliance yêu cầu.

---

**Cuối báo cáo.**
