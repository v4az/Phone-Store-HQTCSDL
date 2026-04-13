import { getPool } from "@/lib/db";
import { Brand } from "@/lib/types";
import sql from "mssql";

/**
 * Fetch all ACTIVE brands from the database (IsActive = true)
 */
export async function getBrands(): Promise<Brand[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query("SELECT * FROM Brand WHERE IsActive = 1 ORDER BY BrandName");
  return result.recordset;
}

/**
 * Fetch a single ACTIVE brand by ID
 */
export async function getBrandById(brandId: number): Promise<Brand | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("brandId", sql.Int, brandId)
    .query("SELECT * FROM Brand WHERE BrandId = @brandId AND IsActive = 1");

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
 * Update an existing brand (only for ACTIVE brands)
 */
export async function updateBrand(
  brandId: number,
  brand: Partial<Omit<Brand, "BrandId">>
): Promise<Brand | null> {
  const pool = await getPool();
  const request = pool.request();
  request.input("brandId", sql.Int, brandId);

  const sets: string[] = [];

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

  if (sets.length === 0) {
    return await getBrandById(brandId);
  }

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
 * Soft delete a brand (set IsActive = 0, keep the row)
 */
export async function softDeleteBrand(brandId: number): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("brandId", sql.Int, brandId)
    .query(`
      UPDATE Brand
      SET IsActive = 0
      OUTPUT INSERTED.*
      WHERE BrandId = @brandId
    `);

  return result.recordset.length > 0;
}

/**
 * Hard delete a brand (physical DELETE from the table)
 * Only use for admin / cleanup, not for normal UI operations.
 */
export async function hardDeleteBrand(brandId: number): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("brandId", sql.Int, brandId)
    .query("DELETE FROM Brand WHERE BrandId = @brandId");

  return result.rowsAffected[0] > 0;
}