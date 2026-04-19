// Products page — /products
// - Fetch and display product list from /api/products
// - Form to create a new product (POST to /api/products)
// - "use client" for interactivity

import PageHeader from "@/components/PageHeader";
import ProductList from "@/components/ProductList";

export default function ProductsPage() {
  return (
    <div>
      <PageHeader
        title="Quản lý Sản phẩm"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Sản phẩm" },
        ]}
      />
      <ProductList />
    </div>
  );
}
