# Khắc phục 5 vấn đề đồng thời (Concurrency) trong hệ thống

Tài liệu mô tả cách phát hiện và khắc phục 5 vấn đề đồng thời trong backend hệ thống quản lý cửa hàng điện thoại & phụ kiện.

**Cơ sở dữ liệu:** SQL Server 2022, isolation level mặc định: `READ COMMITTED`  
**Backend:** Next.js API Routes + `mssql` (node-mssql)

---

## Tổng quan

| # | Vấn đề | Mức độ nguy hiểm | Trạng thái |
|---|--------|-------------------|------------|
| 1 | Dirty Read | Không xảy ra (mặc định đã chặn) | ✅ An toàn |
| 2 | Dirty Write | Trung bình | ✅ Đã sửa |
| 3 | Non-Repeatable Read | Trung bình | ✅ Đã sửa |
| 4 | Lost Update | **Nghiêm trọng** | ✅ Đã sửa |
| 5 | Phantom Read | Trung bình | ✅ Đã sửa |

---

## 1. Dirty Read — Không cần sửa

### Vấn đề là gì?

Dirty Read xảy ra khi một transaction đọc được dữ liệu mà transaction khác **chưa commit**. Nếu transaction kia rollback, dữ liệu đọc được sẽ là dữ liệu không bao giờ tồn tại.

### Kiểm tra trong hệ thống

SQL Server mặc định sử dụng `READ COMMITTED` — tự động chặn dirty read. Đã kiểm tra toàn bộ code:
- Không có `WITH (NOLOCK)` 
- Không có `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED`
- Không có hint nào cho phép đọc dữ liệu chưa commit

### Kết luận

**Không cần thay đổi code.** Chỉ cần giữ nguyên isolation level mặc định `READ COMMITTED`.

---

## 2. Dirty Write — Đã sửa

### Vấn đề là gì?

Dirty Write xảy ra khi hai transaction cùng ghi vào cùng một row. Nếu transaction đầu rollback, nó có thể undo luôn cả dữ liệu của transaction thứ hai. Ở tầng ứng dụng, vấn đề nghiêm trọng hơn: hai thao tác ghi đồng thời có thể tạo ra trạng thái không nhất quán.

### Phát hiện trong code

**Vấn đề A — `updateBrand()` và `updateCategory()` không có transaction:**

```typescript
// ❌ TRƯỚC KHI SỬA — brands.ts
export async function updateBrand(brandId, brand) {
  const pool = await getPool();
  const request = pool.request(); // ← không có transaction!
  // ...
  const result = await request.query(query);
  return result.recordset[0];
}
```

Nếu sau này thêm nhiều statement (ví dụ: update brand + ghi audit log), một lỗi giữa chừng sẽ để database ở trạng thái không nhất quán — một phần đã update, một phần chưa.

**Vấn đề B — `softDeleteProduct()` chạy đua với `updateProduct()`:**

```
Transaction A (softDelete):  UPDATE Product SET IsActive = 0 WHERE ProductId = 1
Transaction A:               UPDATE ProductVariant SET IsActive = 0 WHERE ProductId = 1
  -- A giữ exclusive lock trên cả 2 bảng

Transaction B (updateProduct): chờ A xong...
  -- A COMMIT → B chạy tiếp
Transaction B:               UPDATE Product SET IsActive = 1 WHERE ProductId = 1  ← kích hoạt lại!
  -- B COMMIT
  -- Kết quả: Product active lại, nhưng tất cả Variant vẫn IsActive = 0 → không nhất quán!
```

### Cách sửa

**File `brands.ts` — Bọc `updateBrand()` trong transaction:**

