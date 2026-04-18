# Database Concurrency Problems

Reference for the CSDL phone & accessories management system.
SQL Server 2022, default isolation level: `READ COMMITTED`.

---

## 1. Dirty Read

**What:** Reading data that another transaction has written but NOT yet committed. If that transaction rolls back, you read data that never existed.

**Isolation level to face it:** `READ UNCOMMITTED` (must explicitly enable — SQL Server prevents this by default).

**Scenario in our project:** Staff A is creating a purchase order to restock inventory. Staff B checks stock to sell an item. Staff A's transaction fails and rolls back, but Staff B already read the inflated stock number.

**Example queries:**

```sql
-- Session 1: Nhập hàng (chưa commit)
BEGIN TRANSACTION
UPDATE InventoryStock
SET QuantityOnHand = QuantityOnHand + 5
WHERE VariantId = 1 AND LocationId = 1
-- QuantityOnHand: 10 → 15 (chưa commit)

-- Session 2: Kiểm tra tồn kho (dùng READ UNCOMMITTED)
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED
SELECT QuantityOnHand FROM InventoryStock
WHERE VariantId = 1 AND LocationId = 1
-- Đọc được 15 (dữ liệu chưa commit!)

-- Session 1: Hủy nhập hàng
ROLLBACK
-- QuantityOnHand quay về 10, nhưng Session 2 đã đọc 15
```

**How to prevent:**
- Use `READ COMMITTED` or higher (this is SQL Server's default — don't change it).
- Never use `WITH (NOLOCK)` or `READ UNCOMMITTED` on critical queries like stock checks.

```sql
-- Safe: uses default READ COMMITTED
SELECT QuantityOnHand FROM InventoryStock
WHERE VariantId = 1 AND LocationId = 1
-- This will WAIT if another transaction is writing to this row
```

---

## 2. Non-Repeatable Read

**What:** Within the same transaction, reading the same row twice returns different values because another transaction modified and committed in between.

**Isolation level to face it:** `READ COMMITTED` (default — this problem CAN happen right now).

**Scenario in our project:** Staff is creating a sales invoice. They read the retail price of a variant to calculate the line total. Meanwhile, a manager updates the price. Staff reads the price again for a second line of the same variant — gets a different price. The invoice has inconsistent pricing.

**Example queries:**

```sql
-- Session 1: Tạo hóa đơn, đọc giá
BEGIN TRANSACTION
SELECT RetailPrice FROM ProductVariant WHERE VariantId = 1
-- Đọc 22,990,000

-- Session 2: Manager điều chỉnh giá
UPDATE ProductVariant SET RetailPrice = 21990000 WHERE VariantId = 1
-- Commit ngay lập tức

-- Session 1: Đọc giá lần 2 (cùng transaction)
SELECT RetailPrice FROM ProductVariant WHERE VariantId = 1
-- Đọc 21,990,000 — giá khác lần đầu!
-- Hóa đơn có 2 dòng cùng sản phẩm nhưng khác giá
COMMIT
```

**How to prevent:**

Option A — Use `REPEATABLE READ`:
```sql
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ
BEGIN TRANSACTION
SELECT RetailPrice FROM ProductVariant WHERE VariantId = 1
-- Đọc 22,990,000 — row này bị LOCK, không ai sửa được

-- Session 2 cố update → bị BLOCK cho đến khi Session 1 commit

SELECT RetailPrice FROM ProductVariant WHERE VariantId = 1
-- Vẫn đọc 22,990,000 ✓
COMMIT
```

Option B — Read once and reuse in application code:
```typescript
// Read price ONCE, use for all calculations
const variant = await pool.request()
  .input('variantId', variantId)
  .query('SELECT RetailPrice FROM ProductVariant WHERE VariantId = @variantId');

const price = variant.recordset[0].RetailPrice;
// Use 'price' variable for all line items — don't query again
```

---

## 3. Lost Update

**What:** Two transactions read the same value, both calculate a new value based on what they read, both write back. The second write overwrites the first — the first update is lost.

**Isolation level to face it:** `READ COMMITTED` (default — this problem CAN happen right now). This is the **most dangerous** problem for our system.

