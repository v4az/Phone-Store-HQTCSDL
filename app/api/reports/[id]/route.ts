// app/api/reports/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import {
  getDailySales,
  getMonthlySales
} from "@/lib/services";
import { SalesSummaryByPeriod } from "@/lib/types/report";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = await params.id;
    const [type, key] = id.split(":");

    if (!type || !key) {
      return NextResponse.json(
        { error: "Invalid report ID format" },
        { status: 400 }
      );
    }

    let data: SalesSummaryByPeriod[];

    if (type === "day") {
      // key = "2024-01-01"
      const d = new Date(key);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      }
      data = await getDailySales(d, d);
    } else if (type === "month") {
      // key = "2024-01"
      const [yr, mth] = key.split("-");
      const from = new Date(Number(yr), Number(mth) - 1, 1);
      const to = new Date(Number(yr), Number(mth), 0);
      data = await getMonthlySales(from, to);
    } else {
      return NextResponse.json(
        { error: "Unsupported report type" },
        { status: 400 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("GET /api/reports/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to load report slice" },
      { status: 500 }
    );
  }
}
