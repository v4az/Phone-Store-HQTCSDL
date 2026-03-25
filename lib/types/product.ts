// Product & Variant types
// Maps to: Product, ProductVariant tables

export interface Product {
  ProductId: number;
  ProductCode: string;
  ProductName: string;
  BrandId: number;
  CategoryId: number;
  WarrantyMonths: number;
  Description: string | null;
  IsActive: boolean;
}

export interface ProductVariant {
  VariantId: number;
  ProductId: number;
  Sku: string;
  Color: string | null;
  Storage: string | null;
  OtherAttributes: string | null;
  CostPrice: number;
  RetailPrice: number;
  IsActive: boolean;
}
