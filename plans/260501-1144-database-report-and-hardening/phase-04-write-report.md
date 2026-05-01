# Phase 04 — Compose `docs/database-report.md`

## Context Links
- All phase 01-03 outputs (DB state sau hardening)
- `docs/database_setup.md`, `docs/concurrency-fixes.md`, `docs/concurrency-problems.md`, `docs/concurrency-demo.sql`
- Reports: `plans/reports/scout-260501-1144-*.md`

## Overview
- **Priority:** P0 (deliverable chính)
- **Status:** pending
- **Description:** Viết báo cáo CSDL hoàn chỉnh, 1 file `docs/database-report.md`, ngôn ngữ Tiếng Việt (term Anh giữ nguyên cho code/DB), độ dài ~1500-2500 dòng.

## Key Insights
- Phải có **trade-off** ở từng section: tx, function, view, index, trigger, isolation level.
- Demo concurrency: dùng lại nội dung từ `concurrency-demo.sql` + mô tả nghiệp vụ + giải thích vì sao chọn fix đó.
- ER diagram dùng Mermaid `erDiagram` (Mintlify-compatible).

## Requirements

### Cấu trúc báo cáo (chương)

1. **Tổng quan hệ thống** — bối cảnh nghiệp vụ (cửa hàng điện thoại + phụ kiện), stack, DB engine, isolation mặc định
2. **Mô hình thực thể (Entity)** — danh sách entity nghiệp vụ (Product, Variant, Inventory, Sale, Purchase, **AppUser**, **AuditLog**…) và mapping sang bảng
3. **Bảng (Table) & lược đồ chi tiết** — 13 bảng: cột, kiểu, NULL, default, mô tả nghiệp vụ (gồm AppUser, AuditLog)
4. **Quan hệ (Relationship)** — 1:N, N:M, self-ref + ER diagram (Mermaid). Nêu quan hệ AppUser 1:N AuditLog (ChangedByUserId).
5. **Ràng buộc (Constraint)** — PK/FK/UNIQUE/CHECK/DEFAULT — tác dụng & trade-off (database-side vs app-side validation)
6. **Index** — clustered + 5 NC indexes — mỗi index: vì sao tạo, query benefit, INSERT cost — TRADE-OFF
7. **Trigger** — 4 triggers + trade-off (audit trigger không thể bypass vs overhead I/O):
    - `TR_ProductVariant_AfterInsert` (auto-init InventoryStock; existing)
    - `TR_SalesInvoice_AfterUpdate_AuditLog` (audit trail change)
    - `TR_SalesInvoice_AfterDelete_AuditLog` (audit trail delete)
    - `TR_Product_AfterUpdate_AuditLog` (audit trail product changes)
    - Hạn chế: bảng có trigger không cho phép `OUTPUT INSERTED.*`; phải dùng `SCOPE_IDENTITY()`. So sánh với temporal table.
8. **Function (UDF)** — `fn_GetAvailableStock`, `fn_GetProductDisplayName` — scalar inline, schemabinding, trade-off vs computed column / view
9. **View** — `vw_ProductCatalog`, `vw_InventoryByLocation`, `vw_DailySalesSummary` — tác dụng, trade-off vs raw query / indexed view
10. **Transaction** — phân tích từng service function tx-wrapped: mục đích, isolation, lock hint, **vì sao chọn**:
    - `createInvoice` — RC + UPDLOCK (price) + atomic stock UPDATE (Lost Update + Non-Repeatable Read)
    - `softDeleteProduct` — RC + UPDLOCK (Dirty Write)
    - `createProduct` / `updateProduct` / `updateInventoryStock` — RC tx (atomicity multi-statement)
    - `getDashboardSales` — SNAPSHOT (Phantom Read, no blocking)
    - `getInvoiceById` (sau fix) — RC tx (consistency 2 reads)
    - `updateBrand` / `updateCategory` — RC tx (chuẩn hoá, sau này dễ thêm audit log)
11. **Concurrency — 5 vấn đề + Demo + Fix**
    - Dirty Read (default RC chặn)
    - Dirty Write (UPDLOCK + IsActive guard)
    - Non-Repeatable Read (UPDLOCK on price)
    - Lost Update (atomic update with `>=` guard)
    - Phantom Read (SNAPSHOT cho dashboard)
    - Mỗi vấn đề: định nghĩa → kịch bản nghiệp vụ → SQL demo → fix → mô tả tại sao fix đó tối ưu so với options khác
12. **Kết luận & Trade-off summary** — bảng tổng hợp các quyết định lớn

### Trade-off matrix mẫu (chương 12)

