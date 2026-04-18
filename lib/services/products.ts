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
 * Fetch all active products with their variants (for sale form dropdown).
 * Groups flat rows into Product -> Variants[] structure.
 */
export async function getProductsWithVariants(): Promise<Product[]> {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT
      p.ProductId, p.ProductCode, p.ProductName,
      p.BrandId, p.CategoryId, p.WarrantyMonths, p.Description, p.IsActive,
      b.BrandName, c.CategoryName,
      pv.VariantId, pv.Sku, pv.Color, pv.Storage,
      pv.CostPrice, pv.RetailPrice, pv.IsActive AS VariantIsActive,
      ISNULL(is_stk.QuantityOnHand, 0) - ISNULL(is_stk.QuantityReserved, 0) AS AvailableQty
    FROM Product p
    LEFT JOIN Brand b ON p.BrandId = b.BrandId
    LEFT JOIN Category c ON p.CategoryId = c.CategoryId
    LEFT JOIN ProductVariant pv ON p.ProductId = pv.ProductId AND pv.IsActive = 1
    LEFT JOIN InventoryStock is_stk ON pv.VariantId = is_stk.VariantId
    WHERE p.IsActive = 1
    ORDER BY p.ProductName, pv.Sku
  `);

  const productMap = new Map<number, Product>();

  for (const row of result.recordset) {
    if (!productMap.has(row.ProductId)) {
      productMap.set(row.ProductId, {
        ProductId: row.ProductId,
        ProductCode: row.ProductCode || "",
        ProductName: row.ProductName,
        BrandId: row.BrandId,
        BrandName: row.BrandName || "",
        CategoryId: row.CategoryId,
        CategoryName: row.CategoryName || "",
        WarrantyMonths: row.WarrantyMonths || 0,
        Description: row.Description || null,
        IsActive: true,
        Variants: [],
      });
    }
    if (row.VariantId !== null) {
      productMap.get(row.ProductId)!.Variants.push({
        VariantId: row.VariantId,
        ProductId: row.ProductId,
        Sku: row.Sku || "",
        Color: row.Color || null,
        Storage: row.Storage || null,
        OtherAttributes: null,
        ImageUrl: null,
        CostPrice: row.CostPrice || 0,
        RetailPrice: row.RetailPrice || 0,
        IsActive: true,
        QuantityOnHand: row.AvailableQty ?? 0,
      });
    }
  }

  return Array.from(productMap.values());
}

/**
 * Create a new product with optional variants in a transaction
 *
 * - `product` contains product fields (no Variants)
 * - `variants` are optional and loaded later from getProductById
 */
export async function createProduct(
  product: Omit<Product, "ProductId" | "Variants">,
  variants?: (Omit<ProductVariant, "VariantId" | "ProductId"> & { QuantityOnHand?: number })[]
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
      // Ensure a default inventory location exists (trigger needs at least one)
      await transaction
        .request()
        .query(`
          IF NOT EXISTS (SELECT 1 FROM InventoryLocation)
            INSERT INTO InventoryLocation (LocationName, Address)
            VALUES (N'Main Store', N'Default location')
        `);

      for (const variant of variants) {
        // Use SCOPE_IDENTITY() instead of OUTPUT to avoid trigger conflict
        // (TR_ProductVariant_AfterInsert blocks OUTPUT without INTO clause)
        const variantResult = await transaction
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
              (@productId, @sku, @color, @storage, @otherAttributes, @imageUrl, @costPrice, @retailPrice, @isActive);
            SELECT SCOPE_IDENTITY() AS VariantId;
          `);

        // Trigger auto-creates InventoryStock with qty 0 — update if initial qty provided
        const newVariantId = variantResult.recordset[0].VariantId;
        const initialQty = variant.QuantityOnHand ?? 0;
        if (initialQty > 0) {
          await transaction
            .request()
            .input("variantId", sql.Int, newVariantId)
            .input("quantityOnHand", sql.Int, initialQty)
            .query(`
              UPDATE InventoryStock
              SET QuantityOnHand = @quantityOnHand
              WHERE VariantId = @variantId
            `);
        }
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
        pv.IsActive AS VariantIsActive,
        is_stk.QuantityOnHand,
        is_stk.QuantityReserved
      FROM Product p
      LEFT JOIN Brand b ON p.BrandId = b.BrandId
      LEFT JOIN Category c ON p.CategoryId = c.CategoryId
      LEFT JOIN ProductVariant pv ON p.ProductId = pv.ProductId
      LEFT JOIN InventoryStock is_stk ON pv.VariantId = is_stk.VariantId
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
        IsActive: row.VariantIsActive !== undefined ? row.VariantIsActive : true,
        QuantityOnHand: row.QuantityOnHand ?? 0,
        QuantityReserved: row.QuantityReserved ?? 0,
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

    // UPDLOCK: lock the Product row to serialize against concurrent updateProduct()
    // This prevents dirty write: if updateProduct() runs concurrently, it must wait
    // until this transaction finishes — so it can't re-activate a product mid-delete.
    const lockResult = await transaction
      .request()
      .input("productId", sql.Int, productId)
      .query(`
        SELECT ProductId FROM Product WITH (UPDLOCK)
        WHERE ProductId = @productId
      `);

    if (lockResult.recordset.length === 0) {
      await transaction.commit();
      return false; // product doesn't exist
    }

    // Soft delete product
    await transaction
      .request()
      .input("productId", sql.Int, productId)
      .query(`
        UPDATE Product
        SET IsActive = 0
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
    return true;
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

export async function updateProduct(
  productId: number,
  product: Partial<Omit<Product, "ProductId" | "Variants">>
): Promise<Product | null> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const sets: string[] = [];
    const request = transaction.request();
    request.input("productId", sql.Int, productId);

    if (product.ProductCode !== undefined) {
      request.input("productCode", sql.NVarChar(50), product.ProductCode);
      sets.push("ProductCode = @productCode");
    }
    if (product.ProductName !== undefined) {
      request.input("productName", sql.NVarChar(200), product.ProductName);
      sets.push("ProductName = @productName");
    }
    if (product.BrandId !== undefined) {
      request.input("brandId", sql.Int, product.BrandId);
      sets.push("BrandId = @brandId");
    }
    if (product.BrandName !== undefined) {
      request.input("brandName", sql.NVarChar(100), product.BrandName);
      sets.push("b.BrandName = @brandName"); // if you keep it in Brand, not Product
    }
    if (product.CategoryId !== undefined) {
      request.input("categoryId", sql.Int, product.CategoryId);
      sets.push("CategoryId = @categoryId");
    }
    if (product.CategoryName !== undefined) {
      request.input("categoryName", sql.NVarChar(100), product.CategoryName);
      sets.push("c.CategoryName = @categoryName");
    }
    if (product.WarrantyMonths !== undefined) {
      request.input("warrantyMonths", sql.Int, product.WarrantyMonths);
      sets.push("WarrantyMonths = @warrantyMonths");
    }
    if (product.Description !== undefined) {
      request.input("description", sql.NVarChar, product.Description ?? null);
      sets.push("Description = @description");
    }
    if (product.IsActive !== undefined) {
      request.input("isActive", sql.Bit, product.IsActive);
      sets.push("IsActive = @isActive");
    }

    if (sets.length === 0) {
      await transaction.commit();
      return await getProductById(productId);
    }

    // Only update Product table fields that live in Product
    const query = `
      UPDATE Product
      SET ${sets.filter(s => !s.includes("b.BrandName") && !s.includes("c.CategoryName")).join(", ")}
      OUTPUT INSERTED.*
      WHERE ProductId = @productId
    `;

    const result = await request.query(query);
    await transaction.commit();

    if (result.recordset.length === 0) return null;

    return result.recordset[0] as Product;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Update inventory quantities for multiple variants in a single transaction.
 * Each entry maps VariantId -> new QuantityOnHand value.
 */
export async function updateInventoryStock(
  updates: { VariantId: number; QuantityOnHand: number }[]
): Promise<void> {
  if (updates.length === 0) return;

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    for (const { VariantId, QuantityOnHand } of updates) {
      await transaction
        .request()
        .input("variantId", sql.Int, VariantId)
        .input("quantityOnHand", sql.Int, QuantityOnHand)
        .query(`
          UPDATE InventoryStock
          SET QuantityOnHand = @quantityOnHand
          WHERE VariantId = @variantId
        `);
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
