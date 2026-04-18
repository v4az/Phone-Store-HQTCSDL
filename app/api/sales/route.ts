// app/api/sales/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getInvoices, createInvoice, findOrCreateCustomer } from "@/lib/services";
import { SalesInvoice, SalesInvoiceLine } from "@/lib/types";
import { InsufficientStockError } from "@/lib/errors";

// GET /api/sales
export async function GET() {
  try {
    const invoices = await getInvoices();
    return NextResponse.json(invoices);
  } catch (error: unknown) {
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

    // Resolve customer: find by phone or create new
    let customerId: number | null = body.CustomerId ?? null;
    if (!customerId && body.CustomerName) {
      customerId = await findOrCreateCustomer(
        body.CustomerName,
        body.CustomerPhone || null
      );
    }

    const invoiceData: Omit<SalesInvoice, "InvoiceId"> & {
      Lines: Omit<SalesInvoiceLine, "InvoiceId">[];
    } = {
      InvoiceCode: body.InvoiceCode,
      CustomerId: customerId,
      InvoiceDate: body.InvoiceDate,
      TotalAmount: body.TotalAmount ?? 0,
      DiscountAmount: body.DiscountAmount ?? 0,
      FinalAmount: body.FinalAmount ?? 0,
      CreatedBy: body.CreatedBy ?? null,
      Lines: body.Lines?.map((l: Omit<SalesInvoiceLine, "InvoiceId">) => ({
        LineNo: l.LineNo,
        VariantId: l.VariantId,
        Quantity: l.Quantity ?? 0,
        UnitPrice: l.UnitPrice ?? 0,
        DiscountPct: l.DiscountPct ?? 0,
        LineTotal: l.LineTotal ?? 0
      })) ?? []
    };

    if (invoiceData.Lines.length === 0) {
      return NextResponse.json({ error: "Invoice must have at least one line" }, { status: 400 });
    }

    if (invoiceData.TotalAmount < 0 || invoiceData.FinalAmount < 0) {
      return NextResponse.json({ error: "Amounts cannot be negative" }, { status: 400 });
    }

    for (const line of invoiceData.Lines) {
      if (line.Quantity <= 0) {
        return NextResponse.json({ error: "Quantity must be greater than 0" }, { status: 400 });
      }
      if (line.UnitPrice < 0) {
        return NextResponse.json({ error: "Unit price cannot be negative" }, { status: 400 });
      }
      if (line.DiscountPct < 0 || line.DiscountPct > 100) {
        return NextResponse.json({ error: "Discount must be between 0 and 100" }, { status: 400 });
      }
    }

    const locationId = body.LocationId ?? 1;
    const createdInvoice = await createInvoice(invoiceData, locationId);

    return NextResponse.json(createdInvoice, { status: 201 });
  } catch (error: any) {
    // Insufficient stock → 409 Conflict
    if (error instanceof InsufficientStockError) {
      return NextResponse.json(
        {
          error: error.message,
          variantId: error.variantId,
          requestedQty: error.requestedQty,
          locationId: error.locationId
        },
        { status: 409 }
      );
    }

    console.error("POST /api/sales error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create invoice" },
      { status: 500 }
    );
  }
}
