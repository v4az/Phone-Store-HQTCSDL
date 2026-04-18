// /app/api/products/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getProducts, createProduct } from "@/lib/services";
import { Product, ProductVariant } from "@/lib/types";

export async function GET() {
  try {
    const products = await getProducts();
    return NextResponse.json(products);
  } catch (error: unknown) {
    return NextResponse.json({ error: "Failed to load products" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const productData = {
      ProductCode: body.ProductCode,
      ProductName: body.ProductName,
      BrandId: body.BrandId,
      BrandName: body.BrandName,
      CategoryId: body.CategoryId,
      CategoryName: body.CategoryName,
      WarrantyMonths: body.WarrantyMonths ?? 0,
      Description: body.Description ?? null,
      IsActive: body.IsActive ?? true
    };

    const variantData: (Omit<ProductVariant, "VariantId" | "ProductId"> & { QuantityOnHand?: number })[] =
      body.Variants?.map((v: any) => ({
        Sku: v.Sku,
        Color: v.Color,
        Storage: v.Storage,
        OtherAttributes: v.OtherAttributes ?? null,
        ImageUrl: v.ImageUrl ?? null,
        CostPrice: v.CostPrice ?? 0,
        RetailPrice: v.RetailPrice ?? 0,
        IsActive: v.IsActive ?? true,
        QuantityOnHand: v.QuantityOnHand ?? 0,
      })) ?? [];

    if (productData.WarrantyMonths < 0) {
      return NextResponse.json({ error: "WarrantyMonths cannot be negative" }, { status: 400 });
    }
    for (const v of variantData) {
      if (v.CostPrice < 0 || v.RetailPrice < 0) {
        return NextResponse.json({ error: "Prices cannot be negative" }, { status: 400 });
      }
    }

    const createdProduct = await createProduct(productData, variantData);

    return NextResponse.json(createdProduct, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create product" }, { status: 500 });
  }
}
