// Home page — /
// Simple landing with links to main sections

import PageHeader from "@/components/PageHeader";
import DashboardStats from "@/components/DashboardStats";
import SalesHistory from "@/components/SalesHistory";

export default function Home() {
  return (
    <div>
      <PageHeader
        title="Tổng quan hệ thống"
      />
      <DashboardStats />
      <SalesHistory />
    </div>
  );
}
