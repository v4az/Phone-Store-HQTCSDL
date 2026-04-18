"use client";

import { useEffect, useState } from "react";
import { Card, Modal, Descriptions, Table, Tag, Button, App } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import DataTable from "./DataTable";
import type { SalesInvoice, SalesInvoiceLine } from "@/lib/types/sales";

const formatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });

export default function SalesTable() {
  const { message } = App.useApp();
  const [data, setData] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<SalesInvoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    async function fetchSales() {
      try {
        const res = await fetch("/api/sales");
        if (res.ok) setData(await res.json());
      } catch {
        message.error("Lỗi khi tải danh sách giao dịch");
      } finally {
        setLoading(false);
      }
    }
    fetchSales();
  }, []);

  const openDetail = async (invoiceId: number) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/sales/${invoiceId}`);
      if (res.ok) {
        setDetail(await res.json());
      } else {
        message.error("Không tìm thấy hóa đơn");
      }
    } catch {
      message.error("Lỗi khi tải chi tiết hóa đơn");
    } finally {
      setDetailLoading(false);
    }
  };

  const columns = [
    {
      title: "Mã hóa đơn",
      dataIndex: "InvoiceCode",
      key: "InvoiceCode",
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: "Khách hàng",
      key: "CustomerName",
      render: (_: unknown, record: SalesInvoice) =>
        record.CustomerName || "Khách lẻ",
    },
    {
      title: "Ngày lập",
      dataIndex: "InvoiceDate",
      key: "InvoiceDate",
      render: (text: string) => new Date(text).toLocaleString("vi-VN"),
    },
    {
      title: "Tổng tiền",
      dataIndex: "TotalAmount",
      key: "TotalAmount",
      render: (v: number) => formatter.format(v),
    },
    {
      title: "Giảm giá",
      dataIndex: "DiscountAmount",
      key: "DiscountAmount",
      render: (v: number) => v > 0 ? <Tag color="orange">-{formatter.format(v)}</Tag> : "—",
    },
    {
      title: "Thành tiền",
      dataIndex: "FinalAmount",
      key: "FinalAmount",
      render: (v: number) => <strong>{formatter.format(v)}</strong>,
    },
    {
      title: "",
      key: "action",
      render: (_: unknown, record: SalesInvoice) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          onClick={() => openDetail(record.InvoiceId)}
        />
      ),
    },
  ];

  // Line item columns for detail modal
  const lineColumns = [
    {
      title: "Sản phẩm",
      key: "product",
      render: (_: unknown, line: SalesInvoiceLine) => (
        <>
          <strong>{line.ProductName}</strong>
          <br />
          <small>
            {[line.Color, line.Storage].filter(Boolean).join(" / ") || ""} [SKU: {line.Sku}]
          </small>
        </>
      ),
    },
    {
      title: "Đơn giá",
      dataIndex: "UnitPrice",
      key: "UnitPrice",
      render: (v: number) => formatter.format(v),
    },
    {
      title: "SL",
      dataIndex: "Quantity",
      key: "Quantity",
    },
    {
      title: "Giảm (%)",
      dataIndex: "DiscountPct",
      key: "DiscountPct",
      render: (v: number) => v > 0 ? `${v}%` : "—",
    },
    {
      title: "Thành tiền",
      dataIndex: "LineTotal",
      key: "LineTotal",
      render: (v: number) => <strong>{formatter.format(v)}</strong>,
    },
  ];

  return (
    <Card variant="borderless">
      <DataTable
        rowKey="InvoiceId"
        columns={columns}
        dataSource={data}
        loading={loading}
        searchFields={["InvoiceCode", "CustomerName"]}
        searchPlaceholder="Tìm mã hóa đơn, tên khách..."
      />

      <Modal
        title={`Chi tiết hóa đơn: ${detail?.InvoiceCode || ""}`}
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
        width={800}
        loading={detailLoading}
        destroyOnHidden
      >
        {detail && (
          <>
            <Descriptions column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Mã hóa đơn">{detail.InvoiceCode}</Descriptions.Item>
              <Descriptions.Item label="Ngày lập">
                {new Date(detail.InvoiceDate).toLocaleString("vi-VN")}
              </Descriptions.Item>
              <Descriptions.Item label="Khách hàng">
                {detail.CustomerName || "Khách lẻ"}
              </Descriptions.Item>
              <Descriptions.Item label="SĐT">
                {detail.CustomerPhone || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Tổng tiền">{formatter.format(detail.TotalAmount)}</Descriptions.Item>
              <Descriptions.Item label="Giảm giá">{formatter.format(detail.DiscountAmount)}</Descriptions.Item>
              <Descriptions.Item label="Thành tiền">
                <strong style={{ color: "#1677ff" }}>{formatter.format(detail.FinalAmount)}</strong>
              </Descriptions.Item>
            </Descriptions>

            <Table
              rowKey="LineNo"
              columns={lineColumns}
              dataSource={detail.Lines || []}
              pagination={false}
              size="small"
            />
          </>
        )}
      </Modal>
    </Card>
  );
}
