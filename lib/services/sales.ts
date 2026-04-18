import { getPool } from "@/lib/db";
import sql from "mssql";
import { Customer, SalesInvoice, SalesInvoiceLine } from "@/lib/types";
import { InsufficientStockError } from "@/lib/errors";

/**
 * Fetch all invoices (with customer info if needed)
 */
export async function getInvoices(): Promise<SalesInvoice[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query(`
      SELECT
        si.InvoiceId,
        si.InvoiceCode,
        si.CustomerId,
        si.InvoiceDate,
        si.TotalAmount,
        si.DiscountAmount,
        si.FinalAmount,
        si.CreatedBy
      FROM SalesInvoice si
      ORDER BY si.InvoiceDate DESC
    `);

  return result.recordset.map((row) => ({
    InvoiceId: row.InvoiceId,
    InvoiceCode: row.InvoiceCode,
    CustomerId: row.CustomerId,
    InvoiceDate: row.InvoiceDate,
    TotalAmount: row.TotalAmount,
    DiscountAmount: row.DiscountAmount,
    FinalAmount: row.FinalAmount,
    CreatedBy: row.CreatedBy || null
  }));
}

/**
 * Fetch a single invoice by ID with its lines
 */
export async function getInvoiceById(
  invoiceId: number
): Promise<SalesInvoice | null> {
  const pool = await getPool();

  // Invoice header
  const invoiceResult = await pool
    .request()
    .input("invoiceId", sql.Int, invoiceId)
    .query(`
      SELECT
        si.InvoiceId,
        si.InvoiceCode,
        si.CustomerId,
        si.InvoiceDate,
        si.TotalAmount,
        si.DiscountAmount,
        si.FinalAmount,
        si.CreatedBy
      FROM SalesInvoice si
      WHERE si.InvoiceId = @invoiceId
    `);

  if (invoiceResult.recordset.length === 0) return null;

  const invoiceRow = invoiceResult.recordset[0];

  // Invoice lines
  const linesResult = await pool
    .request()
    .input("invoiceId", sql.Int, invoiceId)
    .query(`
      SELECT
        sil.InvoiceId,
        sil.[LineNo],
        sil.VariantId,
        sil.Quantity,
        sil.UnitPrice,
        sil.DiscountPct,
        sil.LineTotal
      FROM SalesInvoiceLine sil
      WHERE sil.InvoiceId = @invoiceId
      ORDER BY sil.[LineNo]
    `);

  const lines: SalesInvoiceLine[] = linesResult.recordset.map((row) => ({
    InvoiceId: row.InvoiceId,
    LineNo: row.LineNo,
    VariantId: row.VariantId,
    Quantity: row.Quantity,
    UnitPrice: row.UnitPrice,
    DiscountPct: row.DiscountPct,
    LineTotal: row.LineTotal
  }));

  // Attach lines to invoice (adjust if you want nested object)
  return {
    InvoiceId: invoiceRow.InvoiceId,
    InvoiceCode: invoiceRow.InvoiceCode,
    CustomerId: invoiceRow.CustomerId,
    InvoiceDate: invoiceRow.InvoiceDate,
    TotalAmount: invoiceRow.TotalAmount,
    DiscountAmount: invoiceRow.DiscountAmount,
    FinalAmount: invoiceRow.FinalAmount,
    CreatedBy: invoiceRow.CreatedBy || null
  };
}

/**
 * Create a new sales invoice with header + line items in a transaction.
 *
 * Concurrency protections:
 * - Non-Repeatable Read: reads RetailPrice WITH (UPDLOCK) — price can't change during the transaction
 * - Lost Update: atomic stock deduction (QuantityOnHand = QuantityOnHand - @qty WHERE QuantityOnHand >= @qty)
 * - Dirty Write: all operations in a single transaction — rollback is safe
 *
 * @param locationId - inventory location to deduct stock from (default: 1)
 */
