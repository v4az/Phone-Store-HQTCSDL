"use client";

import { Radio, Space, Typography } from "antd";
import type { ProductVariant } from "@/lib/types/product";

const { Text } = Typography;

interface VariantSelectorProps {
  variants: ProductVariant[];
  selectedVariantId?: number;
  onChange?: (variantId: number) => void;
}

export default function VariantSelector({
  variants,
  selectedVariantId,
  onChange,
}: VariantSelectorProps) {
  const colors = [...new Set(variants.map((v) => v.Color).filter(Boolean))];
  const storages = [...new Set(variants.map((v) => v.Storage).filter(Boolean))];

  const selected = variants.find((v) => v.VariantId === selectedVariantId);

  return (
    <Space direction="vertical" size="middle">
      {colors.length > 0 && (
        <div>
          <Text strong>Màu sắc</Text>
          <br />
          <Radio.Group
            value={selected?.Color}
            onChange={(e) => {
              const match = variants.find(
                (v) =>
                  v.Color === e.target.value &&
                  (selected?.Storage ? v.Storage === selected.Storage : true),
              );
              if (match) onChange?.(match.VariantId);
            }}
          >
            <Space>
              {colors.map((c) => (
                <Radio.Button key={c} value={c}>
                  {c}
                </Radio.Button>
              ))}
            </Space>
          </Radio.Group>
        </div>
      )}
      {storages.length > 0 && (
        <div>
          <Text strong>Dung lượng</Text>
          <br />
          <Radio.Group
            value={selected?.Storage}
            onChange={(e) => {
              const match = variants.find(
                (v) =>
                  v.Storage === e.target.value &&
                  (selected?.Color ? v.Color === selected.Color : true),
              );
              if (match) onChange?.(match.VariantId);
            }}
          >
            <Space>
              {storages.map((s) => (
                <Radio.Button key={s} value={s}>
                  {s}
                </Radio.Button>
              ))}
            </Space>
          </Radio.Group>
        </div>
      )}
    </Space>
  );
}
