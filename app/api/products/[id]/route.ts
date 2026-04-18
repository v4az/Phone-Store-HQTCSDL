// app/api/products/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getProductById, updateProduct } from "@/lib/services";
import { Product } from "@/lib/types";

// GET /api/products/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }  // ← type it as Promise
) {
  try {
    const { id } = await params;
    const productId = Number(id);

    if (isNaN(productId)) {
      return NextResponse.json(
        { error: "Invalid product ID" },
        { status: 400 }
      );
    }

    const product = await getProductById(productId);

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(product);
  } catch (error: unknown) {
    console.error("GET /api/products/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to load product" },
      { status: 500 }
    );
  }
}

// PATCH /api/products/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const productId = Number(id);

    if (isNaN(productId)) {
      return NextResponse.json(
        { error: "Invalid product ID" },
        { status: 400 }
      );
    }

    const body = await request.json();

    const productData: Partial<Omit<Product, "ProductId" | "Variants">> = {
      ProductCode: body.ProductCode,
      ProductName: body.ProductName,
      BrandId: body.BrandId,
      CategoryId: body.CategoryId,
      WarrantyMonths: body.WarrantyMonths,
      Description: body.Description,
      IsActive: body.IsActive
    };

    if (productData.WarrantyMonths !== undefined && productData.WarrantyMonths < 0) {
      return NextResponse.json({ error: "WarrantyMonths cannot be negative" }, { status: 400 });
    }

    const updatedProduct = await updateProduct(productId, productData);

    if (!updatedProduct) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedProduct);
  } catch (error: any) {
    console.error("PATCH /api/products/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update product" },
      { status: 500 }
    );
  }
}

