import { NextResponse } from "next/server";
import { getBrands, createBrand } from "@/lib/services/brands";

export async function GET() {
  try {
    const brands = await getBrands();
    return NextResponse.json(brands);
  } catch (error) {
    console.error("Error fetching brands:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.BrandName) {
      return NextResponse.json({ error: "BrandName is required" }, { status: 400 });
    }
    const newBrand = await createBrand(body);
    return NextResponse.json(newBrand, { status: 201 });
  } catch (error) {
    console.error("Error creating brand:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