| Quyết định | Lựa chọn | Alternative | Lý do chọn |
|---|---|---|---|
| Default isolation | READ COMMITTED | RR / SERIALIZABLE | RC đủ chặn Dirty Read; ít blocking; nâng cấp khi cần |
| Stock decrement | Atomic UPDATE | Read-then-write + UPDLOCK | Atomic đơn giản, ít round-trip, không deadlock |
| Dashboard isolation | SNAPSHOT | SERIALIZABLE | SNAPSHOT không block writers; chỉ tốn tempdb row versions |
| Customer storage | Inline trên SalesInvoice | Bảng Customer riêng | Cửa hàng không cần CRM; tra cứu qua SĐT |
| Soft delete | IsActive flag | Hard DELETE | Giữ lịch sử + tránh vi phạm FK |
| UDF inline scalar | fn_GetAvailableStock | Computed column | Tính theo cặp (Variant,Location), không thuộc 1 bảng |
| View không index | vw_DailySalesSummary | Indexed view | Query chạy 1-2 lần/ngày — không cần materialize |

## Architecture

1 file Markdown `docs/database-report.md`, Mermaid blocks cho diagram, code fences cho SQL/TS.

## Related Code Files

**Create:**
- `docs/database-report.md`

**Reference (đọc để trích):**
- All migrations
- `lib/services/*.ts`
- `lib/types/*.ts` (TypeScript interface — để show schema dạng TS cho phần entity)
- Existing `docs/concurrency-*.md` — copy + restructure

**Optional (sau khi user xác nhận):**
- Move `docs/concurrency-problems.md` → `docs/legacy/` hoặc giữ nguyên

## Implementation Steps

1. Tạo skeleton 12 chương với heading và TOC.
2. Viết chương 1-3 (overview + entity + table) — copy + mở rộng từ `database_setup.md`.
3. Chương 4 — vẽ ER diagram Mermaid (entity + cardinality + key fields).
4. Chương 5 — bảng constraint, mỗi loại 1 ví dụ, trade-off vs app validation.
5. Chương 6 — bảng 5 NC indexes, mỗi index có sub-section: Definition, Why, Cost, Verification SQL.
6. Chương 7 — trigger detail + giới hạn `OUTPUT INSERTED`, alternative considered.
7. Chương 8 — UDF: full SQL + use case + scalar UDF inlining caveat (SQL 2019+).
8. Chương 9 — View: full SQL + use case + non-indexed trade-off.
9. Chương 10 — bảng tx analysis (per-service), code snippet, isolation justification.
10. Chương 11 — copy structure từ `concurrency-fixes.md` + `concurrency-demo.sql`, mỗi vấn đề 4 phần (Định nghĩa / Kịch bản / Demo SQL / Fix + Trade-off).
11. Chương 12 — trade-off matrix tổng + recommendations cho future.
12. Đọc lại, sửa lỗi format. Verify Mermaid render trong markdown viewer.

## Todo
- [ ] Skeleton + TOC
- [ ] Ch.1 Tổng quan
- [ ] Ch.2 Entity
- [ ] Ch.3 Table detail
- [ ] Ch.4 Relationship + ER diagram
- [ ] Ch.5 Constraint
- [ ] Ch.6 Index (5 NC + clustered) + trade-off
- [ ] Ch.7 Trigger (4 triggers, gồm audit) + trade-off temporal vs custom audit
- [ ] Ch.8 Function (2 UDF) + trade-off
- [ ] Ch.9 View (3 views) + trade-off
- [ ] Ch.10 Transaction (per service) + isolation justification
- [ ] Ch.11 5 Concurrency problems (demo + fix)
- [ ] Ch.12 Trade-off matrix + kết luận
- [ ] Final lint pass

## Success Criteria
- Tất cả 12 chương đầy đủ, không placeholder.
- Mỗi tx/func/index có trade-off rõ ràng.
- ER diagram render được (Mermaid).
- 5 concurrency demos khớp `docs/concurrency-demo.sql`.
- File self-contained — đọc 1 file đủ hiểu nghiệp vụ + DB.

## Risk
| Rủi ro | Giảm thiểu |
|---|---|
| File quá dài (>2500 dòng) → khó đọc | Dùng TOC + heading nested; ai cần in PDF có table of contents |
| Trùng lặp với `concurrency-*.md` cũ | Báo cáo mới là canonical; user quyết định archive cũ |
| Mermaid không render trong vài viewer | Cung cấp ASCII fallback diagram |

## Security
- Không expose credential / secret trong báo cáo.
- Sample data dùng dữ liệu seed.

## Next
→ Phase 05: verify + finalize.
