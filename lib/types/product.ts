// Product & Variant types
// Maps to: Product, ProductVariant tables

export interface ProductVariant {
  VariantId: number;
  ProductId: number;
  Sku: string;
  Color: string | null;
  Storage: string | null;
  OtherAttributes: string | null;
  ImageUrl: string | null;
  CostPrice: number;
  RetailPrice: number;
  IsActive: boolean;
}

export interface Product {
  ProductId: number;
  ProductCode: string;
  ProductName: string;
  BrandId: number;
  BrandName: string;
  CategoryId: number;
  CategoryName: string;
  WarrantyMonths: number;
  Description: string | null;
  IsActive: boolean;
  Variants: ProductVariant[];
}