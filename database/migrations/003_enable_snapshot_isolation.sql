-- 003_enable_snapshot_isolation.sql
-- Enable SNAPSHOT isolation for the database.
-- This is required for getDashboardSales() to use SNAPSHOT transactions
-- which prevent phantom reads without blocking concurrent writers.
--
-- This is a one-time change with minimal overhead.
-- Row versioning uses tempdb for version storage.

ALTER DATABASE csdl SET ALLOW_SNAPSHOT_ISOLATION ON;
GO
