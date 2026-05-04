-- 007_add_audit_log.sql (filename giữ "user_and_audit" vì lý do migration history)
-- Mục đích: bổ sung AuditLog table + 3 audit trigger để mô phỏng audit trail
-- của hệ thống thực tế. Không có entity user — audit ở cấp system.
-- (xem báo cáo docs/database-report.md - chương 7 cho trade-off chi tiết)

-- =============================================================
-- SECTION A: TABLES
-- =============================================================

-- AuditLog: lịch sử thay đổi cho các entity nhạy cảm (SalesInvoice, Product, …).
-- OldValue/NewValue lưu JSON snapshot row trước/sau.
-- RecordId là NVARCHAR để hỗ trợ cả PK đơn lẫn composite (nếu cần).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'AuditLog')
BEGIN
    CREATE TABLE AuditLog (
        AuditId    BIGINT IDENTITY(1,1) PRIMARY KEY,
        TableName  NVARCHAR(100) NOT NULL,
        RecordId   NVARCHAR(100) NOT NULL,
        Action     NVARCHAR(20)  NOT NULL,
        OldValue   NVARCHAR(MAX) NULL,
        NewValue   NVARCHAR(MAX) NULL,
        ChangedAt  DATETIME      NOT NULL DEFAULT GETDATE(),
        CONSTRAINT CHK_AuditLog_Action CHECK (Action IN (N'INSERT', N'UPDATE', N'DELETE'))
    );
END;
GO

-- Index tra cứu lịch sử theo bảng + thời gian (DESC để mới nhất trước).
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = N'IX_AuditLog_Table_Time' AND object_id = OBJECT_ID(N'dbo.AuditLog'))
    CREATE NONCLUSTERED INDEX IX_AuditLog_Table_Time
        ON dbo.AuditLog(TableName, ChangedAt DESC)
        INCLUDE (RecordId, Action);
GO

-- =============================================================
-- SECTION B: AUDIT TRIGGERS
-- =============================================================
-- Tất cả trigger ghi vào AuditLog. Audit không gắn user (system context only).

-- Trigger 1: log khi UPDATE hoá đơn (đổi giá, đổi khách, đổi total, …).
CREATE OR ALTER TRIGGER TR_SalesInvoice_AfterUpdate_AuditLog
ON SalesInvoice
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO AuditLog (TableName, RecordId, Action, OldValue, NewValue)
    SELECT
        N'SalesInvoice',
        CAST(i.InvoiceId AS NVARCHAR(100)),
        N'UPDATE',
        (SELECT d2.* FROM deleted  d2 WHERE d2.InvoiceId = i.InvoiceId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        (SELECT i2.* FROM inserted i2 WHERE i2.InvoiceId = i.InvoiceId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM inserted i;
END;
GO

-- Trigger 2: log khi DELETE hoá đơn (giữ snapshot OldValue trước khi mất hẳn).
CREATE OR ALTER TRIGGER TR_SalesInvoice_AfterDelete_AuditLog
ON SalesInvoice
AFTER DELETE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO AuditLog (TableName, RecordId, Action, OldValue, NewValue)
    SELECT
        N'SalesInvoice',
        CAST(d.InvoiceId AS NVARCHAR(100)),
        N'DELETE',
        (SELECT d2.* FROM deleted d2 WHERE d2.InvoiceId = d.InvoiceId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        NULL
    FROM deleted d;
END;
GO

-- Trigger 3: log khi UPDATE sản phẩm (đổi giá, đổi mô tả, soft delete, …).
CREATE OR ALTER TRIGGER TR_Product_AfterUpdate_AuditLog
ON Product
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO AuditLog (TableName, RecordId, Action, OldValue, NewValue)
    SELECT
        N'Product',
        CAST(i.ProductId AS NVARCHAR(100)),
        N'UPDATE',
        (SELECT d2.* FROM deleted  d2 WHERE d2.ProductId = i.ProductId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        (SELECT i2.* FROM inserted i2 WHERE i2.ProductId = i.ProductId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM inserted i;
END;
GO
