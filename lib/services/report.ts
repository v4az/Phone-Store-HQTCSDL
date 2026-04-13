import { getPool } from "@/lib/db";
import sql from "mssql";
import { SalesSummaryByPeriod } from "@/lib/types";

/**
 * Get daily sales summary (group by invoice date)
 */
export async function getDailySales(
  from?: Date,
  to?: Date
): Promise<SalesSummaryByPeriod[]> {
  const pool = await getPool();

  const request = pool.request();
  let where = "";

  if (from) {
    request.input("from", sql.DateTime, from);
    where += " WHERE si.InvoiceDate >= @from";
  }
  if (to) {
    request.input("to", sql.DateTime, to);
    where += where ? " AND si.InvoiceDate <= @to" : " WHERE si.InvoiceDate <= @to";
  }

  const result = await request.query(`
    SELECT
      CONVERT(DATE, si.InvoiceDate) AS Period,
      COUNT(*) AS SalesCount,
      SUM(si.TotalAmount) AS TotalAmount,
      SUM(si.FinalAmount) AS FinalAmount
    FROM SalesInvoice si
    ${where}
    GROUP BY CONVERT(DATE, si.InvoiceDate)
    ORDER BY Period
  `);

  return result.recordset.map((row) => ({
    Period: row.Period.toISOString().split("T")[0], // 2024-01-01
    SalesCount: row.SalesCount,
    TotalAmount: row.TotalAmount,
    FinalAmount: row.FinalAmount
  }));
}

/**
 * Get weekly sales summary (group by calendar week)
 */
export async function getWeeklySales(
  from?: Date,
  to?: Date
): Promise<SalesSummaryByPeriod[]> {
  const pool = await getPool();

  const request = pool.request();
  let where = "";

  if (from) {
    request.input("from", sql.DateTime, from);
    where += " WHERE si.InvoiceDate >= @from";
  }
  if (to) {
    request.input("to", sql.DateTime, to);
    where += where ? " AND si.InvoiceDate <= @to" : " WHERE si.InvoiceDate <= @to";
  }

  const result = await request.query(`
    SELECT
      CONCAT(
        YEAR(si.InvoiceDate), '-W',
        RIGHT('0' + CAST(DATEPART(WEEK, si.InvoiceDate) AS VARCHAR(2)), 2)
      ) AS Period,
      COUNT(*) AS SalesCount,
      SUM(si.TotalAmount) AS TotalAmount,
      SUM(si.FinalAmount) AS FinalAmount
    FROM SalesInvoice si
    ${where}
    GROUP BY
      YEAR(si.InvoiceDate),
      DATEPART(WEEK, si.InvoiceDate)
    ORDER BY YEAR(si.InvoiceDate), DATEPART(WEEK, si.InvoiceDate)
  `);

  return result.recordset.map((row) => ({
    Period: row.Period,
    SalesCount: row.SalesCount,
    TotalAmount: row.TotalAmount,
    FinalAmount: row.FinalAmount
  }));
}

/**
 * Get monthly sales summary (group by year‑month)
 */
export async function getMonthlySales(
  from?: Date,
  to?: Date
): Promise<SalesSummaryByPeriod[]> {
  const pool = await getPool();

  const request = pool.request();
  let where = "";

  if (from) {
    request.input("from", sql.DateTime, from);
    where += " WHERE si.InvoiceDate >= @from";
  }
  if (to) {
    request.input("to", sql.DateTime, to);
    where += where ? " AND si.InvoiceDate <= @to" : " WHERE si.InvoiceDate <= @to";
  }

  const result = await request.query(`
    SELECT
      CONCAT(YEAR(si.InvoiceDate), '-', RIGHT('0' + CAST(MONTH(si.InvoiceDate) AS VARCHAR(2)), 2)) AS Period,
      COUNT(*) AS SalesCount,
      SUM(si.TotalAmount) AS TotalAmount,
      SUM(si.FinalAmount) AS FinalAmount
    FROM SalesInvoice si
    ${where}
    GROUP BY
      YEAR(si.InvoiceDate),
      MONTH(si.InvoiceDate)
    ORDER BY YEAR(si.InvoiceDate), MONTH(si.InvoiceDate)
  `);

  return result.recordset.map((row) => ({
    Period: row.Period, // e.g. "2024-01"
    SalesCount: row.SalesCount,
    TotalAmount: row.TotalAmount,
    FinalAmount: row.FinalAmount
  }));
}

