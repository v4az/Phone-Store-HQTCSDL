import { getPool } from "@/lib/db";
import { Category } from "@/lib/types";
import sql from "mssql";

/**
 * Fetch all ACTIVE categories from the database (IsActive = true)
 */
export async function getCategories(): Promise<Category[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query(`
      SELECT MIN(CategoryId) as CategoryId, CategoryName, MIN(ParentCategoryId) as ParentCategoryId, CAST(1 AS BIT) as IsActive
      FROM Category 
      WHERE IsActive = 1 
      GROUP BY CategoryName 
      ORDER BY CategoryName
    `);
  return result.recordset;
}

/**
 * Fetch a single ACTIVE category by ID
 */
export async function getCategoryById(categoryId: number): Promise<Category | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("categoryId", sql.Int, categoryId)
    .query("SELECT * FROM Category WHERE CategoryId = @categoryId AND IsActive = 1");

  return result.recordset.length > 0 ? result.recordset[0] : null;
}

/**
 * Create a new category
 */
export async function createCategory(
  category: Omit<Category, "CategoryId">
): Promise<Category> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("categoryName", sql.NVarChar(100), category.CategoryName)
    .input("parentCategoryId", sql.Int, category.ParentCategoryId)
    .input("isActive", sql.Bit, category.IsActive ?? true)
    .query(`
      INSERT INTO Category (CategoryName, ParentCategoryId, IsActive)
      OUTPUT INSERTED.*
      VALUES (@categoryName, @parentCategoryId, @isActive)
    `);

  return result.recordset[0];
}

/**
 * Update an existing category (only for ACTIVE categories)
 */
export async function updateCategory(
  categoryId: number,
  category: Partial<Omit<Category, "CategoryId">>
): Promise<Category | null> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const request = transaction.request();
    request.input("categoryId", sql.Int, categoryId);

    const sets: string[] = [];

    if (category.CategoryName !== undefined) {
      request.input("categoryName", sql.NVarChar(100), category.CategoryName);
      sets.push("CategoryName = @categoryName");
    }
    if (category.ParentCategoryId !== undefined) {
      request.input("parentCategoryId", sql.Int, category.ParentCategoryId);
      sets.push("ParentCategoryId = @parentCategoryId");
    }
    if (category.IsActive !== undefined) {
      request.input("isActive", sql.Bit, category.IsActive);
      sets.push("IsActive = @isActive");
    }

    if (sets.length === 0) {
      await transaction.commit();
      return await getCategoryById(categoryId);
    }

    const query = `
      UPDATE Category
      SET ${sets.join(", ")}
      OUTPUT INSERTED.*
      WHERE CategoryId = @categoryId
    `;

    const result = await request.query(query);
    await transaction.commit();

    return result.recordset.length > 0 ? result.recordset[0] : null;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Soft delete a category (set IsActive = 0, keep the row)
 */
export async function softDeleteCategory(categoryId: number): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("categoryId", sql.Int, categoryId)
    .query(`
      UPDATE Category
      SET IsActive = 0
      OUTPUT INSERTED.*
      WHERE CategoryId = @categoryId
    `);

  return result.recordset.length > 0;
}

/**
 * Hard delete a category (physical DELETE from the table)
 * Only for admin / cleanup; products may reference this category.
 */
export async function hardDeleteCategory(categoryId: number): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("categoryId", sql.Int, categoryId)
    .query("DELETE FROM Category WHERE CategoryId = @categoryId");

  return result.rowsAffected[0] > 0;
}