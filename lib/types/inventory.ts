// Inventory, PurchaseOrder & Supplier types
// Maps to: InventoryLocation, InventoryStock, Supplier, PurchaseOrder, PurchaseOrderLine tables

export interface InventoryLocation {
  LocationId: number;
  LocationName: string;
  Address: string | null;
}

export interface InventoryStock {
  VariantId: number;
  LocationId: number;
  QuantityOnHand: number;
  QuantityReserved: number;
}

export interface Supplier {
  SupplierId: number;
  Name: string;
  Phone: string | null;
  Address: string | null;
  IsActive: boolean;
}

export interface PurchaseOrder {
  PurchaseId: number;
  SupplierId: number;
  PurchaseDate: string;
  Note: string | null;
  TotalAmount: number;
  CreatedBy: string | null;
}

export interface PurchaseOrderLine {
  PurchaseId: number;
  LineNo: number;
  VariantId: number;
  Quantity: number;
  UnitCost: number;
  LineTotal: number;
}
