import { NextRequest, NextResponse } from "next/server";
import { getProductById, updateProduct, softDeleteProduct } from "@/lib/services/";
import { Product } from "@/lib/types";

// GET /api/products/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const productId = Number(params.id);

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
  } catch (error: any) {
    console.error("GET /api/products/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to load product" },
      { status: 500 }
    );
  }
}

// PATCH /api/products/[id] (or PUT if you prefer)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const productId = Number(params.id);

    if (isNaN(productId)) {
      return NextResponse.json(
        { error: "Invalid product ID" },
        { status: 400 }
      );
    }

    const body = await request.json();

    const productData: {
      ProductCode?: string;
      ProductName?: string;
      BrandId?: number;
      CategoryId?: number;
      WarrantyMonths?: number;
      Description?: string | null;
      IsActive?: boolean;
    } = {
      ProductCode: body.ProductCode,
      ProductName: body.ProductName,
      BrandId: body.BrandId,
      CategoryId: body.CategoryId,
      WarrantyMonths: body.WarrantyMonths,
      Description: body.Description,
      IsActive: body.IsActive
    };

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
      { error: "Failed to update product" },
      { status: 500 }
    );
  }
}

// DELETE /api/products/[id] (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const productId = Number(params.id);

    if (isNaN(productId)) {
      return NextResponse.json(
        { error: "Invalid product ID" },
        { status: 400 }
      );
    }

    const success = await softDeleteProduct(productId);

    if (!success) {
      return NextResponse.json(
        { error: "Product not found or already deleted" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("DELETE /api/products/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete product" },
      { status: 500 }
    );
  }
}