export async function createInvoice(
  invoice: Omit<SalesInvoice, "InvoiceId"> & { Lines: Omit<SalesInvoiceLine, "InvoiceId">[] },
  locationId: number = 1
): Promise<SalesInvoice> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // === Phase 1: Validate lines, lock prices, deduct stock ===
    const verifiedLines: {
      LineNo: number;
      VariantId: number;
      Quantity: number;
      UnitPrice: number;
      DiscountPct: number;
      LineTotal: number;
    }[] = [];

    for (const line of invoice.Lines) {
      // Read authoritative price WITH (UPDLOCK) — prevents Non-Repeatable Read.
      // The lock ensures no one can change RetailPrice until this transaction commits.
      const priceResult = await transaction
        .request()
        .input("variantId", sql.Int, line.VariantId)
        .query(`
          SELECT RetailPrice FROM ProductVariant WITH (UPDLOCK)
          WHERE VariantId = @variantId AND IsActive = 1
        `);

      if (priceResult.recordset.length === 0) {
        throw new Error(`Variant ${line.VariantId} not found or inactive`);
      }

      const dbPrice: number = priceResult.recordset[0].RetailPrice;
      const discountPct = line.DiscountPct ?? 0;
      const lineTotal = dbPrice * line.Quantity * (1 - discountPct / 100);

      // Atomic stock deduction — prevents Lost Update.
      // The WHERE clause (QuantityOnHand >= @qty) is the guard:
      // if two sales race, both use the *current* DB value (not a stale read).
      const stockResult = await transaction
        .request()
        .input("variantId", sql.Int, line.VariantId)
        .input("locationId", sql.Int, locationId)
        .input("qty", sql.Int, line.Quantity)
        .query(`
          UPDATE InventoryStock
          SET QuantityOnHand = QuantityOnHand - @qty
          WHERE VariantId = @variantId
            AND LocationId = @locationId
            AND QuantityOnHand >= @qty
        `);

      if (stockResult.rowsAffected[0] === 0) {
        throw new InsufficientStockError(line.VariantId, line.Quantity, locationId);
      }

      verifiedLines.push({
        LineNo: line.LineNo,
        VariantId: line.VariantId,
        Quantity: line.Quantity,
        UnitPrice: dbPrice,
        DiscountPct: discountPct,
        LineTotal: lineTotal,
      });
    }

    // === Phase 2: Recalculate totals from verified data ===
    const totalAmount = verifiedLines.reduce((sum, l) => sum + l.LineTotal, 0);
    const discountAmount = invoice.DiscountAmount ?? 0;
    const finalAmount = totalAmount - discountAmount;

    // === Phase 3: Insert invoice header ===
    const headerResult = await transaction
      .request()
      .input("invoiceCode", sql.NVarChar(50), invoice.InvoiceCode)
      .input("customerId", sql.Int, invoice.CustomerId)
      .input("invoiceDate", sql.DateTime2, invoice.InvoiceDate)
      .input("totalAmount", sql.Decimal(18, 2), totalAmount)
      .input("discountAmount", sql.Decimal(18, 2), discountAmount)
      .input("finalAmount", sql.Decimal(18, 2), finalAmount)
      .input("createdBy", sql.NVarChar(100), invoice.CreatedBy ?? null)
      .query(`
        INSERT INTO SalesInvoice (
          InvoiceCode,
          CustomerId,
          InvoiceDate,
          TotalAmount,
          DiscountAmount,
          FinalAmount,
          CreatedBy
        )
        OUTPUT INSERTED.*
        VALUES (
          @invoiceCode,
          @customerId,
          @invoiceDate,
          @totalAmount,
          @discountAmount,
          @finalAmount,
          @createdBy
        )
      `);

    const newInvoice = headerResult.recordset[0] as SalesInvoice;

    // === Phase 4: Insert line items ===
    // Each line gets its own request to avoid duplicate parameter names (bug fix).
    for (const line of verifiedLines) {
      await transaction
        .request()
        .input("invoiceId", sql.Int, newInvoice.InvoiceId)
        .input("lineNo", sql.Int, line.LineNo)
        .input("variantId", sql.Int, line.VariantId)
        .input("quantity", sql.Int, line.Quantity)
        .input("unitPrice", sql.Decimal(18, 2), line.UnitPrice)
        .input("discountPct", sql.Decimal(18, 2), line.DiscountPct)
        .input("lineTotal", sql.Decimal(18, 2), line.LineTotal)
        .query(`
          INSERT INTO SalesInvoiceLine (
            InvoiceId,
            [LineNo],
            VariantId,
            Quantity,
            UnitPrice,
            DiscountPct,
            LineTotal
          )
          VALUES (
            @invoiceId,
            @lineNo,
            @variantId,
            @quantity,
            @unitPrice,
            @discountPct,
            @lineTotal
          )
        `);
    }

    await transaction.commit();
    return newInvoice;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Update an existing invoice (header only; lines are usually not edited afterward)
 */
export async function updateInvoice(
  invoiceId: number,
  invoice: Partial<Omit<SalesInvoice, "InvoiceId">>
): Promise<SalesInvoice | null> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const sets: string[] = [];
    const request = transaction.request();
    request.input("invoiceId", sql.Int, invoiceId);

    if (invoice.InvoiceCode !== undefined) {
      request.input("invoiceCode", sql.NVarChar(50), invoice.InvoiceCode);
      sets.push("InvoiceCode = @invoiceCode");
    }
    if (invoice.CustomerId !== undefined) {
      request.input("customerId", sql.Int, invoice.CustomerId);
      sets.push("CustomerId = @customerId");
    }
    if (invoice.InvoiceDate !== undefined) {
      request.input("invoiceDate", sql.DateTime2, invoice.InvoiceDate);
      sets.push("InvoiceDate = @invoiceDate");
    }
    if (invoice.TotalAmount !== undefined) {
      request.input("totalAmount", sql.Decimal(18, 2), invoice.TotalAmount);
      sets.push("TotalAmount = @totalAmount");
    }
    if (invoice.DiscountAmount !== undefined) {
      request.input("discountAmount", sql.Decimal(18, 2), invoice.DiscountAmount);
      sets.push("DiscountAmount = @discountAmount");
    }
    if (invoice.FinalAmount !== undefined) {
      request.input("finalAmount", sql.Decimal(18, 2), invoice.FinalAmount);
      sets.push("FinalAmount = @finalAmount");
    }
    if (invoice.CreatedBy !== undefined) {
      request.input("createdBy", sql.NVarChar(100), invoice.CreatedBy ?? null);
      sets.push("CreatedBy = @createdBy");
    }

    if (sets.length === 0) {
      await transaction.commit();
      return await getInvoiceById(invoiceId);
    }

    const query = `
      UPDATE SalesInvoice
      SET ${sets.join(", ")}
      OUTPUT INSERTED.*
      WHERE InvoiceId = @invoiceId
    `;

    const result = await request.query(query);
    await transaction.commit();

    if (result.recordset.length === 0) return null;

    return result.recordset[0] as SalesInvoice;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}