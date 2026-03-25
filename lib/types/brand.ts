// Brand & Category types
// Maps to: Brand, Category tables

export interface Brand {
  BrandId: number;
  BrandName: string;
  Country: string | null;
  IsActive: boolean;
}

export interface Category {
  CategoryId: number;
  CategoryName: string;
  ParentCategoryId: number | null;
  IsActive: boolean;
}
