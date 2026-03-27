-- 001_init_schema.sql
-- Initial schema for phone & accessories inventory & sales management system
-- SQL Server

CREATE TABLE Brand (
    BrandId         INT             IDENTITY(1,1) NOT NULL,
    BrandName       NVARCHAR(100)   NOT NULL,
    Country         NVARCHAR(100)   NULL,
    IsActive        BIT             NOT NULL DEFAULT 1,
    CONSTRAINT PK_Brand PRIMARY KEY (BrandId)
);

CREATE TABLE Category (
    CategoryId          INT             IDENTITY(1,1) NOT NULL,
    CategoryName        NVARCHAR(100)   NOT NULL,
    ParentCategoryId    INT             NULL,
    IsActive            BIT             NOT NULL DEFAULT 1,
    CONSTRAINT PK_Category PRIMARY KEY (CategoryId),
    CONSTRAINT FK_Category_Parent FOREIGN KEY (ParentCategoryId) REFERENCES Category(CategoryId)
);

CREATE TABLE Product (
    ProductId       INT             IDENTITY(1,1) NOT NULL,
    ProductCode     NVARCHAR(50)    NOT NULL,
    ProductName     NVARCHAR(200)   NOT NULL,
    BrandId         INT             NOT NULL,
    CategoryId      INT             NOT NULL,
    WarrantyMonths  INT             NOT NULL DEFAULT 0,
    Description     NVARCHAR(500)   NULL,
    IsActive        BIT             NOT NULL DEFAULT 1,
    CONSTRAINT PK_Product PRIMARY KEY (ProductId),
    CONSTRAINT UQ_Product_Code UNIQUE (ProductCode),
    CONSTRAINT FK_Product_Brand FOREIGN KEY (BrandId) REFERENCES Brand(BrandId),
    CONSTRAINT FK_Product_Category FOREIGN KEY (CategoryId) REFERENCES Category(CategoryId)
);

CREATE TABLE ProductVariant (
    VariantId       INT             IDENTITY(1,1) NOT NULL,
    ProductId       INT             NOT NULL,
    Sku             NVARCHAR(50)    NOT NULL,
    Color           NVARCHAR(50)    NULL,
    Storage         NVARCHAR(20)    NULL,
    OtherAttributes NVARCHAR(500)   NULL,
    ImageUrl        NVARCHAR(500)   NULL,
    CostPrice       DECIMAL(18,2)   NOT NULL DEFAULT 0,
    RetailPrice     DECIMAL(18,2)   NOT NULL DEFAULT 0,
    IsActive        BIT             NOT NULL DEFAULT 1,
    CONSTRAINT PK_ProductVariant PRIMARY KEY (VariantId),
    CONSTRAINT UQ_ProductVariant_Sku UNIQUE (Sku),
    CONSTRAINT FK_ProductVariant_Product FOREIGN KEY (ProductId) REFERENCES Product(ProductId)
);

CREATE TABLE InventoryLocation (
    LocationId      INT             IDENTITY(1,1) NOT NULL,
    LocationName    NVARCHAR(100)   NOT NULL,
    Address         NVARCHAR(300)   NULL,
    CONSTRAINT PK_InventoryLocation PRIMARY KEY (LocationId)
);

CREATE TABLE InventoryStock (
    VariantId           INT     NOT NULL,
    LocationId          INT     NOT NULL,
    QuantityOnHand      INT     NOT NULL DEFAULT 0,
    QuantityReserved    INT     NOT NULL DEFAULT 0,
    CONSTRAINT PK_InventoryStock PRIMARY KEY (VariantId, LocationId),
    CONSTRAINT FK_InventoryStock_Variant FOREIGN KEY (VariantId) REFERENCES ProductVariant(VariantId),
    CONSTRAINT FK_InventoryStock_Location FOREIGN KEY (LocationId) REFERENCES InventoryLocation(LocationId)
);

CREATE TABLE Supplier (
    SupplierId      INT             IDENTITY(1,1) NOT NULL,
    Name            NVARCHAR(200)   NOT NULL,
    Phone           NVARCHAR(20)    NULL,
    Address         NVARCHAR(300)   NULL,
    IsActive        BIT             NOT NULL DEFAULT 1,
    CONSTRAINT PK_Supplier PRIMARY KEY (SupplierId)
);

