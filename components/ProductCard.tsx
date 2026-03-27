"use client";

import { Card, Tag, Typography, Image } from "antd";
import type { Product, ProductVariant } from "@/lib/types/product";

const { Text, Title } = Typography;

export interface ProductCardProps {
  product: Product;
  variant: ProductVariant;
  brandName?: string;
  onClick?: () => void;
}

export default function ProductCard({
  product,
  variant,
  brandName,
  onClick,
}: ProductCardProps) {
  const formatter = new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  });

  return (
    <Card
      hoverable
      onClick={onClick}
      cover={
        <Image
          alt={product.ProductName}
          src={variant.ImageUrl || "/placeholder.png"}
          fallback="/placeholder.png"
          preview={false}
          style={{ height: 200, objectFit: "contain", padding: 12 }}
        />
      }
    >
      <Card.Meta
        title={
          <Title level={5} style={{ marginBottom: 0 }}>
            {product.ProductName}
          </Title>
        }
        description={
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {brandName && <Text type="secondary">{brandName}</Text>}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {variant.Color && <Tag color="blue">{variant.Color}</Tag>}
              {variant.Storage && <Tag color="green">{variant.Storage}</Tag>}
            </div>
            <Text strong style={{ fontSize: 16 }}>
              {formatter.format(variant.RetailPrice)}
            </Text>
            {!variant.IsActive && <Tag color="red">Ngừng kinh doanh</Tag>}
          </div>
        }
      />
    </Card>
  );
}
