// API Route: /api/inventory
// GET — return stock levels via service layer (vw_InventoryByLocation).
// Optional ?locationId= filter.

import { NextRequest, NextResponse } from "next/server";
import { getInventoryStockList } from "@/lib/services/inventory";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const locParam = url.searchParams.get("locationId");
    const locationId = locParam ? Number(locParam) : undefined;

    if (locationId !== undefined && Number.isNaN(locationId)) {
      return NextResponse.json(
        { error: "Invalid 'locationId'" },
        { status: 400 }
      );
    }

    const data = await getInventoryStockList(locationId);
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("GET /api/inventory error:", error);
    return NextResponse.json(
      { error: "Failed to load inventory" },
      { status: 500 }
    );
  }
}
