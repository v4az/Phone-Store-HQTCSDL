# Phase 01 — Baseline Audit & Fixtures

## Context Links
- `plans/reports/scout-260501-1144-schema-inventory.md`
- `plans/reports/scout-260501-1144-service-tx-audit.md`
- `docs/database_setup.md`, `docs/concurrency-fixes.md`

## Overview
- **Priority:** P0 (gate for following phases)
- **Status:** pending
- **Description:** Verify Docker stack runs, current migrations apply cleanly, current concurrency tests pass. Snapshot baseline metrics.

## Key Insights
- 5 migrations đã apply trong Docker image; nếu reset volume sẽ chạy lại từ đầu.
- `_MigrationHistory` table track tên file đã chạy.
- SNAPSHOT đã ON từ migration 003.
- Báo cáo cần dữ liệu seed có thực — kiểm tra `002_seed_data.sql` đã insert: 4 brands, ~10 products, variants, 1 location, stock=10 mỗi variant.

## Requirements
- Stack chạy: `docker compose up -d --build` thành công, port 1433 mở.
- `pnpm dev` chạy được, `/api/products` và `/api/inventory` trả 200.
- Baseline ghi nhận: số bảng, số object, snapshot trạng thái trước hardening.

## Architecture
N/A — phase verification only.

## Related Code Files

**Read:**
- `database/migrations/001_init_schema.sql` … `005_inline_customer_on_invoice.sql`
- `database/init-db.sh`
- `lib/db.ts`

**Modify:** none.
**Create:** none.

## Implementation Steps

1. `docker compose up -d --build` (hoặc `docker compose up -d` nếu image đã build).
2. Đợi ~30s, chạy:
   ```bash
   docker exec -i csdl-sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'YourStrong@Passw0rd' -C -d csdl -Q "SELECT name FROM _MigrationHistory ORDER BY AppliedAt"
   ```
   Kỳ vọng: 5 file 001→005.
3. Inventory current objects:
   ```sql
   SELECT type_desc, name FROM sys.objects WHERE is_ms_shipped=0 ORDER BY type_desc, name;
   SELECT name FROM sys.indexes WHERE object_id IN (SELECT object_id FROM sys.tables) AND is_primary_key=0 AND is_unique_constraint=0;
   ```
   Kỳ vọng: 11 USER_TABLE + 1 SQL_TRIGGER (`TR_ProductVariant_AfterInsert`) + 0 indexes ngoài PK.
4. Lưu output snapshot vào `plans/260501-1144-database-report-and-hardening/baseline-objects.txt`.
5. Smoke test API:
   ```bash
   curl -s http://localhost:3000/api/products | head
   curl -s http://localhost:3000/api/inventory | head
   curl -s http://localhost:3000/api/reports | head
   ```
6. Confirm `pnpm dev` build pass: `pnpm tsc --noEmit` (no type errors).

## Todo
- [ ] Docker stack up
- [ ] Migration history check
- [ ] Object inventory snapshot
- [ ] API smoke tests
- [ ] TypeScript no-emit check

## Success Criteria
- Tất cả 5 migration trong `_MigrationHistory`.
- Object inventory khớp scout report (11 tables + 1 trigger).
- 3 endpoint trả 200.
- `tsc --noEmit` không lỗi.

## Risk
- **Volume cũ** chứa schema lỗi từ lần chạy trước → `docker compose down -v` rồi `up -d --build`.
- Port 1433 / 3000 conflict → kill process khác hoặc đổi port `.env.local`.

## Security
- N/A (chỉ verify).

## Next
→ Phase 02: viết migration 006 thêm UDF/view/index.
