// Sales service layer
// Handles all database operations for SalesInvoice and SalesInvoiceLine tables
// - createInvoice(): insert invoice header + line items in a transaction
// - getInvoices(), getInvoiceById(), etc.
//
// Usage: import { getPool } from "@/lib/db";
