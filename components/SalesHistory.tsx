"use client";

import { useEffect, useState } from "react";
import { Typography, Card, Tag } from "antd";
import DataTable from "./DataTable";
import type { SalesInvoice } from "@/lib/types/sales";

const { Title } = Typography;

export default function SalesHistory() {
  const [data, setData] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSales() {
      try {
        const res = await fetch("/api/sales", { cache: "no-store" });
        if (res.ok) {
          const invoices = await res.json();
          // Sort by date descending and take top 5
          const sorted = invoices.sort((a: any, b: any) => 
            new Date(b.InvoiceDate).getTime() - new Date(a.InvoiceDate).getTime()
          );
          setData(sorted.slice(0, 5));
        }
      } catch (error) {
        console.error("Failed to fetch recent sales", error);
      } finally {
        setLoading(false);
      }
    }

    fetchSales();
  }, []);

  const columns = [
    {
      title: "Mã hóa đơn",
      dataIndex: "InvoiceCode",
      key: "InvoiceCode",
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: "Ngày lập",
      dataIndex: "InvoiceDate",
      key: "InvoiceDate",
      render: (text: string) => new Date(text).toLocaleString("vi-VN"),
    },
    {
      title: "Khách hàng",
      key: "Customer",
      render: (_: any, record: any) => record.CustomerName || "Khách lẻ",
    },
    {
      title: "Thành tiền",
      dataIndex: "FinalAmount",
      key: "FinalAmount",
      render: (amount: number) => 
        new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount),
    },
  ];

  return (
    <Card variant="borderless">
      <Title level={4}>Giao dịch gần đây</Title>
      <DataTable
        rowKey="InvoiceId"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={false}
      />
    </Card>
  );
}
