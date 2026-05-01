---
name: Database Report & System Hardening
slug: database-report-and-hardening
created: 2026-05-01 11:44
status: in_progress
blockedBy: []
blocks: []
---

# Plan — Database Report & System Hardening

## Mục tiêu

Viết báo cáo môn học toàn diện về CSDL của hệ thống Phone-Store, bao gồm: entity, table, relation, function, view, trigger, index, transaction, 5 concurrency problems (demo + fix). Báo cáo phải mô tả nghiệp vụ, tác dụng, và **trade-off** khi chọn từng cơ chế. Đầu ra: 1 file `docs/database-report.md`.

Trước khi viết báo cáo, audit + bổ sung các đối tượng DB còn thiếu (UDF, view, NC index) và sửa 3 gap service-layer để hệ thống thực sự "đủ tầng" như báo cáo mô tả.

## Bối cảnh

- Stack: Next.js (App Router) + SQL Server 2022 + `mssql` driver
- Audit: schema có 11 bảng, 1 trigger, 0 UDF, 0 view, 0 NC index. Service layer concurrency patterns đã chuẩn (UPDLOCK, atomic update, SNAPSHOT).
- 3 gap service: `/api/inventory` raw query bypass, `getInvoiceById` 2 query rời, `/api/reports` không bọc SNAPSHOT.
- "Hệ thống thực tế có user" → bổ sung entity `AppUser` (admin/manager/staff) + `AuditLog` + audit triggers (mô phỏng audit trail của hệ thống production).

## Phases

| Phase | Tên | Trạng thái |
|---|---|---|
| 01 | Baseline audit & fixtures | pending |
| 02 | Add DB objects — migration 006 (UDF/view/index) + 007 (AppUser/AuditLog/triggers) | pending |
| 03 | Service-layer hardening (3 fixes) | pending |
| 04 | Compose `docs/database-report.md` | pending |
| 05 | Verify migrations + smoke test + finalize | pending |

## Dependencies

- Phase 01 → 02 → 03 → 04 → 05 (sequential).
- Phase 04 cần Phase 02 + 03 hoàn thành để mô tả đúng hiện trạng.

## Reference reports

- `plans/reports/scout-260501-1144-schema-inventory.md` — schema gap audit
- `plans/reports/scout-260501-1144-service-tx-audit.md` — service layer tx audit

## Reference docs (existing)

- `docs/database_setup.md` — schema overview (sẽ được hợp nhất vào báo cáo cuối)
- `docs/concurrency-problems.md` — 4 problems với example queries
- `docs/concurrency-fixes.md` — chi tiết các fix đã làm
- `docs/concurrency-demo.sql` — script SSMS demo

Báo cáo `database-report.md` sẽ kế thừa nội dung và mở rộng với: entity/relation diagram, function, view, index, trade-off analysis.

## Success criteria

- [ ] Migration 006 + 007 chạy thành công; UDF/view/index/AppUser/AuditLog/audit-trigger hoạt động
- [ ] 3 service gap đã fix, smoke test pass (POST /api/sales, GET /api/inventory, GET /api/reports)
- [ ] AuditLog entry tự động được tạo khi UPDATE/DELETE SalesInvoice hoặc Product
- [ ] `docs/database-report.md` đầy đủ 12 chương, mô tả đúng hiện trạng sau hardening (gồm AppUser + AuditLog)
- [ ] Mỗi mục tx/func/index/trigger đều có **trade-off section** (vì sao chọn, vì sao không chọn lựa chọn khác)
