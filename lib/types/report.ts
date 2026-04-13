export interface SalesSummaryByPeriod {
  Period: string;        // e.g. "2024-01-01", "2024-01", "2024-Q1", "2024-W01"
  SalesCount: number;
  TotalAmount: number;
  FinalAmount: number;
}

export interface SalesReportOptions {
  from?: string; // ISO "2024-01-01"
  to?: string;   // ISO "2024-12-31"
  interval: "day" | "week" | "month" | "quarter" | "year";
}