```typescript
// ✅ SAU KHI SỬA
export async function updateBrand(brandId, brand) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const request = transaction.request(); // ← dùng transaction
    // ...
    await transaction.commit();
    return result.recordset[0];
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

**File `categories.ts` — Tương tự, bọc `updateCategory()` trong transaction.**

**File `products.ts` — `softDeleteProduct()` dùng `UPDLOCK`:**

```typescript
// ✅ SAU KHI SỬA — Lock row Product trước khi xóa
const lockResult = await transaction
  .request()
  .input("productId", sql.Int, productId)
  .query(`
    SELECT ProductId FROM Product WITH (UPDLOCK)
    WHERE ProductId = @productId
  `);
// → Nếu updateProduct() chạy đồng thời, nó phải ĐỢI đến khi softDelete xong
```

**File `products.ts` — `updateProduct()` thêm guard `IsActive = 1`:**

```sql
-- ✅ SAU KHI SỬA — Không cho update sản phẩm đã xóa
UPDATE Product
SET ...
WHERE ProductId = @productId AND IsActive = 1
--                              ^^^^^^^^^^^^^^^^ guard mới
```

---

## 3. Non-Repeatable Read — Đã sửa

### Vấn đề là gì?

Non-Repeatable Read xảy ra khi trong cùng một transaction, đọc cùng một row hai lần nhưng nhận được giá trị khác nhau — vì transaction khác đã sửa và commit trong khoảng giữa.

### Phát hiện trong code

**File `sales.ts` — `createInvoice()` tin tưởng giá từ client:**

```typescript
// ❌ TRƯỚC KHI SỬA
// Client gửi UnitPrice = 22,990,000 (giá lúc mở trang)
// Nhưng manager vừa đổi giá thành 21,990,000 trên database
// → Hóa đơn lưu giá cũ, không khớp với giá hiện tại trong DB
```

Hàm `createInvoice()` nhận `UnitPrice` từ request body mà không kiểm tra lại giá trên database. Nếu manager thay đổi giá giữa lúc UI load và lúc gửi form, hóa đơn sẽ lưu giá sai.

### Cách sửa

**File `sales.ts` — Đọc giá từ DB với `UPDLOCK`:**

```typescript
// ✅ SAU KHI SỬA — Đọc giá chính thức từ DB, lock row để không ai sửa giá được
const priceResult = await transaction
  .request()
  .input("variantId", sql.Int, line.VariantId)
  .query(`
    SELECT RetailPrice FROM ProductVariant WITH (UPDLOCK)
    WHERE VariantId = @variantId AND IsActive = 1
  `);
// Lock giữ đến khi transaction commit → không ai thay đổi giá giữa chừng

const dbPrice = priceResult.recordset[0].RetailPrice;
// Dùng dbPrice thay vì giá từ client
```

**Kết quả:**
- Server là nguồn chính xác (authoritative) cho giá, không phải client
- `UPDLOCK` ngăn manager thay đổi giá trong lúc tạo hóa đơn
- Giá trên hóa đơn luôn nhất quán với giá tại thời điểm tạo

---

## 4. Lost Update — Đã sửa (vấn đề nghiêm trọng nhất)

### Vấn đề là gì?

Lost Update xảy ra khi hai transaction cùng đọc một giá trị, cả hai tính toán giá trị mới dựa trên giá trị đọc được, rồi cả hai ghi lại. Ghi sau cùng sẽ đè lên ghi trước — update đầu tiên bị mất.

### Phát hiện trong code

**File `sales.ts` — `createInvoice()` HOÀN TOÀN KHÔNG trừ tồn kho:**

```typescript
// ❌ TRƯỚC KHI SỬA
// createInvoice() chỉ INSERT vào SalesInvoice + SalesInvoiceLine
// KHÔNG HỀ UPDATE InventoryStock
// → Bán hàng nhưng tồn kho không giảm!
```

Khi tồn kho được thêm vào, nếu dùng pattern "đọc rồi ghi" (read-then-write):

```
Nhân viên A: SELECT QuantityOnHand → đọc 10
Nhân viên B: SELECT QuantityOnHand → đọc 10
Nhân viên B: UPDATE SET QuantityOnHand = 8   (10 - 2)  → COMMIT
Nhân viên A: UPDATE SET QuantityOnHand = 9   (10 - 1)  → COMMIT
-- Kết quả: 9 ← SAI! Phải là 7 (10 - 1 - 2). Mất update của B.
```

### Cách sửa

**File `sales.ts` — Trừ tồn kho nguyên tử (atomic) trong `createInvoice()`:**

```typescript
// ✅ SAU KHI SỬA — Atomic update, không cần đọc trước
const stockResult = await transaction
  .request()
  .input("variantId", sql.Int, line.VariantId)
  .input("locationId", sql.Int, locationId)
  .input("qty", sql.Int, line.Quantity)
  .query(`
    UPDATE InventoryStock
    SET QuantityOnHand = QuantityOnHand - @qty
    WHERE VariantId = @variantId
      AND LocationId = @locationId
      AND QuantityOnHand >= @qty
  `);

