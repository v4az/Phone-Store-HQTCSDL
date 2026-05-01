import { getPool } from "@/lib/db";
import sql from "mssql";

export interface InventoryStockRow {
  VariantId: number;
  LocationId: number;
  LocationName: string;
  Sku: string;
  Color: string | null;
  Storage: string | null;
  ProductId: number;
  ProductCode: string;
  ProductName: string;
  QuantityOnHand: number;
  QuantityReserved: number;
  AvailableQty: number;
}

/**
 * Fetch inventory stock from vw_InventoryByLocation.
 *
 * Optionally filtered by location. View tự JOIN Product/Variant/Location nên
 * service không cần ráp query — giảm coupling với schema.
 */
export async function getInventoryStockList(
  locationId?: number
): Promise<InventoryStockRow[]> {
  const pool = await getPool();
  const request = pool.request();

  let query = `SELECT * FROM vw_InventoryByLocation`;
  if (locationId !== undefined) {
    request.input("locationId", sql.Int, locationId);
    query += ` WHERE LocationId = @locationId`;
  }
  query += ` ORDER BY LocationName, ProductName, Sku`;

  const result = await request.query(query);
  return result.recordset as InventoryStockRow[];
}
