"use client";

import { Row, Col, Typography } from "antd";
import { DollarOutlined, ShoppingCartOutlined, AppstoreOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import StatsCard from "./StatsCard";

const { Title } = Typography;

export default function DashboardStats() {
  const [loading, setLoading] = useState(true);
  const [salesCount, setSalesCount] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [productCount, setProductCount] = useState(0);

  useEffect(() => {
    async function fetchData() {
      try {
        const [reportsRes, productsRes] = await Promise.all([
          fetch("/api/reports?interval=month"),
          fetch("/api/products")
        ]);

        if (reportsRes.ok) {
          const { data } = await reportsRes.json();
          if (data && data.length > 0) {
            const latest = data[data.length - 1]; // Assume the latest period is last
            setSalesCount(latest.SalesCount || 0);
            setRevenue(latest.FinalAmount || 0);
          }
        }

        if (productsRes.ok) {
          const products = await productsRes.json();
          setProductCount(products.length || 0);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard stats", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const formatter = new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  });

  return (
    <div style={{ marginBottom: 32 }}>
      <Title level={4}>Thống kê tháng này</Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <StatsCard
            title="Doanh thu"
            value={formatter.format(revenue)}
            prefix={<DollarOutlined style={{ color: '#52c41a' }} />}
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={8}>
          <StatsCard
            title="Số đơn hàng"
            value={salesCount}
            prefix={<ShoppingCartOutlined style={{ color: '#1677ff' }} />}
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={8}>
          <StatsCard
            title="Sản phẩm đang kinh doanh"
            value={productCount}
            prefix={<AppstoreOutlined style={{ color: '#faad14' }} />}
            loading={loading}
          />
        </Col>
      </Row>
    </div>
  );
}
