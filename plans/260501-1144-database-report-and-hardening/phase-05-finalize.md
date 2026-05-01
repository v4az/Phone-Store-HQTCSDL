# Phase 05 — Verify & Finalize

## Context Links
- All previous phases.

## Overview
- **Priority:** P1
- **Status:** pending
- **Description:** End-to-end verification: migration applied, service hardening live, báo cáo đúng hiện trạng. Quyết định fate của các doc cũ.

## Key Insights
- Báo cáo phải khớp 100% với code thực — nếu lệch (vd: function/view khác tên) → fail.
- Cần chạy thực 5 concurrency demos trên SSMS / sqlcmd để screenshot kết quả nếu user muốn (optional).

## Requirements
- Migration 006 chạy trên DB sạch.
- 3 endpoint refactor pass smoke.
- `database-report.md` validate manual: TOC ↔ section, code snippets compile / runnable.
- Quyết định archive vs giữ docs cũ.

## Architecture
N/A.

## Related Code Files

**Read:**
- `docs/database-report.md`
- `database/migrations/006_*.sql`
- `lib/services/*.ts` (sanity check)

**Optional Modify (nếu user chọn archive):**
- Move `docs/concurrency-problems.md`, `docs/concurrency-problems.txt`, `docs/concurrency-fixes.md`, `docs/concurrency-demo.sql`, `docs/database_setup.md` → `docs/_archive/` hoặc xóa.

## Implementation Steps

1. **Reset & re-migrate:**
   ```bash
   docker compose down -v
   docker compose up -d --build
   # đợi ~30s cho migration chạy hết
   ```
2. **Verify migration history:**
   ```sql
   SELECT * FROM _MigrationHistory ORDER BY AppliedAt;
   ```
   Kỳ vọng: 7 file (001 → 007).
3. **Verify objects:**
   ```sql
   -- 13 USER_TABLE + 4 SQL_TRIGGER + 2 FN + 3 VIEW
   SELECT type_desc, COUNT(*) FROM sys.objects WHERE is_ms_shipped=0 GROUP BY type_desc;
   -- 6 NC indexes (5 từ migration 006 + 1 IX_AuditLog_Table_Time từ 007)
   SELECT t.name, i.name, i.type_desc FROM sys.indexes i JOIN sys.tables t ON i.object_id=t.object_id
     WHERE i.is_primary_key=0 AND i.is_unique_constraint=0 AND i.type_desc='NONCLUSTERED';
   -- AppUser seed
   SELECT * FROM AppUser;
   -- Audit trigger smoke
   UPDATE SalesInvoice SET CustomerName = N'Audit smoke' WHERE InvoiceId = 1;
   SELECT TOP 5 * FROM AuditLog ORDER BY AuditId DESC;
   ```
4. **Run app:** `pnpm dev`. Manual click qua các trang `/products`, `/inventory`, `/sales`, `/sales/new`. Đảm bảo không lỗi.
5. **TypeScript:** `pnpm tsc --noEmit`.
6. **Optional concurrency live demo:**
   - Mở 2 cửa sổ sqlcmd, chạy DEMO 4 (Lost Update) trong `concurrency-demo.sql`.
   - Verify stock = 2 sau test (10 - 3 - 5).
7. **Báo cáo cross-check:**
   - Đếm tables, indexes, functions, views trong báo cáo == sys.objects?
   - Mỗi service tx mention trong Ch.10 == thực tế trong code?
   - 5 concurrency fixes mô tả khớp `lib/services/sales.ts`, `report.ts`?
8. **Quyết định doc cũ:**
   - Hỏi user: keep / archive / delete `docs/concurrency-*.md` + `docs/database_setup.md`?
   - Default: keep (tham chiếu). Báo cáo đã là canonical.
9. **Commit:**
   ```bash
   git add database/migrations/006_*.sql lib/services/inventory.ts \
     app/api/inventory/route.ts app/api/reports/route.ts \
     lib/services/sales.ts docs/database-report.md
   git commit -m "feat(db): add functions/views/indexes + service hardening + comprehensive report"
   ```

## Todo
- [ ] Reset DB, re-run migrations
- [ ] Object inventory match báo cáo
- [ ] Smoke UI 4 trang
- [ ] tsc pass
- [ ] (optional) Concurrency live demo
- [ ] Cross-check báo cáo vs code
- [ ] User confirm doc archival
- [ ] Commit

## Success Criteria
- 7 migration trong `_MigrationHistory`
- DB objects khớp báo cáo (13 table + 4 trigger + 2 UDF + 3 view + 6 NC index + 3 user seed)
- AuditLog tự động ghi khi UPDATE/DELETE SalesInvoice / Product
- 4 trang UI hoạt động
- `pnpm tsc --noEmit` 0 error
- Báo cáo không lệch hiện trạng

## Risk
- Migration 006 conflict với data có sẵn (vd: tạo NC index trên bảng đang có row) — SQL Server cho phép, không issue.
- Frontend break do shape response thay đổi (Phase 03) → manual click test.

## Security
- N/A.

## Next
→ Hết plan. Có thể chạy `/ck:plan archive` để khoá lại + ghi journal.
