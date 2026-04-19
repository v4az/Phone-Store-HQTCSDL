import { NextRequest, NextResponse } from "next/server";
import { getBrandById, updateBrand, softDeleteBrand, hardDeleteBrand } from "@/lib/services";

// GET /api/brands/[id]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paramId } = await params;
    const id = parseInt(paramId);
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

// PUT /api/brands/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paramId } = await params;
    const id = parseInt(paramId);
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

// DELETE /api/brands/[id]
// ?hard=true → hard delete; otherwise soft delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paramId } = await params;
    const id = parseInt(paramId);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const url = new URL(request.url);
    const isHard = url.searchParams.get("hard") === "true";

    const success = isHard
      ? await hardDeleteBrand(id)
      : await softDeleteBrand(id);

    if (!success) {
      return NextResponse.json(
        { error: "Brand not found or could not be deleted" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, hard: isHard },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting brand:", error);
    return NextResponse.json(
      { error: "Internal Server Error or dependency constraint" },
      { status: 500 }
    );
  }
}
