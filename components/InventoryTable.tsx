"use client";

import { useEffect, useState } from "react";
import { Card, Tag, Typography } from "antd";
import DataTable from "./DataTable";

const { Title } = Typography;

export default function InventoryTable() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchInventory() {
      try {
        const res = await fetch("/api/inventory", { cache: "no-store" });
        if (res.ok) {
          const result = await res.json();
          setData(result);
        }
      } catch (error) {
        console.error("Failed to fetch inventory", error);
      } finally {
        setLoading(false);
      }
    }

    fetchInventory();
  }, []);

  const columns = [
    {
      title: "Mã SP / SKU",
      dataIndex: "Sku",
      key: "Sku",
      render: (text: string, record: any) => (
        <span>
          <strong>{record.ProductCode}</strong><br />
          <small className="text-gray-500">{text}</small>
        </span>
      ),
    },
    {
      title: "Sản phẩm",
      dataIndex: "ProductName",
      key: "ProductName",
    },
    {
      title: "Vị trí",
      dataIndex: "LocationName",
      key: "LocationName",
    },
    {
      title: "Tồn kho",
      dataIndex: "QuantityOnHand",
      key: "QuantityOnHand",
      render: (qty: number) => {
        let color = "green";
        if (qty < 10) color = "orange";
        if (qty <= 0) color = "red";
        return <Tag color={color}>{qty}</Tag>;
      },
    },
    {
      title: "Đã đặt",
      dataIndex: "QuantityReserved",
      key: "QuantityReserved",
      render: (qty: number) => <Tag color={qty > 0 ? "blue" : "default"}>{qty}</Tag>,
    },
    {
      title: "Khả dụng",
      key: "Available",
      render: (_: any, record: any) => {
        const available = (record.QuantityOnHand || 0) - (record.QuantityReserved || 0);
        return <strong>{available}</strong>;
      },
    },
  ];

  return (
    <Card variant="borderless">
      <Title level={4}>Danh sách tồn kho</Title>
      <DataTable
        rowKey={(record: any) => `${record.VariantId}-${record.LocationId}`}
        columns={columns}
        dataSource={data}
        loading={loading}
        searchFields={["ProductCode", "ProductName", "Sku", "LocationName"]}
        searchPlaceholder="Tìm kiếm tên, SKU, vị trí..."
      />
    </Card>
  );
}
