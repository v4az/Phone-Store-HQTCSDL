// Sales, Invoice & Customer types
// Maps to: SalesInvoice, SalesInvoiceLine, Customer tables

export interface SalesInvoice {
  InvoiceId: number;
  InvoiceCode: string;
  InvoiceDate: string;
  TotalAmount: number;
  DiscountAmount: number;
  FinalAmount: number;
  CreatedBy: string | null;
  CustomerName: string | null;
  CustomerPhone: string | null;
  Lines?: SalesInvoiceLine[];
}

export interface SalesInvoiceLine {
  InvoiceId: number;
  LineNo: number;
  VariantId: number;
  Quantity: number;
  UnitPrice: number;
  DiscountPct: number;
  LineTotal: number;
  // Joined fields for display
  ProductName?: string;
  Sku?: string;
  Color?: string | null;
  Storage?: string | null;
}
