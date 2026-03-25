// Sales, Invoice & Customer types
// Maps to: SalesInvoice, SalesInvoiceLine, Customer tables

export interface Customer {
  CustomerId: number;
  Name: string;
  Phone: string | null;
  Address: string | null;
  IsActive: boolean;
}

export interface SalesInvoice {
  InvoiceId: number;
  InvoiceCode: string;
  CustomerId: number | null;
  InvoiceDate: string;
  TotalAmount: number;
  DiscountAmount: number;
  FinalAmount: number;
  CreatedBy: string | null;
}

export interface SalesInvoiceLine {
  InvoiceId: number;
  LineNo: number;
  VariantId: number;
  Quantity: number;
  UnitPrice: number;
  DiscountPct: number;
  LineTotal: number;
}
