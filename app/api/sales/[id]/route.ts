// app/api/sales/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getInvoiceById, updateInvoice } from "@/lib/services";
import { SalesInvoice } from "@/lib/types";

// GET /api/sales/[id]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const invoiceId = Number(id);

    if (isNaN(invoiceId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const invoice = await getInvoiceById(invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json(invoice);
  } catch (error: unknown) {
    console.error("GET /api/sales/[id] error:", error);
    return NextResponse.json({ error: "Failed to load invoice" }, { status: 500 });
  }
}

// PUT /api/sales/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const invoiceId = Number(id);

    if (isNaN(invoiceId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();
    const invoiceData: Partial<Omit<SalesInvoice, "InvoiceId">> = {
      InvoiceCode: body.InvoiceCode,
      CustomerId: body.CustomerId,
      InvoiceDate: body.InvoiceDate,
      TotalAmount: body.TotalAmount,
      DiscountAmount: body.DiscountAmount,
      FinalAmount: body.FinalAmount,
      CreatedBy: body.CreatedBy
    };

    const updatedInvoice = await updateInvoice(invoiceId, invoiceData);

    if (!updatedInvoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json(updatedInvoice);
  } catch (error: unknown) {
    console.error("PUT /api/sales/[id] error:", error);
    return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
  }
}
