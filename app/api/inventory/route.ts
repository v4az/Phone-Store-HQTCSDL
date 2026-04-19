// API Route: /api/inventory
// GET — return stock levels joined across InventoryStock, ProductVariant, Product, InventoryLocation

import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export async function GET() {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        is_stk.VariantId,
        is_stk.LocationId,
        is_stk.QuantityOnHand,
        is_stk.QuantityReserved,
        pv.Sku,
        p.ProductCode,
        p.ProductName,
        il.LocationName
      FROM InventoryStock is_stk
      JOIN ProductVariant pv ON is_stk.VariantId = pv.VariantId
      JOIN Product p ON pv.ProductId = p.ProductId
      JOIN InventoryLocation il ON is_stk.LocationId = il.LocationId
      ORDER BY p.ProductName, pv.Sku, il.LocationName
    `);

    return NextResponse.json(result.recordset);
  } catch (error: unknown) {
    console.error("GET /api/inventory error:", error);
    return NextResponse.json(
      { error: "Failed to load inventory" },
      { status: 500 }
    );
  }
}