// Kiểm tra: nếu rowsAffected = 0 → không đủ hàng
if (stockResult.rowsAffected[0] === 0) {
  throw new InsufficientStockError(line.VariantId, line.Quantity, locationId);
}
```

**Tại sao cách này đúng?**

```
Nhân viên A: UPDATE SET QuantityOnHand = QuantityOnHand - 1  → 10 - 1 = 9
Nhân viên B: UPDATE SET QuantityOnHand = QuantityOnHand - 2  → 9 - 2 = 7 ✓
-- Cả hai update đều được bảo toàn vì SQL Server tự dùng giá trị hiện tại
```

- `QuantityOnHand = QuantityOnHand - @qty` — trừ trực tiếp, SQL Server tự lấy giá trị hiện tại
- `WHERE QuantityOnHand >= @qty` — guard: nếu không đủ hàng thì `rowsAffected = 0`
- Nếu không đủ hàng → throw `InsufficientStockError` → API trả về `409 Conflict`

**File `errors.ts` — Error class mới:**

```typescript
export class InsufficientStockError extends Error {
  public variantId: number;
  public requestedQty: number;
  public locationId: number;
  // ...
}
```

**File `app/api/sales/route.ts` — Xử lý lỗi 409:**

```typescript
if (error instanceof InsufficientStockError) {
  return NextResponse.json(
    { error: error.message, variantId: error.variantId, ... },
    { status: 409 }
  );
}
```

---

## 5. Phantom Read — Đã sửa

### Vấn đề là gì?

Phantom Read xảy ra khi trong cùng một transaction, chạy cùng một query hai lần nhưng nhận được **số dòng khác nhau** — vì transaction khác đã INSERT hoặc DELETE dòng mới trong khoảng giữa.

### Phát hiện trong code

**File `report.ts` — `getDashboardSales()` chạy 4 query độc lập:**

```typescript
// ❌ TRƯỚC KHI SỬA
const [daily, weekly, monthly, yearly] = await Promise.all([
  getDailySales(...),   // ← query riêng, connection riêng
  getWeeklySales(...),  // ← query riêng, connection riêng
  getMonthlySales(...), // ← query riêng, connection riêng
  getYearlySales(...)   // ← query riêng, connection riêng
]);
// Nếu 1 hóa đơn mới được insert giữa các query:
// daily có thể thấy 5 hóa đơn, nhưng monthly thấy 6 → không nhất quán!
```

Mỗi hàm report tự mở connection riêng từ pool. Nếu có invoice mới INSERT giữa các query, số liệu daily/weekly/monthly/yearly sẽ không khớp nhau.

### Cách sửa

**File `report.ts` — Tất cả report function nhận optional `transaction`:**

```typescript
// ✅ SAU KHI SỬA — Mỗi hàm report chấp nhận transaction tùy chọn
export async function getDailySales(
  from?: Date,
  to?: Date,
  transaction?: sql.Transaction  // ← tham số mới
): Promise<SalesSummaryByPeriod[]> {
  const request = transaction
    ? transaction.request()   // dùng chung transaction
    : (await getPool()).request(); // standalone
  // ...
}
```

**File `report.ts` — `getDashboardSales()` dùng SNAPSHOT transaction:**

```typescript
// ✅ SAU KHI SỬA — Tất cả query dùng chung SNAPSHOT
export async function getDashboardSales() {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    // SNAPSHOT: tất cả query thấy cùng 1 snapshot dữ liệu
    await transaction.begin(sql.ISOLATION_LEVEL.SNAPSHOT);

    const [daily, weekly, monthly, yearly] = await Promise.all([
      getDailySales(today, today, transaction),        // ← chung transaction
      getWeeklySales(last30Days, undefined, transaction), // ← chung transaction
      getMonthlySales(lastYear, undefined, transaction),  // ← chung transaction
      getYearlySales(startOfYear, undefined, transaction) // ← chung transaction
    ]);

    await transaction.commit();
    return { daily, weekly, monthly, yearly };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

**File migration `003_enable_snapshot_isolation.sql`:**

```sql
-- Chạy 1 lần trên database (yêu cầu quyền DBA)
ALTER DATABASE csdl SET ALLOW_SNAPSHOT_ISOLATION ON;
```

**Tại sao dùng SNAPSHOT thay vì SERIALIZABLE?**
- `SERIALIZABLE` lock cả range → block các transaction khác INSERT/UPDATE
- `SNAPSHOT` dùng row versioning → không block ai, tất cả query thấy cùng 1 snapshot
- Cho report (read-only), SNAPSHOT là lựa chọn tối ưu: đúng và nhanh

---

## Tóm tắt thay đổi

### File đã sửa

| File | Thay đổi | Vấn đề giải quyết |
|------|----------|-------------------|
| `lib/services/brands.ts` | Bọc `updateBrand()` trong transaction | Dirty Write |
| `lib/services/categories.ts` | Bọc `updateCategory()` trong transaction | Dirty Write |
| `lib/services/products.ts` | `UPDLOCK` trong `softDeleteProduct()`, guard `IsActive = 1` trong `updateProduct()` | Dirty Write |
| `lib/services/sales.ts` | Đọc giá DB với `UPDLOCK`, trừ tồn kho atomic, sửa bug reuse request | Non-Repeatable Read, Lost Update |
| `lib/services/report.ts` | Các hàm nhận optional transaction, `getDashboardSales()` dùng SNAPSHOT | Phantom Read |
| `app/api/sales/route.ts` | Xử lý `InsufficientStockError` → 409 | Lost Update (API layer) |

### File mới

| File | Mục đích |
|------|----------|
| `lib/errors.ts` | Class `InsufficientStockError` |
| `database/migrations/003_enable_snapshot_isolation.sql` | Bật SNAPSHOT isolation |
| `docs/concurrency-demo.sql` | Script demo tất cả 5 vấn đề trong SSMS |

### Bug bonus đã sửa

Trong `createInvoice()` cũ, một `lineRequest` duy nhất được tái sử dụng trong vòng lặp:

```typescript
// ❌ BUG — cùng 1 request, thêm cùng tên param nhiều lần
const lineRequest = transaction.request();
for (const line of invoice.Lines) {
  await lineRequest
    .input("lineNo", sql.Int, line.LineNo) // ← lần 2 sẽ lỗi: param "lineNo" đã tồn tại!
}

// ✅ SỬA — mỗi line dùng request riêng
for (const line of verifiedLines) {
  await transaction
    .request() // ← request mới mỗi lần
    .input("lineNo", sql.Int, line.LineNo)
    // ...
}
```

---

## Yêu cầu triển khai

1. **Chạy migration** `003_enable_snapshot_isolation.sql` trên database trước khi dùng tính năng dashboard report
2. **Đảm bảo `InventoryStock`** có dữ liệu cho các variant tại location tương ứng (mặc định `LocationId = 1`)
