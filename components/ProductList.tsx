"use client";

import { useEffect, useState } from "react";
import { Card, Button, Space, Tag, Modal, App } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import DataTable from "./DataTable";
import ProductForm from "./ProductForm";
import type { Product } from "@/lib/types/product";

export default function ProductList() {
  const { message } = App.useApp();
  const [data, setData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        const products = await res.json();
        setData(products);
      }
    } catch (error) {
      console.error("Failed to fetch products", error);
      message.error("Lỗi khi tải danh sách sản phẩm");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);



  const columns = [
    {
      title: "Mã SP",
      dataIndex: "ProductCode",
      key: "ProductCode",
    },
    {
      title: "Tên sản phẩm",
      dataIndex: "ProductName",
      key: "ProductName",
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: "Thương hiệu",
      dataIndex: "BrandName",
      key: "BrandName",
    },
    {
      title: "Danh mục",
      dataIndex: "CategoryName",
      key: "CategoryName",
    },
    {
      title: "Bảo hành",
      dataIndex: "WarrantyMonths",
      key: "WarrantyMonths",
      render: (val: number) => `${val} tháng`,
    },
    {
      title: "Trạng thái",
      dataIndex: "IsActive",
      key: "IsActive",
      render: (isActive: boolean) => (
        <Tag color={isActive ? "green" : "red"}>
          {isActive ? "Đang bán" : "Ngừng bán"}
        </Tag>
      ),
    },
    {
      title: "Hành động",
      key: "action",
      render: (_: any, record: Product) => (
        <Space size="middle">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={async () => {
              // Fetch full product with variants and inventory
              try {
                const res = await fetch(`/api/products/${record.ProductId}`);
                if (res.ok) {
                  setEditingProduct(await res.json());
                } else {
                  setEditingProduct(record);
                }
              } catch {
                setEditingProduct(record);
              }
              setIsModalOpen(true);
            }}
          />
        </Space>
      ),
    },
  ];

  return (
    <Card variant="borderless">
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditingProduct(null);
            setIsModalOpen(true);
          }}
        >
          Thêm sản phẩm mới
        </Button>
      </div>

      <DataTable
        rowKey="ProductId"
        columns={columns}
        dataSource={data}
        loading={loading}
        searchFields={["ProductCode", "ProductName", "BrandName", "CategoryName"]}
        searchPlaceholder="Tìm mã, tên, thương hiệu..."
      />

      <Modal
        title={editingProduct ? "Cập nhật sản phẩm" : "Thêm sản phẩm mới"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={800}
        destroyOnHidden
        styles={{ content: { backgroundColor: '#fff' } }}
      >
        <ProductForm
          initialData={editingProduct || undefined}
          onSuccess={() => {
            setIsModalOpen(false);
            fetchProducts();
          }}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>
    </Card>
  );
}
