// app/api/sales/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getInvoices, createInvoice } from "@/lib/services";
import { SalesInvoice, SalesInvoiceLine } from "@/lib/types";

// GET /api/sales
export async function GET() {
  try {
    const invoices = await getInvoices();
    return NextResponse.json(invoices);
  } catch (error: any) {
    console.error("GET /api/sales error:", error);
    return NextResponse.json(
      { error: "Failed to load invoices" },
      { status: 500 }
    );
  }
}

// POST /api/sales
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const invoiceData: Omit<SalesInvoice, "InvoiceId"> & {
      Lines: Omit<SalesInvoiceLine, "InvoiceId">[];
    } = {
      InvoiceCode: body.InvoiceCode,
      CustomerId: body.CustomerId,
      InvoiceDate: body.InvoiceDate,
      TotalAmount: body.TotalAmount ?? 0,
      DiscountAmount: body.DiscountAmount ?? 0,
      FinalAmount: body.FinalAmount ?? 0,
      CreatedBy: body.CreatedBy ?? null,
      Lines: body.Lines?.map((l: any) => ({
        LineNo: l.LineNo,
        VariantId: l.VariantId,
        Quantity: l.Quantity ?? 0,
        UnitPrice: l.UnitPrice ?? 0,
        DiscountPct: l.DiscountPct ?? 0,
        LineTotal: l.LineTotal ?? 0
      })) ?? []
    };

    const createdInvoice = await createInvoice(invoiceData);

    return NextResponse.json(createdInvoice, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/sales error:", error);
    return NextResponse.json(
      { error: "Failed to create invoice" },
      { status: 500 }
    );
  }
}
