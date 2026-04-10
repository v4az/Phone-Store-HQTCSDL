import { NextResponse } from "next/server";
import { getBrandById, updateBrand, deleteBrand } from "@/lib/services/brands";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }
    const brand = await getBrandById(id);
    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }
    return NextResponse.json(brand);
  } catch (error) {
    console.error("Error fetching brand:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }
    const body = await request.json();
    const updatedBrand = await updateBrand(id, body);
    if (!updatedBrand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }
    return NextResponse.json(updatedBrand);
  } catch (error) {
    console.error("Error updating brand:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }
    const success = await deleteBrand(id);
    if (!success) {
      return NextResponse.json({ error: "Brand not found or could not be deleted" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting brand:", error);
    // Might fail due to foreign key constraints
    return NextResponse.json({ error: "Internal Server Error or dependency constraint" }, { status: 500 });
  }
}
