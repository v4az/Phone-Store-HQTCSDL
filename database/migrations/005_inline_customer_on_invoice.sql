-- Inline customer info directly on SalesInvoice instead of using separate Customer table
-- Simpler: just store name + phone on the invoice. Search by phone for history.

-- Drop FK constraint first
ALTER TABLE SalesInvoice DROP CONSTRAINT FK_SalesInvoice_Customer;

-- Add inline customer columns
ALTER TABLE SalesInvoice ADD CustomerName NVARCHAR(200) NULL;
ALTER TABLE SalesInvoice ADD CustomerPhone NVARCHAR(20) NULL;

-- Migrate existing data from Customer table (if any)
UPDATE si
SET si.CustomerName = c.Name, si.CustomerPhone = c.Phone
FROM SalesInvoice si
JOIN Customer c ON si.CustomerId = c.CustomerId;

-- Drop CustomerId column
ALTER TABLE SalesInvoice DROP COLUMN CustomerId;
