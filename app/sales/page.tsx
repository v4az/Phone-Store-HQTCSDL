// Sales list page — /sales
// Displays all transactions with detail view

import PageHeader from "@/components/PageHeader";
import SalesTable from "@/components/SalesTable";

export default function SalesPage() {
  return (
    <div>
      <PageHeader
        title="Lịch sử giao dịch"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Giao dịch" },
        ]}
      />
      <SalesTable />
    </div>
  );
}