**Scenario in our project:** Two staff members sell items at the same time. Both read stock = 10. Staff A sells 1, writes stock = 9. Staff B sells 2, writes stock = 8. Result: stock = 8, but should be 7 (10 - 1 - 2). Staff A's sale is lost — inventory is wrong.

**Example queries (THE WRONG WAY):**

```sql
-- Session 1: Bán 1 cái
BEGIN TRANSACTION
SELECT QuantityOnHand FROM InventoryStock
WHERE VariantId = 1 AND LocationId = 1
-- Đọc 10

-- Session 2: Bán 2 cái (chạy đồng thời)
BEGIN TRANSACTION
SELECT QuantityOnHand FROM InventoryStock
WHERE VariantId = 1 AND LocationId = 1
-- Cũng đọc 10

-- Session 2: Ghi trước
UPDATE InventoryStock SET QuantityOnHand = 8   -- 10 - 2
WHERE VariantId = 1 AND LocationId = 1
COMMIT

-- Session 1: Ghi sau (dùng giá trị cũ)
UPDATE InventoryStock SET QuantityOnHand = 9   -- 10 - 1
WHERE VariantId = 1 AND LocationId = 1
COMMIT
-- Kết quả: 9 ← SAI! Phải là 7 (10 - 1 - 2)
-- Mất update của Session 2
```

**How to prevent:**

Option A — Atomic update (best, simplest):
```sql
-- Không cần đọc trước, trừ trực tiếp trong UPDATE
UPDATE InventoryStock
SET QuantityOnHand = QuantityOnHand - @quantity
WHERE VariantId = @variantId AND LocationId = @locationId

-- Session 1: QuantityOnHand = QuantityOnHand - 1 → 10 - 1 = 9
-- Session 2: QuantityOnHand = QuantityOnHand - 2 → 9 - 2 = 7 ✓
```

Option B — Use `UPDLOCK` hint (lock the row when reading):
```sql
BEGIN TRANSACTION
SELECT QuantityOnHand FROM InventoryStock WITH (UPDLOCK)
WHERE VariantId = 1 AND LocationId = 1
-- Đọc 10, VÀ lock row — Session 2 phải đợi

-- Session 2 cố SELECT WITH (UPDLOCK) → bị BLOCK

UPDATE InventoryStock SET QuantityOnHand = 10 - 1
WHERE VariantId = 1 AND LocationId = 1
COMMIT
-- Bây giờ Session 2 mới được đọc (đọc 9, tính tiếp đúng)
```

Option C — Application code with atomic update:
```typescript
// WRONG: read then write
const result = await pool.request().query(
  'SELECT QuantityOnHand FROM InventoryStock WHERE VariantId = 1'
);
const current = result.recordset[0].QuantityOnHand;
await pool.request().query(
  `UPDATE InventoryStock SET QuantityOnHand = ${current - qty}`
);

// RIGHT: atomic update + check
await pool.request()
  .input('qty', quantity)
  .input('variantId', variantId)
  .input('locationId', locationId)
  .query(`
    UPDATE InventoryStock
    SET QuantityOnHand = QuantityOnHand - @qty
    WHERE VariantId = @variantId
      AND LocationId = @locationId
      AND QuantityOnHand >= @qty
  `);
// If rowsAffected = 0 → not enough stock, reject the sale
```

---

## 4. Phantom Read

**What:** Within the same transaction, running the same query twice returns a different number of rows because another transaction inserted or deleted rows in between.

**Isolation level to face it:** `READ COMMITTED` (default) and `REPEATABLE READ` — both allow phantoms. Only `SERIALIZABLE` prevents it.

**Scenario in our project:** Manager generates a daily sales report. First query counts 5 invoices with total = 50,000,000. While the report runs, a staff member creates a new invoice. Second query in the same report counts 6 invoices — the total and count don't match. The report is inconsistent.

**Example queries:**

