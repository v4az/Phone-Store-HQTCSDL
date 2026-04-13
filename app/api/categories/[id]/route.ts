import { NextRequest, NextResponse } from "next/server";
import { getCategoryById, updateCategory, softDeleteCategory, hardDeleteCategory } from "@/lib/services";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const category = await getCategoryById(id);
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    return NextResponse.json(category);
  } catch (error) {
    console.error("Error fetching category:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();
    const updatedCategory = await updateCategory(id, body);

    if (!updatedCategory) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    return NextResponse.json(updatedCategory);
  } catch (error) {
    console.error("Error updating category:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/categories/[id]
 * - Default: soft delete (set IsActive = 0)
 * - Optional: ?hard=true → physical DELETE from table
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const url = new URL(request.url);
    const isHard = url.searchParams.get("hard") === "true";

    const success = isHard
      ? await hardDeleteCategory(id)
      : await softDeleteCategory(id);

    if (!success) {
      return NextResponse.json(
        { error: "Category not found or could not be deleted" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, hard: isHard },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting category:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