CREATE TABLE Customer (
    CustomerId      INT             IDENTITY(1,1) NOT NULL,
    Name            NVARCHAR(200)   NOT NULL,
    Phone           NVARCHAR(20)    NULL,
    Address         NVARCHAR(300)   NULL,
    IsActive        BIT             NOT NULL DEFAULT 1,
    CONSTRAINT PK_Customer PRIMARY KEY (CustomerId)
);

CREATE TABLE PurchaseOrder (
    PurchaseId      INT             IDENTITY(1,1) NOT NULL,
    SupplierId      INT             NOT NULL,
    PurchaseDate    DATETIME        NOT NULL DEFAULT GETDATE(),
    Note            NVARCHAR(500)   NULL,
    TotalAmount     DECIMAL(18,2)   NOT NULL DEFAULT 0,
    CreatedBy       NVARCHAR(100)   NULL,
    CONSTRAINT PK_PurchaseOrder PRIMARY KEY (PurchaseId),
    CONSTRAINT FK_PurchaseOrder_Supplier FOREIGN KEY (SupplierId) REFERENCES Supplier(SupplierId)
);

CREATE TABLE PurchaseOrderLine (
    PurchaseId      INT             NOT NULL,
    [LineNo]          INT             NOT NULL,
    VariantId       INT             NOT NULL,
    Quantity        INT             NOT NULL DEFAULT 0,
    UnitCost        DECIMAL(18,2)   NOT NULL DEFAULT 0,
    LineTotal       DECIMAL(18,2)   NOT NULL DEFAULT 0,
    CONSTRAINT PK_PurchaseOrderLine PRIMARY KEY (PurchaseId, [LineNo]),
    CONSTRAINT FK_PurchaseOrderLine_Purchase FOREIGN KEY (PurchaseId) REFERENCES PurchaseOrder(PurchaseId),
    CONSTRAINT FK_PurchaseOrderLine_Variant FOREIGN KEY (VariantId) REFERENCES ProductVariant(VariantId)
);

CREATE TABLE SalesInvoice (
    InvoiceId       INT             IDENTITY(1,1) NOT NULL,
    InvoiceCode     NVARCHAR(50)    NOT NULL,
    CustomerId      INT             NULL,
    InvoiceDate     DATETIME        NOT NULL DEFAULT GETDATE(),
    TotalAmount     DECIMAL(18,2)   NOT NULL DEFAULT 0,
    DiscountAmount  DECIMAL(18,2)   NOT NULL DEFAULT 0,
    FinalAmount     DECIMAL(18,2)   NOT NULL DEFAULT 0,
    CreatedBy       NVARCHAR(100)   NULL,
    CONSTRAINT PK_SalesInvoice PRIMARY KEY (InvoiceId),
    CONSTRAINT UQ_SalesInvoice_Code UNIQUE (InvoiceCode),
    CONSTRAINT FK_SalesInvoice_Customer FOREIGN KEY (CustomerId) REFERENCES Customer(CustomerId)
);

CREATE TABLE SalesInvoiceLine (
    InvoiceId       INT             NOT NULL,
    [LineNo]          INT             NOT NULL,
    VariantId       INT             NOT NULL,
    Quantity        INT             NOT NULL DEFAULT 0,
    UnitPrice       DECIMAL(18,2)   NOT NULL DEFAULT 0,
    DiscountPct     DECIMAL(5,2)    NOT NULL DEFAULT 0,
    LineTotal       DECIMAL(18,2)   NOT NULL DEFAULT 0,
    CONSTRAINT PK_SalesInvoiceLine PRIMARY KEY (InvoiceId, [LineNo]),
    CONSTRAINT FK_SalesInvoiceLine_Invoice FOREIGN KEY (InvoiceId) REFERENCES SalesInvoice(InvoiceId),
    CONSTRAINT FK_SalesInvoiceLine_Variant FOREIGN KEY (VariantId) REFERENCES ProductVariant(VariantId)
);
