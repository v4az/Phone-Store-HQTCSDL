// app/api/sales/[id]/route.ts

import { NextResponse } from "next/server";
import { getInvoiceById } from "@/lib/services";

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
