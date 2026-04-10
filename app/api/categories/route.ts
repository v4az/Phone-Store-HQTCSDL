import { NextResponse } from "next/server";
import { getCategories, createCategory } from "@/lib/services/categories";

export async function GET() {
  try {
    const categories = await getCategories();
    return NextResponse.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.CategoryName) {
      return NextResponse.json({ error: "CategoryName is required" }, { status: 400 });
    }
    const newCategory = await createCategory(body);
    return NextResponse.json(newCategory, { status: 201 });
  } catch (error) {
    console.error("Error creating category:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
