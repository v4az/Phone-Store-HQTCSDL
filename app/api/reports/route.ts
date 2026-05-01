// app/api/reports/route.ts
//
// GET /api/reports                     → dashboard (4 mảng) trong 1 SNAPSHOT tx
// GET /api/reports?interval=day|week|month|quarter|year[&from=&to=] → 1 mảng theo period

import { NextRequest, NextResponse } from "next/server";
import {
  getDailySales,
  getWeeklySales,
  getMonthlySales,
  getQuarterlySales,
  getYearlySales,
  getDashboardSales,
} from "@/lib/services";
import { SalesSummaryByPeriod } from "@/lib/types/report";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const interval = url.searchParams.get("interval");

    // Dashboard: 4 mảng (daily/weekly/monthly/yearly) trong 1 SNAPSHOT tx →
    // tránh phantom read giữa các query.
    if (!interval || interval === "dashboard") {
      const data = await getDashboardSales();
      return NextResponse.json({ data });
    }

    const safeFrom = from ? new Date(from) : undefined;
    const safeTo = to ? new Date(to) : undefined;

    if (safeFrom && isNaN(safeFrom.getTime())) {
      return NextResponse.json({ error: "Invalid 'from' date" }, { status: 400 });
    }
    if (safeTo && isNaN(safeTo.getTime())) {
      return NextResponse.json({ error: "Invalid 'to' date" }, { status: 400 });
    }

    let data: SalesSummaryByPeriod[] = [];

    if (interval === "day") {
      data = await getDailySales(safeFrom, safeTo);
    } else if (interval === "week") {
      data = await getWeeklySales(safeFrom, safeTo);
    } else if (interval === "month") {
      data = await getMonthlySales(safeFrom, safeTo);
    } else if (interval === "quarter") {
      data = await getQuarterlySales(safeFrom, safeTo);
    } else if (interval === "year") {
      data = await getYearlySales(safeFrom, safeTo);
    } else {
      return NextResponse.json(
        { error: "Invalid 'interval' (use: day|week|month|quarter|year|dashboard)" },
        { status: 400 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error("GET /api/reports error:", error);
    return NextResponse.json(
      { error: "Failed to load report" },
      { status: 500 }
    );
  }
}
