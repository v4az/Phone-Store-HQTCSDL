import { getPool } from "../db";
import sql from "mssql";
import { Product, ProductVariant } from "../types";

/**
 * Fetch all products (without variants) for the product list page
 *
 * Returns:
 *   - ProductInfo: id, code, name, brand, category, warranty, description, isActive
 *   - Variants are NOT loaded here (loaded later on detail page)
 */
export async function getProducts(): Promise<Omit<Product, "Variants">[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query(`
      SELECT
        p.ProductId,
        p.ProductCode,
        p.ProductName,
        p.BrandId,
        p.CategoryId,
        p.WarrantyMonths,
        p.Description,
        p.IsActive,
        b.BrandName,
        c.CategoryName
      FROM Product p
      LEFT JOIN Brand b ON p.BrandId = b.BrandId
      LEFT JOIN Category c ON p.CategoryId = c.CategoryId
      ORDER BY p.ProductName
    `);

  return result.recordset.map((row) => ({
    ProductId: row.ProductId,
    ProductCode: row.ProductCode || "",
    ProductName: row.ProductName,
    BrandId: row.BrandId,
    BrandName: row.BrandName || "",
    CategoryId: row.CategoryId,
    CategoryName: row.CategoryName || "",
    WarrantyMonths: row.WarrantyMonths || 0,
    Description: row.Description || null,
    IsActive: row.IsActive !== undefined ? row.IsActive : true,
    Variants: []   // empty; variants are loaded later
  }));
}

/**
 * Create a new product with optional variants in a transaction
 *
 * - `product` contains product fields (no Variants)
 * - `variants` are optional and loaded later from getProductById
 */
export async function createProduct(
  product: Omit<Product, "ProductId" | "Variants">,
  variants?: Omit<ProductVariant, "VariantId" | "ProductId">[]
): Promise<Product> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const productResult = await transaction
      .request()
      .input("productCode", sql.NVarChar(50), product.ProductCode)
      .input("productName", sql.NVarChar(200), product.ProductName)
      .input("brandId", sql.Int, product.BrandId)
      .input("categoryId", sql.Int, product.CategoryId)
      .input("warrantyMonths", sql.Int, product.WarrantyMonths)
      .input("description", sql.NVarChar, product.Description)
      .input("isActive", sql.Bit, product.IsActive)
      .query(`
        INSERT INTO Product
          (ProductCode, ProductName, BrandId, CategoryId, WarrantyMonths, Description, IsActive)
        OUTPUT INSERTED.*
        VALUES
          (@productCode, @productName, @brandId, @categoryId, @warrantyMonths, @description, @isActive)
      `);

    const newProduct = productResult.recordset[0] as Product;

    if (variants && variants.length > 0) {
      for (const variant of variants) {
        await transaction
          .request()
          .input("productId", sql.Int, newProduct.ProductId)
          .input("sku", sql.NVarChar(50), variant.Sku)
          .input("color", sql.NVarChar, variant.Color)
          .input("storage", sql.NVarChar, variant.Storage)
          .input("otherAttributes", sql.NVarChar, variant.OtherAttributes)
          .input("imageUrl", sql.NVarChar, variant.ImageUrl)
          .input("costPrice", sql.Decimal(18, 2), variant.CostPrice)
          .input("retailPrice", sql.Decimal(18, 2), variant.RetailPrice)
          .input("isActive", sql.Bit, variant.IsActive)
          .query(`
            INSERT INTO ProductVariant
              (ProductId, Sku, Color, Storage, OtherAttributes, ImageUrl, CostPrice, RetailPrice, IsActive)
            VALUES
              (@productId, @sku, @color, @storage, @otherAttributes, @imageUrl, @costPrice, @retailPrice, @isActive)
          `);
      }
    }

    await transaction.commit();
    return newProduct;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Fetch a single product by ID with its variants (detail page only)
 */
export async function getProductById(productId: number): Promise<Product | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("productId", sql.Int, productId)
    .query(`
      SELECT
        p.ProductId,
        p.ProductCode,
        p.ProductName,
        p.BrandId,
        p.CategoryId,
        p.WarrantyMonths,
        p.Description,
        p.IsActive,
        b.BrandName,
        c.CategoryName,
        pv.VariantId,
        pv.Sku,
        pv.Color,
        pv.Storage,
        pv.OtherAttributes,
        pv.ImageUrl,
        pv.CostPrice,
        pv.RetailPrice,
        pv.IsActive AS VariantIsActive
      FROM Product p
      LEFT JOIN Brand b ON p.BrandId = b.BrandId
      LEFT JOIN Category c ON p.CategoryId = c.CategoryId
      LEFT JOIN ProductVariant pv ON p.ProductId = pv.ProductId
      WHERE p.ProductId = @productId
    `);

  const rows = result.recordset;

  if (rows.length === 0) return null;

  const productRow = rows[0];
  const product: Product = {
    ProductId: productRow.ProductId,
    ProductCode: productRow.ProductCode || "",
    ProductName: productRow.ProductName,
    BrandId: productRow.BrandId,
    BrandName: productRow.BrandName || "",
    CategoryId: productRow.CategoryId,
    CategoryName: productRow.CategoryName || "",
    WarrantyMonths: productRow.WarrantyMonths || 0,
    Description: productRow.Description || null,
    IsActive: productRow.IsActive !== undefined ? productRow.IsActive : true,
    Variants: [] as ProductVariant[]
  };

  for (const row of rows) {
    if (row.VariantId !== null) {
      product.Variants.push({
        VariantId: row.VariantId,
        ProductId: row.ProductId,
        Sku: row.Sku || "",
        Color: row.Color || null,
        Storage: row.Storage || null,
        OtherAttributes: row.OtherAttributes || null,
        ImageUrl: row.ImageUrl || null,
        CostPrice: row.CostPrice || 0,
        RetailPrice: row.RetailPrice || 0,
        IsActive: row.VariantIsActive !== undefined ? row.VariantIsActive : true
      });
    }
  }

  return product;
}

/**
 * Soft delete a product and all its variants (set IsActive = 0)
 */
export async function softDeleteProduct(productId: number): Promise<boolean> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // Soft delete product
    const productResult = await transaction
      .request()
      .input("productId", sql.Int, productId)
      .query(`
        UPDATE Product
        SET IsActive = 0
        OUTPUT INSERTED.*
        WHERE ProductId = @productId
      `);

    // Soft delete all variants
    await transaction
      .request()
      .input("productId", sql.Int, productId)
      .query(`
        UPDATE ProductVariant
        SET IsActive = 0
        WHERE ProductId = @productId
      `);

    await transaction.commit();

    return productResult.recordset.length > 0; // true if product existed
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Hard delete a product and all its variants (physical DELETE)
 * Only use this for admin / cleanup, not for normal user delete.
 */
export async function hardDeleteProduct(productId: number): Promise<boolean> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // Delete product (cascade via FK will cover ProductVariant)
    // If you don’t have ON DELETE CASCADE, delete variants first:
    const variantsResult = await transaction
      .request()
      .input("productId", sql.Int, productId)
      .query(`
        DELETE FROM ProductVariant
        OUTPUT DELETED.*
        WHERE ProductId = @productId
      `);

    const productResult = await transaction
      .request()
      .input("productId", sql.Int, productId)
      .query(`
        DELETE FROM Product
        OUTPUT DELETED.*
        WHERE ProductId = @productId
      `);

    await transaction.commit();

    return productResult.recordset.length > 0;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}