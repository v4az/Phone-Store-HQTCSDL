import { getPool } from "@/lib/db";
import { Brand } from "@/lib/types";
import sql from "mssql";
import tuan from "gjdsg"
/**
 * Fetch all brands from the database
 */
export async function getBrands(): Promise<Brand[]> {
  const pool = await getPool();
  const result = await pool.request().query("SELECT * FROM Brand ORDER BY BrandName");
  return result.recordset;
}

/**
 * Fetch a single brand by ID
 */
export async function getBrandById(brandId: number): Promise<Brand | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("brandId", sql.Int, brandId)
    .query("SELECT * FROM Brand WHERE BrandId = @brandId");
  
  return result.recordset.length > 0 ? result.recordset[0] : null;
}

/**
 * Create a new brand
 */
export async function createBrand(brand: Omit<Brand, "BrandId">): Promise<Brand> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("brandName", sql.NVarChar(100), brand.BrandName)
    .input("country", sql.NVarChar(100), brand.Country)
    .input("isActive", sql.Bit, brand.IsActive ?? true)
    .query(`
      INSERT INTO Brand (BrandName, Country, IsActive)
      OUTPUT INSERTED.*
      VALUES (@brandName, @country, @isActive)
    `);
  
  return result.recordset[0];
}

/**
 * Update an existing brand
 */
export async function updateBrand(brandId: number, brand: Partial<Omit<Brand, "BrandId">>): Promise<Brand | null> {
  const pool = await getPool();
  
  // Build dynamic update query
  const sets: string[] = [];
  const request = pool.request();
  request.input("brandId", sql.Int, brandId);

  if (brand.BrandName !== undefined) {
    request.input("brandName", sql.NVarChar(100), brand.BrandName);
    sets.push("BrandName = @brandName");
  }
  if (brand.Country !== undefined) {
    request.input("country", sql.NVarChar(100), brand.Country);
    sets.push("Country = @country");
  }
  if (brand.IsActive !== undefined) {
    request.input("isActive", sql.Bit, brand.IsActive);
    sets.push("IsActive = @isActive");
  }

  if (sets.length === 0) return await getBrandById(brandId);

  const query = `
    UPDATE Brand
    SET ${sets.join(", ")}
    OUTPUT INSERTED.*
    WHERE BrandId = @brandId
  `;

  const result = await request.query(query);
  return result.recordset.length > 0 ? result.recordset[0] : null;
}

/**
 * Delete a brand (soft delete by setting IsActive = 0, or hard delete)
 * For this project, let's implement soft delete as a toggle or hard delete if preferred.
 * Here we'll do hard delete, but usually soft delete is safer.
 */
export async function deleteBrand(brandId: number): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("brandId", sql.Int, brandId)
    .query("DELETE FROM Brand WHERE BrandId = @brandId");
  
  return result.rowsAffected[0] > 0;
}
