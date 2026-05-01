-- 007_add_user_and_audit.sql
-- Mục đích: bổ sung entity AppUser + AuditLog + 3 audit trigger để mô phỏng
-- hệ thống thực tế có user và audit trail.
-- (xem báo cáo docs/database-report.md - chương 7 cho trade-off chi tiết)

-- =============================================================
-- SECTION A: TABLES
-- =============================================================

-- AppUser: entity người dùng hệ thống (admin / manager / staff).
-- Auth (password, session) là app-layer, ngoài scope migration này.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'AppUser')
BEGIN
    CREATE TABLE AppUser (
        UserId    INT IDENTITY(1,1) PRIMARY KEY,
        Username  NVARCHAR(50)  NOT NULL UNIQUE,
        FullName  NVARCHAR(100) NOT NULL,
        Role      NVARCHAR(20)  NOT NULL,
        IsActive  BIT           NOT NULL DEFAULT 1,
        CreatedAt DATETIME      NOT NULL DEFAULT GETDATE(),
        CONSTRAINT CHK_AppUser_Role CHECK (Role IN (N'admin', N'manager', N'staff'))
    );
END;
GO

-- AuditLog: lịch sử thay đổi cho các entity nhạy cảm (SalesInvoice, Product, …).
-- OldValue/NewValue lưu JSON snapshot row trước/sau.
-- RecordId là NVARCHAR để hỗ trợ cả PK đơn lẫn composite (nếu cần).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'AuditLog')
BEGIN
    CREATE TABLE AuditLog (
        AuditId          BIGINT IDENTITY(1,1) PRIMARY KEY,
        TableName        NVARCHAR(100) NOT NULL,
        RecordId         NVARCHAR(100) NOT NULL,
        Action           NVARCHAR(20)  NOT NULL,
        OldValue         NVARCHAR(MAX) NULL,
        NewValue         NVARCHAR(MAX) NULL,
        ChangedAt        DATETIME      NOT NULL DEFAULT GETDATE(),
        ChangedByUserId  INT           NULL,
        CONSTRAINT CHK_AuditLog_Action CHECK (Action IN (N'INSERT', N'UPDATE', N'DELETE')),
        CONSTRAINT FK_AuditLog_AppUser FOREIGN KEY (ChangedByUserId) REFERENCES AppUser(UserId)
    );
END;
GO

-- Index tra cứu lịch sử theo bảng + thời gian (DESC để mới nhất trước).
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = N'IX_AuditLog_Table_Time' AND object_id = OBJECT_ID(N'dbo.AuditLog'))
    CREATE NONCLUSTERED INDEX IX_AuditLog_Table_Time
        ON dbo.AuditLog(TableName, ChangedAt DESC)
        INCLUDE (RecordId, Action, ChangedByUserId);
GO

-- =============================================================
-- SECTION B: SEED USERS
-- =============================================================

IF NOT EXISTS (SELECT 1 FROM AppUser WHERE Username = N'admin')
    INSERT INTO AppUser (Username, FullName, Role)
    VALUES (N'admin', N'Quản trị viên', N'admin');

IF NOT EXISTS (SELECT 1 FROM AppUser WHERE Username = N'manager01')
    INSERT INTO AppUser (Username, FullName, Role)
    VALUES (N'manager01', N'Trần Quản Lý', N'manager');

IF NOT EXISTS (SELECT 1 FROM AppUser WHERE Username = N'staff01')
    INSERT INTO AppUser (Username, FullName, Role)
    VALUES (N'staff01', N'Nguyễn Nhân Viên', N'staff');
GO

-- =============================================================
-- SECTION C: AUDIT TRIGGERS
-- =============================================================
-- Tất cả trigger ghi vào AuditLog. ChangedByUserId = NULL (system) trong scope
-- migration; muốn populate user → app phải set CONTEXT_INFO trước UPDATE/DELETE
-- và trigger đọc lại. Demo trade-off này trong báo cáo Ch.7.

-- Trigger 1: log khi UPDATE hoá đơn (đổi giá, đổi khách, đổi total, …).
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
GO

-- Trigger 2: log khi DELETE hoá đơn (giữ snapshot OldValue trước khi mất hẳn).
CREATE OR ALTER TRIGGER TR_SalesInvoice_AfterDelete_AuditLog
ON SalesInvoice
AFTER DELETE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO AuditLog (TableName, RecordId, Action, OldValue, NewValue, ChangedByUserId)
    SELECT
        N'SalesInvoice',
        CAST(d.InvoiceId AS NVARCHAR(100)),
        N'DELETE',
        (SELECT d2.* FROM deleted d2 WHERE d2.InvoiceId = d.InvoiceId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        NULL,
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
    INSERT INTO AuditLog (TableName, RecordId, Action, OldValue, NewValue, ChangedByUserId)
    SELECT
        N'Product',
        CAST(i.ProductId AS NVARCHAR(100)),
        N'UPDATE',
        (SELECT d2.* FROM deleted  d2 WHERE d2.ProductId = i.ProductId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        (SELECT i2.* FROM inserted i2 WHERE i2.ProductId = i.ProductId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        NULL
    FROM inserted i;
END;
GO
