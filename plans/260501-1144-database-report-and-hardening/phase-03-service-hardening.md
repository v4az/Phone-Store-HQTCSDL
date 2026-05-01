# Phase 03 — Service-Layer Hardening (3 fixes)

## Context Links
- `plans/reports/scout-260501-1144-service-tx-audit.md` — gap detail
- `lib/services/sales.ts`, `lib/services/report.ts`, `app/api/inventory/route.ts`, `app/api/reports/route.ts`

## Overview
- **Priority:** P1
- **Status:** pending
- **Description:** Sửa 3 gap đã phát hiện. Mỗi fix nhỏ, nhắm vào 1 file. Mục đích: làm hệ thống thật sự "layered defense" để báo cáo không nói quá.

## Key Insights
- Gap đều ít rủi ro production nhưng quan trọng cho narrative báo cáo.
- Sau fix: API layer KHÔNG chứa SQL, chỉ gọi service. Service KHÔNG để dữ liệu read split. Report KHÔNG chạy ngoài SNAPSHOT.

## Requirements

### Fix 1 — `/api/inventory` qua service

**Trước:**
```ts
// app/api/inventory/route.ts
const pool = await getPool();
const result = await pool.request().query(`SELECT … FROM InventoryStock JOIN …`);
```

**Sau:**
```ts
// lib/services/inventory.ts (mới)
export async function getInventoryStockList(locationId?: number) {
  const pool = await getPool();
  const request = pool.request();
  let query = `SELECT * FROM vw_InventoryByLocation`;
  if (locationId !== undefined) {
    request.input("locationId", sql.Int, locationId);
    query += ` WHERE LocationId = @locationId`;
  }
  query += ` ORDER BY LocationName, ProductName`;
  const result = await request.query(query);
  return result.recordset;
}

// app/api/inventory/route.ts
import { getInventoryStockList } from "@/lib/services/inventory";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const loc = url.searchParams.get("locationId");
  const data = await getInventoryStockList(loc ? Number(loc) : undefined);
  return NextResponse.json(data);
}
```

Bonus: dùng `vw_InventoryByLocation` (Phase 02) → đơn giản hơn raw JOIN.

### Fix 2 — `getInvoiceById` gom tx

**Trước:** 2 query rời (header + lines).

**Sau:**
```ts
export async function getInvoiceById(invoiceId: number) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    const header = await tx.request()
      .input("id", sql.Int, invoiceId)
      .query(`SELECT * FROM SalesInvoice WHERE InvoiceId = @id`);
    if (header.recordset.length === 0) {
      await tx.commit();
      return null;
    }
    const lines = await tx.request()
      .input("id", sql.Int, invoiceId)
      .query(`SELECT * FROM SalesInvoiceLine WHERE InvoiceId = @id ORDER BY [LineNo]`);
    await tx.commit();
    return { ...header.recordset[0], Lines: lines.recordset };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}
```

Note: 2 SELECT cùng tx + READ COMMITTED → cả hai thấy snapshot row state nhất quán đến thời điểm chạy.

### Fix 3 — `/api/reports` dùng SNAPSHOT wrapper

**Trước:** `app/api/reports/route.ts` gọi từng `getDailySales`/`getWeeklySales` rời.

**Sau:** call `getDashboardSales()` (đã có SNAPSHOT tx) và trả về wrapper:
```ts
import { getDashboardSales } from "@/lib/services/report";
export async function GET() {
  const data = await getDashboardSales();
  return NextResponse.json(data);
}
```

Nếu UI hiện đang đọc cấu trúc cũ (4 mảng riêng) → adapter trong route để giữ shape cũ:
```ts
const { daily, weekly, monthly, yearly } = await getDashboardSales();
return NextResponse.json({ daily, weekly, monthly, yearly });
```

## Architecture
```
                    ┌─────────────────────┐
                    │  API Route (thin)   │
                    └──────────┬──────────┘
                               │ no SQL here
                    ┌──────────▼──────────┐
                    │   Service Layer     │  ← TX boundary
                    │   (lib/services/*)  │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  SQL Server (DB)    │
                    └─────────────────────┘
```

## Related Code Files

**Create:**
- `lib/services/inventory.ts`

**Modify:**
- `app/api/inventory/route.ts` — gọi service mới
- `lib/services/sales.ts` — refactor `getInvoiceById` thành tx
- `app/api/reports/route.ts` — gọi `getDashboardSales`

**Read:** existing route handlers / service files để giữ shape response.

## Implementation Steps

1. **Inventory service:**
   - Tạo `lib/services/inventory.ts` export `getInventoryStockList(locationId?)`.
   - Update `lib/services/index.ts` re-export nếu có.
   - Refactor `app/api/inventory/route.ts` dùng service.
2. **getInvoiceById tx:**
   - Refactor function trong `lib/services/sales.ts`.
   - Update `app/api/sales/[id]/route.ts` không cần đổi (signature giữ nguyên).
3. **Reports SNAPSHOT:**
   - Edit `app/api/reports/route.ts` chỉ gọi `getDashboardSales`.
   - Verify `app/api/reports/[id]/route.ts` (nếu có dynamic route) — kiểm tra `id` param dùng cho gì; có thể không liên quan.
4. Smoke:
   ```bash
   curl -s 'http://localhost:3000/api/inventory?locationId=1' | head
   curl -s 'http://localhost:3000/api/sales/1'
   curl -s 'http://localhost:3000/api/reports'
   ```
5. `pnpm tsc --noEmit` — không type error.
6. Sanity test concurrency: chạy 2 invoice insert song song trên cùng variant → tồn kho phải đúng.

## Todo
- [ ] Tạo `lib/services/inventory.ts`
- [ ] Refactor `app/api/inventory/route.ts`
- [ ] Refactor `getInvoiceById` thành tx
- [ ] Refactor `app/api/reports/route.ts`
- [ ] Smoke test 3 endpoint
- [ ] tsc --noEmit pass

## Success Criteria
- API endpoints trả 200 với shape giữ nguyên.
- Không còn raw SQL trong `app/api/**/route.ts` (trừ trường hợp cần thiết đã document).
- `getInvoiceById` có tx + commit/rollback paths.

## Risk
| Rủi ro | Giảm thiểu |
|---|---|
| Shape response API thay đổi → frontend break | Giữ nguyên field name; nếu cần map trong route |
| Tx không commit khi `header.recordset.length === 0` → connection leak | Đã commit trước return null trong fix 2 |
| `getDashboardSales` slug khác — UI expect shape khác | Verify component hiện tại đọc `daily/weekly/...` |

## Security
- N/A (refactor nội bộ).

## Next
→ Phase 04: viết `docs/database-report.md`.
