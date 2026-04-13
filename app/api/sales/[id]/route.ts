// app/api/sales/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getInvoiceById, updateInvoice } from "@/lib/services";
import { SalesInvoice } from "@/lib/types";

// GET /api/sales/[id]
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const invoice = await getInvoiceById(id);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json(invoice);
  } catch (error: any) {
    console.error("GET /api/sales/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to load invoice" },
      { status: 500 }
    );
  }
}

// PUT /api/sales/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
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

    const updatedInvoice = await updateInvoice(id, invoiceData);

    if (!updatedInvoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json(updatedInvoice);
  } catch (error: any) {
    console.error("PUT /api/sales/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update invoice" },
      { status: 500 }
    );
  }
}