```sql
-- Session 1: Tạo báo cáo doanh thu hôm nay
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ
BEGIN TRANSACTION
SELECT COUNT(*) AS SoHoaDon, SUM(FinalAmount) AS TongTien
FROM SalesInvoice
WHERE InvoiceDate >= '2026-04-07'
-- Đọc: 5 hóa đơn, tổng 50,000,000

-- Session 2: Nhân viên tạo hóa đơn mới
INSERT INTO SalesInvoice (InvoiceCode, InvoiceDate, TotalAmount, FinalAmount)
VALUES ('INV-006', GETDATE(), 22990000, 22990000)
COMMIT
-- Insert KHÔNG bị block bởi REPEATABLE READ

-- Session 1: Query lần 2
SELECT COUNT(*) AS SoHoaDon, SUM(FinalAmount) AS TongTien
FROM SalesInvoice
WHERE InvoiceDate >= '2026-04-07'
-- Đọc: 6 hóa đơn, tổng 72,990,000 — phantom row xuất hiện!
COMMIT
```

**How to prevent:**

Option A — Use `SERIALIZABLE` (strictest, may cause more blocking):
```sql
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE
BEGIN TRANSACTION
SELECT COUNT(*) AS SoHoaDon, SUM(FinalAmount) AS TongTien
FROM SalesInvoice
WHERE InvoiceDate >= '2026-04-07'
-- Lock cả RANGE — không ai insert được row mới trong range này

-- Session 2 cố INSERT → bị BLOCK cho đến khi Session 1 commit

SELECT COUNT(*) AS SoHoaDon, SUM(FinalAmount) AS TongTien
FROM SalesInvoice
WHERE InvoiceDate >= '2026-04-07'
-- Vẫn đọc 5 hóa đơn, tổng 50,000,000 ✓
COMMIT
```

Option B — Use `SNAPSHOT` isolation (no blocking, uses row versioning):
```sql
-- Enable once for the database
ALTER DATABASE csdl SET ALLOW_SNAPSHOT_ISOLATION ON

-- Session 1: Report
SET TRANSACTION ISOLATION LEVEL SNAPSHOT
BEGIN TRANSACTION
SELECT COUNT(*) AS SoHoaDon, SUM(FinalAmount) AS TongTien
FROM SalesInvoice
WHERE InvoiceDate >= '2026-04-07'
-- Đọc snapshot tại thời điểm BEGIN TRANSACTION

-- Session 2 insert bình thường, không bị block
-- Nhưng Session 1 không thấy row mới — snapshot cố định ✓
COMMIT
```

Option C — Single query (for simple reports):
```sql
-- Nếu chỉ cần 1 query, không có phantom vì chỉ đọc 1 lần
SELECT
  COUNT(*) AS SoHoaDon,
  SUM(FinalAmount) AS TongTien
FROM SalesInvoice
WHERE InvoiceDate >= '2026-04-07'
-- Đọc 1 lần duy nhất — consistent trong chính nó
```

---

## Summary Table

| Problem | Description | Default risk? | Hot spot | Best prevention |
|---------|-------------|---------------|----------|-----------------|
| Dirty Read | Đọc dữ liệu chưa commit | No (blocked by default) | InventoryStock | Keep default `READ COMMITTED` |
| Non-Repeatable Read | Giá trị thay đổi giữa 2 lần đọc | **Yes** | ProductVariant.RetailPrice | Read once + reuse, or `REPEATABLE READ` |
| Lost Update | 2 người cùng sửa, 1 bị mất | **Yes, most dangerous** | InventoryStock.QuantityOnHand | Atomic update: `SET col = col - @qty` |
| Phantom Read | Số dòng thay đổi giữa 2 lần đọc | **Yes** | SalesInvoice, PurchaseOrder | `SERIALIZABLE` or `SNAPSHOT` for reports |

## Isolation Levels vs Problems

| Isolation Level | Dirty Read | Non-Repeatable Read | Lost Update | Phantom Read |
|-----------------|------------|---------------------|-------------|--------------|
| READ UNCOMMITTED | Possible | Possible | Possible | Possible |
| READ COMMITTED (default) | Prevented | Possible | Possible | Possible |
| REPEATABLE READ | Prevented | Prevented | Prevented | Possible |
| SERIALIZABLE | Prevented | Prevented | Prevented | Prevented |
| SNAPSHOT | Prevented | Prevented | Prevented | Prevented |
