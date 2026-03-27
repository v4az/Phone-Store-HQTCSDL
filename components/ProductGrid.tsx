"use client";

import { Row, Col, Empty } from "antd";
import ProductCard, { type ProductCardProps } from "./ProductCard";

export interface ProductGridItem
  extends Omit<ProductCardProps, "onClick"> {
  key: string | number;
}

interface ProductGridProps {
  items: ProductGridItem[];
  onItemClick?: (item: ProductGridItem) => void;
}

export default function ProductGrid({ items, onItemClick }: ProductGridProps) {
  if (items.length === 0) {
    return <Empty description="Không có sản phẩm" />;
  }

  return (
    <Row gutter={[16, 16]}>
      {items.map((item) => (
        <Col key={item.key} xs={24} sm={12} md={8} lg={6}>
          <ProductCard
            product={item.product}
            variant={item.variant}
            brandName={item.brandName}
            onClick={() => onItemClick?.(item)}
          />
        </Col>
      ))}
    </Row>
  );
}
