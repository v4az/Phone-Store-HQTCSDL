-- 002_seed_data.sql
-- Seed data: location, brands, categories, 10 products with variants, inventory

-- Default inventory location (must exist before inventory stock rows)
INSERT INTO InventoryLocation (LocationName, Address)
VALUES (N'Main Store', N'Default location');

-- Brands
INSERT INTO Brand (BrandName, Country) VALUES (N'Apple', N'USA');
INSERT INTO Brand (BrandName, Country) VALUES (N'Samsung', N'South Korea');
INSERT INTO Brand (BrandName, Country) VALUES (N'Xiaomi', N'China');
INSERT INTO Brand (BrandName, Country) VALUES (N'OPPO', N'China');
INSERT INTO Brand (BrandName, Country) VALUES (N'Anker', N'China');

-- Categories
INSERT INTO Category (CategoryName, ParentCategoryId) VALUES (N'Phones', NULL);           -- 1
INSERT INTO Category (CategoryName, ParentCategoryId) VALUES (N'Accessories', NULL);       -- 2
INSERT INTO Category (CategoryName, ParentCategoryId) VALUES (N'Cases', 2);                -- 3
INSERT INTO Category (CategoryName, ParentCategoryId) VALUES (N'Chargers', 2);             -- 4
INSERT INTO Category (CategoryName, ParentCategoryId) VALUES (N'Earphones', 2);            -- 5

-- Product 1: iPhone 15
INSERT INTO Product (ProductCode, ProductName, BrandId, CategoryId, WarrantyMonths, Description)
VALUES (N'IP15', N'iPhone 15', 1, 1, 12, N'Apple iPhone 15');

INSERT INTO ProductVariant (ProductId, Sku, Color, Storage, CostPrice, RetailPrice)
VALUES (1, N'IP15-BLK-128', N'Black', N'128GB', 18000000, 22990000);

INSERT INTO ProductVariant (ProductId, Sku, Color, Storage, CostPrice, RetailPrice)
VALUES (1, N'IP15-BLU-256', N'Blue', N'256GB', 20000000, 25990000);

-- Product 2: iPhone 15 Pro Max
INSERT INTO Product (ProductCode, ProductName, BrandId, CategoryId, WarrantyMonths, Description)
VALUES (N'IP15PM', N'iPhone 15 Pro Max', 1, 1, 12, N'Apple iPhone 15 Pro Max');

INSERT INTO ProductVariant (ProductId, Sku, Color, Storage, CostPrice, RetailPrice)
VALUES (2, N'IP15PM-NAT-256', N'Natural Titanium', N'256GB', 28000000, 34990000);

-- Product 3: Samsung Galaxy S24 Ultra
INSERT INTO Product (ProductCode, ProductName, BrandId, CategoryId, WarrantyMonths, Description)
VALUES (N'SGS24U', N'Samsung Galaxy S24 Ultra', 2, 1, 12, N'Samsung Galaxy S24 Ultra');

INSERT INTO ProductVariant (ProductId, Sku, Color, Storage, CostPrice, RetailPrice)
VALUES (3, N'SGS24U-BLK-256', N'Titanium Black', N'256GB', 26000000, 31990000);

INSERT INTO ProductVariant (ProductId, Sku, Color, Storage, CostPrice, RetailPrice)
VALUES (3, N'SGS24U-GRY-512', N'Titanium Gray', N'512GB', 29000000, 35990000);

-- Product 4: Samsung Galaxy A15
INSERT INTO Product (ProductCode, ProductName, BrandId, CategoryId, WarrantyMonths, Description)
VALUES (N'SGA15', N'Samsung Galaxy A15', 2, 1, 12, N'Samsung Galaxy A15');

INSERT INTO ProductVariant (ProductId, Sku, Color, Storage, CostPrice, RetailPrice)
VALUES (4, N'SGA15-BLU-128', N'Blue Black', N'128GB', 3500000, 4990000);

-- Product 5: Xiaomi 14
INSERT INTO Product (ProductCode, ProductName, BrandId, CategoryId, WarrantyMonths, Description)
VALUES (N'XM14', N'Xiaomi 14', 3, 1, 12, N'Xiaomi 14');

INSERT INTO ProductVariant (ProductId, Sku, Color, Storage, CostPrice, RetailPrice)
VALUES (5, N'XM14-BLK-256', N'Black', N'256GB', 10000000, 12990000);

-- Product 6: OPPO Reno 11
INSERT INTO Product (ProductCode, ProductName, BrandId, CategoryId, WarrantyMonths, Description)
VALUES (N'OPR11', N'OPPO Reno 11', 4, 1, 12, N'OPPO Reno 11');

INSERT INTO ProductVariant (ProductId, Sku, Color, Storage, CostPrice, RetailPrice)
VALUES (6, N'OPR11-GRN-256', N'Rock Green', N'256GB', 8000000, 10990000);

-- Product 7: Apple iPhone 15 Case
INSERT INTO Product (ProductCode, ProductName, BrandId, CategoryId, WarrantyMonths, Description)
VALUES (N'IP15-CASE', N'iPhone 15 Silicone Case', 1, 3, 0, N'Apple silicone case for iPhone 15');

INSERT INTO ProductVariant (ProductId, Sku, Color, Storage, CostPrice, RetailPrice)
VALUES (7, N'IP15-CASE-BLK', N'Black', NULL, 500000, 1290000);

INSERT INTO ProductVariant (ProductId, Sku, Color, Storage, CostPrice, RetailPrice)
VALUES (7, N'IP15-CASE-BLU', N'Storm Blue', NULL, 500000, 1290000);

-- Product 8: Anker 65W Charger
INSERT INTO Product (ProductCode, ProductName, BrandId, CategoryId, WarrantyMonths, Description)
VALUES (N'ANK-65W', N'Anker 65W USB-C Charger', 5, 4, 18, N'Anker Nano II 65W fast charger');

INSERT INTO ProductVariant (ProductId, Sku, Color, Storage, CostPrice, RetailPrice)
VALUES (8, N'ANK-65W-WHT', N'White', NULL, 400000, 890000);

-- Product 9: Samsung Galaxy Buds FE
INSERT INTO Product (ProductCode, ProductName, BrandId, CategoryId, WarrantyMonths, Description)
VALUES (N'SG-BUDSFE', N'Samsung Galaxy Buds FE', 2, 5, 6, N'Samsung Galaxy Buds FE wireless earbuds');

INSERT INTO ProductVariant (ProductId, Sku, Color, Storage, CostPrice, RetailPrice)
VALUES (9, N'SG-BUDSFE-GRA', N'Graphite', NULL, 1500000, 2490000);

-- Product 10: Anker USB-C Cable
INSERT INTO Product (ProductCode, ProductName, BrandId, CategoryId, WarrantyMonths, Description)
VALUES (N'ANK-USBC', N'Anker USB-C to USB-C Cable 1m', 5, 4, 12, N'Anker braided USB-C cable');

INSERT INTO ProductVariant (ProductId, Sku, Color, Storage, CostPrice, RetailPrice)
VALUES (10, N'ANK-USBC-BLK', N'Black', NULL, 100000, 290000);

-- Initialize inventory stock for all variants at the default location
-- (Trigger in 004 handles future inserts, but seed data runs before trigger exists)
INSERT INTO InventoryStock (VariantId, LocationId, QuantityOnHand, QuantityReserved)
SELECT pv.VariantId, 1, 10, 0
FROM ProductVariant pv
WHERE NOT EXISTS (
  SELECT 1 FROM InventoryStock ist
  WHERE ist.VariantId = pv.VariantId AND ist.LocationId = 1
);
