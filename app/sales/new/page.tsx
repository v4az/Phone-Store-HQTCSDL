// New Sale page — /sales/new
// - Form to create a sales invoice with line items
// - POST to /api/sales
// - "use client" for interactivity

import PageHeader from "@/components/PageHeader";
import SaleForm from "@/components/SaleForm";

export default function NewSalePage() {
  return (
    <div>
      <PageHeader
        title="Tạo Đơn Hàng Mới"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Tạo đơn" },
        ]}
      />
      <SaleForm />
    </div>
  );
}