/**
 * Get quarterly sales summary (group by year‑quarter)
 */
export async function getQuarterlySales(
  from?: Date,
  to?: Date
): Promise<SalesSummaryByPeriod[]> {
  const pool = await getPool();

  const request = pool.request();
  let where = "";

  if (from) {
    request.input("from", sql.DateTime, from);
    where += " WHERE si.InvoiceDate >= @from";
  }
  if (to) {
    request.input("to", sql.DateTime, to);
    where += where ? " AND si.InvoiceDate <= @to" : " WHERE si.InvoiceDate <= @to";
  }

  const result = await request.query(`
    SELECT
      CONCAT(YEAR(si.InvoiceDate), '-Q', DATEPART(QUARTER, si.InvoiceDate)) AS Period,
      COUNT(*) AS SalesCount,
      SUM(si.TotalAmount) AS TotalAmount,
      SUM(si.FinalAmount) AS FinalAmount
    FROM SalesInvoice si
    ${where}
    GROUP BY
      YEAR(si.InvoiceDate),
      DATEPART(QUARTER, si.InvoiceDate)
    ORDER BY YEAR(si.InvoiceDate), DATEPART(QUARTER, si.InvoiceDate)
  `);

  return result.recordset.map((row) => ({
    Period: row.Period, // e.g. "2024-Q1"
    SalesCount: row.SalesCount,
    TotalAmount: row.TotalAmount,
    FinalAmount: row.FinalAmount
  }));
}

/**
 * Get yearly sales summary (group by year)
 */
export async function getYearlySales(
  from?: Date,
  to?: Date
): Promise<SalesSummaryByPeriod[]> {
  const pool = await getPool();

  const request = pool.request();
  let where = "";

  if (from) {
    request.input("from", sql.DateTime, from);
    where += " WHERE si.InvoiceDate >= @from";
  }
  if (to) {
    request.input("to", sql.DateTime, to);
    where += where ? " AND si.InvoiceDate <= @to" : " WHERE si.InvoiceDate <= @to";
  }

  const result = await request.query(`
    SELECT
      YEAR(si.InvoiceDate) AS Period,
      COUNT(*) AS SalesCount,
      SUM(si.TotalAmount) AS TotalAmount,
      SUM(si.FinalAmount) AS FinalAmount
    FROM SalesInvoice si
    ${where}
    GROUP BY YEAR(si.InvoiceDate)
    ORDER BY Period
  `);

  return result.recordset.map((row) => ({
    Period: row.Period.toString(), // e.g. "2024"
    SalesCount: row.SalesCount,
    TotalAmount: row.TotalAmount,
    FinalAmount: row.FinalAmount
  }));
}

/**
 * Dashboard: get latest daily, weekly, monthly, yearly summaries
 * (e.g., last 7 days, last 4 weeks, last 12 months, last 5 years)
 */
export async function getDashboardSales(): Promise<{
  daily: SalesSummaryByPeriod[];
  weekly: SalesSummaryByPeriod[];
  monthly: SalesSummaryByPeriod[];
  yearly: SalesSummaryByPeriod[];
}> {
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1);

  const [daily, weekly, monthly, yearly] = await Promise.all([
    getDailySales(new Date(today), new Date(today)), // today or adjust range
    getWeeklySales(new Date(today.getTime() - 30 * 24 * 3600 * 1000)), // last ~30 days
    getMonthlySales(new Date(today.getTime() - 365 * 24 * 3600 * 1000)), // last year
    getYearlySales(startOfYear)
  ]);

  return { daily, weekly, monthly, yearly };
}
