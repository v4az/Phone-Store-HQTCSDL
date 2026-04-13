export interface SalesSummaryByPeriod {
  Period: string;        // e.g. "2024-01-01", "2024-01", "2024-Q1", "2024-W01"
  SalesCount: number;
  TotalAmount: number;
  FinalAmount: number;
}
