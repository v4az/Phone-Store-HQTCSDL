import { NextRequest, NextResponse } from "next/server";
import { getProducts, createProduct } from "@/lib/services";
import { Product, ProductVariant } from "@/lib/types";

export async function GET() {
  try {
    const products = await getProducts();
    return NextResponse.json(products);
  } catch (error: any) {
    console.error("GET /api/products error:", error);
    return NextResponse.json(
      { error: "Failed to load products" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const productData: Omit<Product, "ProductId" | "Variants"> = {
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

    const variantData: Omit<ProductVariant, "VariantId" | "ProductId">[] =
      body.Variants?.map((v: any) => ({
        Sku: v.Sku,
        Color: v.Color,
        Storage: v.Storage,
        OtherAttributes: v.OtherAttributes,
        ImageUrl: v.ImageUrl,
        CostPrice: v.CostPrice ?? 0,
        RetailPrice: v.RetailPrice ?? 0,
        IsActive: v.IsActive ?? true
      })) ?? [];

    const createdProduct = await createProduct(productData, variantData);

    return NextResponse.json(createdProduct, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/products error:", error);
    return NextResponse.json(
      { error: "Failed to create product" },
      { status: 500 }
    );
  }
}
