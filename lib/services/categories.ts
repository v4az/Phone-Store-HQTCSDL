import { getPool } from "@/lib/db";
import { Category } from "@/lib/types";
import sql from "mssql";

/**
 * Fetch all categories from the database
 */
export async function getCategories(): Promise<Category[]> {
  const pool = await getPool();
  const result = await pool.request().query("SELECT * FROM Category ORDER BY CategoryName");
  return result.recordset;
}

/**
 * Fetch a single category by ID
 */
export async function getCategoryById(categoryId: number): Promise<Category | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("categoryId", sql.Int, categoryId)
    .query("SELECT * FROM Category WHERE CategoryId = @categoryId");
  
  return result.recordset.length > 0 ? result.recordset[0] : null;
}

/**
 * Create a new category
 */
export async function createCategory(category: Omit<Category, "CategoryId">): Promise<Category> {
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
 * Update an existing category
 */
export async function updateCategory(categoryId: number, category: Partial<Omit<Category, "CategoryId">>): Promise<Category | null> {
  const pool = await getPool();
  
  const sets: string[] = [];
  const request = pool.request();
  request.input("categoryId", sql.Int, categoryId);

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

  if (sets.length === 0) return await getCategoryById(categoryId);

  const query = `
    UPDATE Category
    SET ${sets.join(", ")}
    OUTPUT INSERTED.*
    WHERE CategoryId = @categoryId
  `;

  const result = await request.query(query);
  return result.recordset.length > 0 ? result.recordset[0] : null;
}

/**
 * Delete a category
 */
export async function deleteCategory(categoryId: number): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("categoryId", sql.Int, categoryId)
    .query("DELETE FROM Category WHERE CategoryId = @categoryId");
  
  return result.rowsAffected[0] > 0;
}
