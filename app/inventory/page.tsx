// Inventory page — /inventory
// - Fetch and display stock levels from /api/inventory
// - Show SKU, product name, location, quantity on hand, quantity reserved
// - "use client" for interactivity

import PageHeader from "@/components/PageHeader";
import InventoryTable from "@/components/InventoryTable";

export default function InventoryPage() {
  return (
    <div>
      <PageHeader
        title="Quản lý Tồn kho"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Tồn kho" },
        ]}
      />
      <InventoryTable />
    </div>
  );
}
