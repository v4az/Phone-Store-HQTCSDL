// Product service layer
// Handles all database operations for Product and ProductVariant tables
// - getProducts(): fetch product list with brand/category joins
// - createProduct(): insert product + optional variant in a transaction
// - updateProduct(), deleteProduct(), etc.
//
// Usage: import { getPool } from "@/lib/db";
